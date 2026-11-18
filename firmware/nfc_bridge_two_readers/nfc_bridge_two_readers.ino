// nfc_bridge – top-up kiosk card readers: Arduino Uno + PN532 (I2C) + RC522 (SPI) <-> Next.js over USB serial
// Two readers: the PN532 reads EZ-link cards (and runs the commands below), the RC522 reads bank cards.
// Wiring: PN532 SDA -> SDA, SCL -> SCL, VCC -> 5V, GND -> GND (IRQ/RESET not used)
// PN532 DIP switches: I2C mode (1 = ON, 2 = OFF)
// RC522 wiring: 3.3V -> 3.3V (NOT 5V), GND -> GND, SDA(SS) -> 10, SCK -> 13, MOSI -> 11,
//               MISO -> 12, RST -> 9, IRQ not used
// Card layout: see card_format.h (shared with the Raspberry Pi gantry)
//
// ---------------- PROTOCOL v4 (115200 baud, one message per line) ----------------
// Arduino -> app: one JSON object per line
//   {"t":"ready","proto":4,"reader":"ok"|"lost","bank":"ok"|"lost"}   Uno started
//   Every tap and removed carries "src": "ezlink" (PN532) or "bank" (RC522).
//   Bank taps report the UID only, and commands only ever use the EZ-link reader.
//   {"t":"status","reader":"ok"|"lost"}            reader stopped responding / recovered
//   {"t":"tap","uid":"0453F3973E0289","format":"ok","card":{...}}
//        format: ok | blank | unknown | unreadable | unsupported   (card only when ok)
//        card: {"type":"ezlink"|"bank","balance":1250,"seq":42,
//               "inside":false,"station":0,"lastFare":150}
//   {"t":"removed","uid":"0453F3973E0289"}         the card that tapped has left the reader
//   {"t":"res","id":7,"ok":true,...}               reply to a command
//   {"t":"res","id":7,"ok":false,"err":"stale"}
//
// App -> Arduino: plain text, one command per line
//   PING   <id>
//   READ   <id>                                     read the card on the reader now
//   SETUP  <id> <uid> <EZLINK|BANK> <balanceCents>  (re)initialise a card; clears tap-in state
//   ADJUST <id> <uid> <seq> <deltaCents>            add (or subtract, if negative) to the balance
//
// Errors: bad_command | reader_lost | card_removed | wrong_card | unsupported | read_failed |
//         not_set_up | stale | insufficient_funds | write_failed | verify_failed

#include <Wire.h>
#include <Adafruit_PN532.h>
#include <SPI.h>
#include <MFRC522.h>
#include "card_format.h"

Adafruit_PN532 nfc(2, 3);  // pins unused, not wired
MFRC522 bankReader(10, 9);  // RC522: SS on pin 10, RST on pin 9

const uint8_t PROTOCOL_VERSION = 4;
const uint8_t CLASSIC_BLOCK_A = 4;  // slot B = block 5 (same sector)
const uint8_t NTAG_PAGE_A = 4;      // slot B = pages 8-11
uint8_t KEY_A[6] = { 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF };  // factory default key

const unsigned long REMOVE_AFTER_MS = 600;   // card unseen this long = removed
const unsigned long HEALTH_CHECK_MS = 5000;  // how often to check the reader is still alive

bool readerOk = false;
bool cardPresent = false;
uint8_t lastUid[7];
uint8_t lastUidLen = 0;
unsigned long lastSeenMs = 0;
unsigned long lastHealthMs = 0;
char cmdBuf[64];

bool bankOk = false;
bool bankCardPresent = false;
uint8_t bankUid[10];
uint8_t bankUidLen = 0;
unsigned long bankLastSeenMs = 0;
uint8_t cmdLen = 0;

// ---------- reader ----------

bool startReader() {
  nfc.begin();
  if (!nfc.getFirmwareVersion()) return false;
  return nfc.SAMConfig();
}

void printReaderState() {
  Serial.print(readerOk ? F("ok") : F("lost"));
}

// Restarts the PN532 if it stops answering, so you don't have to unplug it
void checkReaderHealth() {
  bool busGlitch = Wire.getWireTimeoutFlag();
  if (busGlitch) Wire.clearWireTimeoutFlag();
  if (!busGlitch && millis() - lastHealthMs < HEALTH_CHECK_MS) return;
  lastHealthMs = millis();

  bool ok = !busGlitch && nfc.getFirmwareVersion() != 0;
  if (!ok) ok = startReader();

  if (ok != readerOk) {
    readerOk = ok;
    Serial.print(F("{\"t\":\"status\",\"reader\":\""));
    printReaderState();
    Serial.println(F("\"}"));
  }
}

// ---------- card access ----------

bool supportedCard(uint8_t uidLen) {
  return uidLen == 4 || uidLen == 7;  // MIFARE Classic, or NTAG / Ultralight
}

// MIFARE Classic needs the sector unlocked once after selecting the card; NTAG needs nothing
bool unlockCard(uint8_t *uid, uint8_t uidLen) {
  if (uidLen != 4) return true;
  return nfc.mifareclassic_AuthenticateBlock(uid, uidLen, CLASSIC_BLOCK_A, 0, KEY_A);
}

bool readSlots(uint8_t uidLen, uint8_t *slotA, uint8_t *slotB) {
  if (uidLen == 4) {
    return nfc.mifareclassic_ReadDataBlock(CLASSIC_BLOCK_A, slotA) &&
           nfc.mifareclassic_ReadDataBlock(CLASSIC_BLOCK_A + 1, slotB);
  }
  for (uint8_t i = 0; i < 4; i++) {
    if (!nfc.ntag2xx_ReadPage(NTAG_PAGE_A + i, slotA + i * 4)) return false;
    if (!nfc.ntag2xx_ReadPage(NTAG_PAGE_A + 4 + i, slotB + i * 4)) return false;
  }
  return true;
}

// On NTAG a slot spans 4 pages, so the first page is blanked first and written last.
// Until that last write lands, the slot has no 'GO' marker and can't be mistaken for valid.
bool writeSlot(uint8_t uidLen, uint8_t slot, uint8_t *data) {
  if (uidLen == 4) {
    return nfc.mifareclassic_WriteDataBlock(CLASSIC_BLOCK_A + slot, data);
  }
  uint8_t first = NTAG_PAGE_A + slot * 4;
  uint8_t zeros[4] = { 0, 0, 0, 0 };
  if (!nfc.ntag2xx_WritePage(first, zeros)) return false;
  for (uint8_t i = 1; i < 4; i++) {
    if (!nfc.ntag2xx_WritePage(first + i, data + i * 4)) return false;
  }
  return nfc.ntag2xx_WritePage(first, data);
}

// ---------- output ----------

void printUid(const uint8_t *uid, uint8_t len) {
  for (uint8_t i = 0; i < len; i++) {
    if (uid[i] < 0x10) Serial.print('0');
    Serial.print(uid[i], HEX);
  }
}

void printFormat(uint8_t state) {
  if (state == CARD_OK) Serial.print(F("ok"));
  else if (state == CARD_BLANK) Serial.print(F("blank"));
  else Serial.print(F("unknown"));
}

void printCard(const CardRecord &r) {
  Serial.print(F("{\"type\":\""));
  Serial.print(r.type == CARD_TYPE_BANK ? F("bank") : F("ezlink"));
  Serial.print(F("\",\"balance\":"));
  Serial.print(r.balance);
  Serial.print(F(",\"seq\":"));
  Serial.print(r.seq);
  Serial.print(F(",\"inside\":"));
  Serial.print((r.flags & CARD_FLAG_INSIDE) ? F("true") : F("false"));
  Serial.print(F(",\"station\":"));
  Serial.print(r.station);
  Serial.print(F(",\"lastFare\":"));
  Serial.print(r.lastFare);
  Serial.print('}');
}

// Prints  "uid":"...","format":"...","card":{...}  (no surrounding braces)
void printCardFields(const uint8_t *uid, uint8_t uidLen, uint8_t state, const CardRecord &r) {
  Serial.print(F("\"uid\":\""));
  printUid(uid, uidLen);
  Serial.print(F("\",\"format\":\""));
  printFormat(state);
  Serial.print('"');
  if (state == CARD_OK) {
    Serial.print(F(",\"card\":"));
    printCard(r);
  }
}

void replyError(long id, const __FlashStringHelper *err) {
  Serial.print(F("{\"t\":\"res\",\"id\":"));
  Serial.print(id);
  Serial.print(F(",\"ok\":false,\"err\":\""));
  Serial.print(err);
  Serial.println(F("\"}"));
}

void replyStart(long id) {
  Serial.print(F("{\"t\":\"res\",\"id\":"));
  Serial.print(id);
  Serial.print(F(",\"ok\":true,"));
}

// ---------- taps and removals ----------

void reportTap(uint8_t *uid, uint8_t uidLen) {
  Serial.print(F("{\"t\":\"tap\",\"src\":\"ezlink\",\"uid\":\""));
  printUid(uid, uidLen);
  Serial.print(F("\",\"format\":\""));

  if (!supportedCard(uidLen)) {
    Serial.println(F("unsupported\"}"));
    return;
  }

  uint8_t slotA[CARD_RECORD_SIZE], slotB[CARD_RECORD_SIZE];
  if (!unlockCard(uid, uidLen) || !readSlots(uidLen, slotA, slotB)) {
    Serial.println(F("unreadable\"}"));
    return;
  }

  CardRecord rec;
  uint8_t slot;
  uint8_t state = pickCurrent(slotA, slotB, rec, slot);
  printFormat(state);
  Serial.print('"');
  if (state == CARD_OK) {
    Serial.print(F(",\"card\":"));
    printCard(rec);
  }
  Serial.println('}');
}

void reportRemoved() {
  cardPresent = false;
  Serial.print(F("{\"t\":\"removed\",\"src\":\"ezlink\",\"uid\":\""));
  printUid(lastUid, lastUidLen);
  Serial.println(F("\"}"));
}

void pollForCard() {
  uint8_t uid[7];
  uint8_t uidLen;

  if (!nfc.readPassiveTargetID(PN532_MIFARE_ISO14443A, uid, &uidLen, 100)) {
    // Several empty polls in a row means the card has been taken away.
    // (One missed poll alone can happen while a card is still held.)
    if (cardPresent && millis() - lastSeenMs > REMOVE_AFTER_MS) reportRemoved();
    return;
  }

  unsigned long now = millis();
  lastSeenMs = now;
  lastHealthMs = now;  // a successful read proves the reader is alive

  bool sameCard = cardPresent && uidLen == lastUidLen && memcmp(uid, lastUid, uidLen) == 0;
  if (sameCard) return;              // still held: report each tap once, not every poll
  if (cardPresent) reportRemoved();  // swapped straight to a different card

  memcpy(lastUid, uid, uidLen);
  lastUidLen = uidLen;
  cardPresent = true;
  reportTap(uid, uidLen);
}

// ---------- bank card reader (RC522) ----------

bool startBankReader() {
  bankReader.PCD_Init();
  byte version = bankReader.PCD_ReadRegister(MFRC522::VersionReg);
  return version != 0x00 && version != 0xFF;  // 0x00 / 0xFF = no reader answering
}

void reportBankRemoved() {
  bankCardPresent = false;
  Serial.print(F("{\"t\":\"removed\",\"src\":\"bank\",\"uid\":\""));
  printUid(bankUid, bankUidLen);
  Serial.println(F("\"}"));
}

// A held card is halted after each read, and WUPA (unlike REQA) wakes halted cards,
// so a card left on the reader keeps being seen and is reported once, not every poll.
void pollBankReader() {
  if (!bankOk) return;
  bankReader.PCD_WriteRegister(MFRC522::TxModeReg, 0x00);
  bankReader.PCD_WriteRegister(MFRC522::RxModeReg, 0x00);
  bankReader.PCD_WriteRegister(MFRC522::ModWidthReg, 0x26);

  byte atqa[2];
  byte atqaSize = sizeof(atqa);
  MFRC522::StatusCode status = bankReader.PICC_WakeupA(atqa, &atqaSize);
  bool seen = (status == MFRC522::STATUS_OK || status == MFRC522::STATUS_COLLISION) &&
              bankReader.PICC_ReadCardSerial();
  if (!seen) {
    if (bankCardPresent && millis() - bankLastSeenMs > REMOVE_AFTER_MS) reportBankRemoved();
    return;
  }
  bankReader.PICC_HaltA();
  bankLastSeenMs = millis();

  const MFRC522::Uid &card = bankReader.uid;
  bool sameCard = bankCardPresent && card.size == bankUidLen && memcmp(card.uidByte, bankUid, card.size) == 0;
  if (sameCard) return;
  if (bankCardPresent) reportBankRemoved();  // swapped straight to a different card

  memcpy(bankUid, card.uidByte, card.size);
  bankUidLen = card.size;
  bankCardPresent = true;
  Serial.print(F("{\"t\":\"tap\",\"src\":\"bank\",\"uid\":\""));
  printUid(bankUid, bankUidLen);
  Serial.println(F("\"}"));
}

// ---------- commands ----------

bool uidMatches(const uint8_t *uid, uint8_t len, const char *hex) {
  if (!hex || strlen(hex) != (size_t)len * 2) return false;
  for (uint8_t i = 0; i < len; i++) {
    char part[3] = { hex[i * 2], hex[i * 2 + 1], 0 };
    if ((uint8_t)strtoul(part, NULL, 16) != uid[i]) return false;
  }
  return true;
}

// Selects the card on the reader and reads both slots. Replies with an error and
// returns false if anything goes wrong. wantUid = NULL accepts any card.
bool openCard(long id, const char *wantUid, uint8_t *uid, uint8_t &uidLen,
              uint8_t *slotA, uint8_t *slotB) {
  if (!readerOk) { replyError(id, F("reader_lost")); return false; }
  if (!nfc.readPassiveTargetID(PN532_MIFARE_ISO14443A, uid, &uidLen, 300)) {
    replyError(id, F("card_removed"));
    return false;
  }
  lastSeenMs = millis();
  if (wantUid && !uidMatches(uid, uidLen, wantUid)) { replyError(id, F("wrong_card")); return false; }
  if (!supportedCard(uidLen)) { replyError(id, F("unsupported")); return false; }
  if (!unlockCard(uid, uidLen) || !readSlots(uidLen, slotA, slotB)) {
    replyError(id, F("read_failed"));
    return false;
  }
  return true;
}

// Writes rec into the given slot, reads it back, and replies
void commitRecord(long id, uint8_t *uid, uint8_t uidLen, uint8_t slot, const CardRecord &rec) {
  uint8_t data[CARD_RECORD_SIZE];
  encodeRecord(rec, data);
  if (!writeSlot(uidLen, slot, data)) return replyError(id, F("write_failed"));

  uint8_t slotA[CARD_RECORD_SIZE], slotB[CARD_RECORD_SIZE];
  CardRecord check;
  uint8_t checkSlot;
  if (!readSlots(uidLen, slotA, slotB) ||
      pickCurrent(slotA, slotB, check, checkSlot) != CARD_OK ||
      checkSlot != slot || memcmp(slot == 0 ? slotA : slotB, data, CARD_RECORD_SIZE) != 0) {
    return replyError(id, F("verify_failed"));
  }

  lastSeenMs = millis();  // card is still on the reader; don't report it as removed
  replyStart(id);
  printCardFields(uid, uidLen, CARD_OK, rec);
  Serial.println('}');
}

void cmdRead(long id) {
  uint8_t uid[7], uidLen, slotA[CARD_RECORD_SIZE], slotB[CARD_RECORD_SIZE];
  if (!openCard(id, NULL, uid, uidLen, slotA, slotB)) return;

  CardRecord rec;
  uint8_t slot;
  uint8_t state = pickCurrent(slotA, slotB, rec, slot);
  replyStart(id);
  printCardFields(uid, uidLen, state, rec);
  Serial.println('}');
}

void cmdSetup(long id, const char *wantUid, const char *typeStr, const char *balanceStr) {
  uint8_t type;
  if (strcmp(typeStr, "EZLINK") == 0) type = CARD_TYPE_EZLINK;
  else if (strcmp(typeStr, "BANK") == 0) type = CARD_TYPE_BANK;
  else return replyError(id, F("bad_command"));

  uint8_t uid[7], uidLen, slotA[CARD_RECORD_SIZE], slotB[CARD_RECORD_SIZE];
  if (!openCard(id, wantUid, uid, uidLen, slotA, slotB)) return;

  CardRecord cur, rec;
  uint8_t curSlot = 1;  // so a blank card is written to slot A first
  bool hasRecord = pickCurrent(slotA, slotB, cur, curSlot) == CARD_OK;

  rec.type = type;
  rec.seq = hasRecord ? cur.seq + 1 : 1;
  rec.balance = atol(balanceStr);
  rec.flags = 0;
  rec.station = 0;
  rec.lastFare = 0;
  commitRecord(id, uid, uidLen, hasRecord ? 1 - curSlot : 0, rec);
}

void cmdAdjust(long id, const char *wantUid, const char *seqStr, const char *deltaStr) {
  uint8_t uid[7], uidLen, slotA[CARD_RECORD_SIZE], slotB[CARD_RECORD_SIZE];
  if (!openCard(id, wantUid, uid, uidLen, slotA, slotB)) return;

  CardRecord rec;
  uint8_t curSlot;
  if (pickCurrent(slotA, slotB, rec, curSlot) != CARD_OK) return replyError(id, F("not_set_up"));
  // The app must send the seq it saw in the tap; if the card changed since, refuse
  if (rec.seq != (uint16_t)strtoul(seqStr, NULL, 10)) return replyError(id, F("stale"));

  int32_t newBalance = rec.balance + atol(deltaStr);
  if (newBalance < 0) return replyError(id, F("insufficient_funds"));

  rec.balance = newBalance;
  rec.seq++;
  commitRecord(id, uid, uidLen, 1 - curSlot, rec);
}

void handleCommand(char *line) {
  char *name = strtok(line, " ");
  char *idStr = strtok(NULL, " ");
  if (!name || !idStr) return replyError(-1, F("bad_command"));
  long id = atol(idStr);
  char *a = strtok(NULL, " ");
  char *b = strtok(NULL, " ");
  char *c = strtok(NULL, " ");

  if (strcmp(name, "PING") == 0) {
    replyStart(id);
    Serial.print(F("\"proto\":"));
    Serial.print(PROTOCOL_VERSION);
    Serial.print(F(",\"reader\":\""));
    printReaderState();
    Serial.println(F("\"}"));
  } else if (strcmp(name, "READ") == 0) {
    cmdRead(id);
  } else if (strcmp(name, "SETUP") == 0 && c) {
    cmdSetup(id, a, b, c);
  } else if (strcmp(name, "ADJUST") == 0 && c) {
    cmdAdjust(id, a, b, c);
  } else {
    replyError(id, F("bad_command"));
  }
}

void readCommands() {
  while (Serial.available()) {
    char ch = Serial.read();
    if (ch == '\r') continue;
    if (ch == '\n') {
      cmdBuf[cmdLen] = '\0';
      if (cmdLen > 0) handleCommand(cmdBuf);
      cmdLen = 0;
    } else if (cmdLen < sizeof(cmdBuf) - 1) {
      cmdBuf[cmdLen++] = ch;
    }
  }
}

// ---------- main ----------

void setup() {
  Serial.begin(115200);
  Wire.begin();
  Wire.setWireTimeout(25000, true);  // never let the I2C bus freeze the Uno

  readerOk = startReader();
  SPI.begin();
  bankOk = startBankReader();
  lastHealthMs = millis();

  Serial.print(F("{\"t\":\"ready\",\"proto\":"));
  Serial.print(PROTOCOL_VERSION);
  Serial.print(F(",\"reader\":\""));
  printReaderState();
  Serial.print(F("\",\"bank\":\""));
  Serial.print(bankOk ? F("ok") : F("lost"));
  Serial.println(F("\"}"));
}

void loop() {
  readCommands();
  checkReaderHealth();
  if (readerOk) pollForCard();
  else if (cardPresent) reportRemoved();  // reader lost: don't leave a card "stuck" on
  pollBankReader();
}

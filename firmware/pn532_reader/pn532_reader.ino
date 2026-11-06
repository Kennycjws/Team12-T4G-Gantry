// Reads cards from a PN532 and reports them over USB serial to bridge/reader.mjs.
//
//   present <UID>   a card arrived, UID in uppercase hex
//   removed         the card left the reader
//   error <text>    something is wrong with the PN532
//
// Wiring for an Arduino Uno (PN532 switches set to I2C): VCC-5V, GND-GND, SDA-A4, SCL-A5.
#include <Adafruit_PN532.h>
#include <Wire.h>

const unsigned long BAUD_RATE = 115200;
const uint16_t POLL_TIMEOUT_MS = 100;

// The PN532 has no "card left" signal, and a card on the reader can miss the odd poll.
// So a card only counts as removed after this long without being seen.
const unsigned long REMOVED_AFTER_MS = 500;

// The library requires IRQ and RESET pins, but neither needs wiring: over I2C it polls a
// ready byte instead. Pins 2 and 3 are just left free for this.
const uint8_t IRQ_PIN = 2;
const uint8_t RESET_PIN = 3;

Adafruit_PN532 nfc(IRQ_PIN, RESET_PIN, &Wire);

String currentUid;
unsigned long lastSeenAt = 0;

String toHex(const uint8_t *bytes, uint8_t length) {
  String hex;
  for (uint8_t i = 0; i < length; i++) {
    if (bytes[i] < 0x10) hex += '0';
    hex += String(bytes[i], HEX);
  }
  hex.toUpperCase();
  return hex;
}

void setup() {
  Serial.begin(BAUD_RATE);

  // Keep trying, so a loose wire can be fixed without pressing reset.
  while (!nfc.begin() || !nfc.getFirmwareVersion()) {
    Serial.println(F("error PN532 not found. Check the wiring and the I2C switches."));
    delay(1000);
  }
  nfc.SAMConfig();
  Serial.println(F("ready"));
}

void loop() {
  uint8_t uid[10]; // longest ISO14443A UID
  uint8_t uidLength = 0;

  if (nfc.readPassiveTargetID(PN532_MIFARE_ISO14443A, uid, &uidLength, POLL_TIMEOUT_MS)) {
    lastSeenAt = millis();
    String uidHex = toHex(uid, uidLength);
    if (uidHex != currentUid) {
      currentUid = uidHex;
      Serial.println("present " + uidHex);
    }
  } else if (currentUid.length() > 0 && millis() - lastSeenAt > REMOVED_AFTER_MS) {
    currentUid = "";
    Serial.println(F("removed"));
  }
}

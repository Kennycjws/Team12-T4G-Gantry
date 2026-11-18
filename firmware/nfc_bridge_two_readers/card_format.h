// card_format.h – EZ-link simulation card format, version 3
//
// SHARED FORMAT: the Raspberry Pi gantry uses the same layout (ezcard_format.py).
// If you change anything here, change it there too.
//
// Each card holds TWO copies ("slots") of a 16-byte record:
//   NTAG / Ultralight: slot A = pages 4-7,  slot B = pages 8-11
//   MIFARE Classic:    slot A = block 4,    slot B = block 5
// Every write goes to the slot that is NOT current and increases seq by 1.
// The current record is the valid slot with the higher seq, so a write that is
// interrupted (card pulled away) leaves the previous record untouched.
//
// Record layout (multi-byte numbers are little-endian):
//   0-1   'G' 'O'      marks a card set up by this project
//   2     format version (3)
//   3     card type: 1 = EZ-link, 2 = bank card
//   4-5   seq: write counter, uint16 (wraps from 65535 to 0)
//   6-9   balance in cents, int32 (EZ-link stored value, or simulated bank balance)
//   10    flags: bit 0 = tapped in (inside the paid area)
//   11    station id where the card tapped in (0 = none)
//   12-13 last fare charged in cents, uint16
//   14    reserved (0)
//   15    CRC-8 of bytes 0-14 (polynomial 0x07, initial value 0)

#ifndef CARD_FORMAT_H
#define CARD_FORMAT_H

#include <stdint.h>
#include <string.h>

#define CARD_RECORD_SIZE 16
#define CARD_FORMAT_VERSION 3
#define CARD_TYPE_EZLINK 1
#define CARD_TYPE_BANK 2
#define CARD_FLAG_INSIDE 0x01

// Results of pickCurrent()
#define CARD_OK 0       // a valid record was found
#define CARD_BLANK 1    // both slots are empty (never set up)
#define CARD_UNKNOWN 2  // holds other data, not a valid record

struct CardRecord {
  uint8_t type;
  uint16_t seq;
  int32_t balance;   // cents
  uint8_t flags;
  uint8_t station;
  uint16_t lastFare; // cents
};

static inline uint8_t cardCrc8(const uint8_t *data, uint8_t len) {
  uint8_t crc = 0;
  for (uint8_t i = 0; i < len; i++) {
    crc ^= data[i];
    for (uint8_t bit = 0; bit < 8; bit++) {
      crc = (crc & 0x80) ? (uint8_t)((crc << 1) ^ 0x07) : (uint8_t)(crc << 1);
    }
  }
  return crc;
}

static inline void encodeRecord(const CardRecord &r, uint8_t *b) {
  memset(b, 0, CARD_RECORD_SIZE);
  uint32_t v = (uint32_t)r.balance;
  b[0] = 'G';
  b[1] = 'O';
  b[2] = CARD_FORMAT_VERSION;
  b[3] = r.type;
  b[4] = r.seq & 0xFF;
  b[5] = r.seq >> 8;
  b[6] = v & 0xFF;
  b[7] = (v >> 8) & 0xFF;
  b[8] = (v >> 16) & 0xFF;
  b[9] = (v >> 24) & 0xFF;
  b[10] = r.flags;
  b[11] = r.station;
  b[12] = r.lastFare & 0xFF;
  b[13] = r.lastFare >> 8;
  b[15] = cardCrc8(b, 15);
}

// Returns true if b holds a valid record
static inline bool decodeRecord(const uint8_t *b, CardRecord &r) {
  if (b[0] != 'G' || b[1] != 'O' || b[2] != CARD_FORMAT_VERSION) return false;
  if (cardCrc8(b, 15) != b[15]) return false;
  if (b[3] != CARD_TYPE_EZLINK && b[3] != CARD_TYPE_BANK) return false;

  r.type = b[3];
  r.seq = (uint16_t)b[4] | ((uint16_t)b[5] << 8);
  r.balance = (int32_t)((uint32_t)b[6] | ((uint32_t)b[7] << 8) |
                        ((uint32_t)b[8] << 16) | ((uint32_t)b[9] << 24));
  r.flags = b[10];
  r.station = b[11];
  r.lastFare = (uint16_t)b[12] | ((uint16_t)b[13] << 8);
  return true;
}

static inline bool slotIsEmpty(const uint8_t *b) {
  for (uint8_t i = 0; i < CARD_RECORD_SIZE; i++) {
    if (b[i]) return false;
  }
  return true;
}

// True if seq a was written after seq b (handles the counter wrapping around)
static inline bool seqNewer(uint16_t a, uint16_t b) {
  uint16_t diff = (uint16_t)(a - b);
  return diff != 0 && diff < 0x8000;
}

// Finds the current record. Returns CARD_OK, CARD_BLANK or CARD_UNKNOWN.
// On CARD_OK, current and currentSlot (0 = A, 1 = B) are filled in.
static inline uint8_t pickCurrent(const uint8_t *slotA, const uint8_t *slotB,
                                  CardRecord &current, uint8_t &currentSlot) {
  CardRecord a, b;
  bool okA = decodeRecord(slotA, a);
  bool okB = decodeRecord(slotB, b);

  if (okA && okB) {
    if (seqNewer(b.seq, a.seq)) {
      current = b;
      currentSlot = 1;
    } else {
      current = a;
      currentSlot = 0;
    }
    return CARD_OK;
  }
  if (okA) {
    current = a;
    currentSlot = 0;
    return CARD_OK;
  }
  if (okB) {
    current = b;
    currentSlot = 1;
    return CARD_OK;
  }
  return (slotIsEmpty(slotA) && slotIsEmpty(slotB)) ? CARD_BLANK : CARD_UNKNOWN;
}

#endif

# Card reader messages

How a card tap gets from the readers to the kiosk screen, and the exact message formats
at each step. Read this before changing the Arduino sketch, the bridge, or the kiosk's
reader code. If you change a format, update this doc and every part that reads it.

## The pieces

```
EZ-link card ──▶ PN532 (I2C) ─┐
                              ├─▶ Arduino Uno ──USB serial──▶ bridge ──HTTP──▶ kiosk app
Bank card ─────▶ RC522 (SPI) ─┘   (sketch)      (JSON lines)  (reader.mjs)     (Next.js)
```

| Piece | File | Job |
|---|---|---|
| Sketch | `TopUp system/nfc_bridge/nfc_bridge_two_readers/nfc_bridge_two_readers.ino` | Reads both readers, sends one JSON line per event |
| Bridge | `bridge/reader.mjs` | Reads those lines, forwards taps to the app, passes the app's write commands to the Arduino, checks a held EZ-link card is still there |
| App | `app/api/reader/tap/route.ts`, `hooks/use-card-reader.ts` | Turns taps into kiosk screens |

There are two readers, and **which reader a card is tapped on matters, not the card itself**:

| Reader | `src` / `reader` value | What a tap does |
|---|---|---|
| PN532 | `"ezlink"` | Starts a top-up. Lifting the card cancels it, unless payment is processing. |
| RC522 | `"bank"` | Pays for the top-up. Only does anything on the payment screen. |

Each registered card also has a type (`kind`). A card tapped on the wrong reader shows
"Invalid card". See [Saved cards](#4-saved-cards-datadbjson).

---

## 1. Arduino → bridge (USB serial)

- 115200 baud, one JSON object per line, ending `\r\n`.
- Lines that aren't JSON are boot noise. The bridge logs them and ignores them.
- UIDs are uppercase hex with no spaces, for example `0423C2923E0289`. They are 8 characters
  for 4-byte cards and 14 for 7-byte cards.
- Every field below is always present unless it is marked *optional*.

### `ready`: the Uno has started

Sent once at startup. The Uno also restarts each time the bridge opens the USB port.

```json
{"t":"ready","proto":4,"reader":"ok","bank":"ok"}
```

| Field | Values | Meaning |
|---|---|---|
| `proto` | `4` | Protocol version. Bump it when a format here changes. |
| `reader` | `"ok"` / `"lost"` | The PN532 (EZ-link reader) answered |
| `bank` | `"ok"` / `"lost"` | The RC522 (bank reader) answered. If `"lost"`, bank taps are off until restart. |

The bridge treats `ready` as "the Uno restarted", so it clears any card it thought was on
either reader.

### `status`: the EZ-link reader stopped or started answering

```json
{"t":"status","reader":"lost"}
{"t":"status","reader":"ok"}
```

The sketch checks the PN532 every 5 seconds and restarts it if needed. It sends `status`
only when the state changes. There is no `status` for the bank reader.

### `tap`: a card arrived

Sent **once** per arrival, not repeatedly while the card is held.

**EZ-link reader (PN532)**, a card that has been set up:
```json
{"t":"tap","src":"ezlink","uid":"0413E59B3E0289","format":"ok","card":{"type":"ezlink","balance":500,"seq":1,"inside":false,"station":0,"lastFare":0}}
```

**EZ-link reader (PN532)**, a card that hasn't been set up yet:
```json
{"t":"tap","src":"ezlink","uid":"04A337973E0289","format":"unknown"}
```

**Bank reader (RC522):**
```json
{"t":"tap","src":"bank","uid":"0453F3973E0289"}
```

| Field | Values | Meaning |
|---|---|---|
| `src` | `"ezlink"` / `"bank"` | Which reader |
| `uid` | hex string | The card's ID. The app identifies cards by this. |
| `format` | EZ-link only, see below | What the sketch found stored on the card |
| `card` | *optional*, EZ-link only, when `format` is `"ok"` | The record stored on the card |

`format` values:

| Value | Meaning |
|---|---|
| `"ok"` | The card holds a valid project record. `card` is included. |
| `"blank"` | Never set up |
| `"unknown"` | Holds other data. New practice cards show this until they are set up. |
| `"unreadable"` | Reading the record failed, for example the card was pulled away mid-read |
| `"unsupported"` | Not a 4- or 7-byte MIFARE / NTAG card |

`card` object, read from the card. The layout is defined in `card_format.h`, which is shared
with the Raspberry Pi gantry:

```json
{"type":"ezlink","balance":1250,"seq":42,"inside":false,"station":0,"lastFare":150}
```

| Field | Meaning |
|---|---|
| `type` | `"ezlink"` / `"bank"`, as written by `SETUP` |
| `balance` | Cents |
| `seq` | Write counter. `ADJUST` must send the current value. |
| `inside` | Tapped in at a gantry |
| `station` | Station ID where the card tapped in, or `0` for none |
| `lastFare` | Cents |

> **EZ-link balances live on the card.** The kiosk shows `card.balance` from the tap and
> writes changes back with `ADJUST`. A card whose `format` isn't `"ok"` shows "This card is
> not set up", and a teacher writes a starting value onto it from the cards page (`SETUP`).
> Setting `balanceOnCard: false` in `lib/config.ts` keeps balances in `data/db.json` instead.

### `removed`: the card left the reader

```json
{"t":"removed","src":"ezlink","uid":"0423C2923E0289"}
{"t":"removed","src":"bank","uid":"0453F3973E0289"}
```

Sent after the card has been unseen for **600 ms**, so a brief misread while a card is held
doesn't count. If a different card is swapped straight on, the sketch sends `removed` for
the old card, then `tap` for the new one.

### `res`: reply to a command

```json
{"t":"res","id":7,"ok":true,"uid":"0413E59B3E0289","format":"ok","card":{"type":"ezlink","balance":1500,"seq":2,"inside":false,"station":0,"lastFare":0}}
{"t":"res","id":8,"ok":false,"err":"card_removed"}
```

`id` matches the command's id. A failed reply has `ok:false` and `err`, and nothing else.
See the commands below.

---

## 2. Bridge → Arduino commands

Plain text, one command per line ending `\n`. Every command carries a number `id`, which
the reply's `id` echoes. **All commands act on the EZ-link reader (PN532) only.**

| Command | Successful reply (after `"ok":true,`) | Used by |
|---|---|---|
| `PING <id>` | `"proto":4,"reader":"ok"` | Not used |
| `READ <id>` | `"uid":"…","format":"…"` plus `"card":{…}` when `format` is `"ok"` | Bridge, every 1.5 s while an EZ-link card is on |
| `SETUP <id> <uid> <EZLINK\|BANK> <balanceCents>` | Same as `READ`, with the new `card` | Cards page: **Write $X to card** (writes a fresh record) |
| `ADJUST <id> <uid> <seq> <deltaCents>` | Same as `READ`, with the updated `card` | Top-ups, and Teacher Mode's **Set card value** (adds `deltaCents`, or subtracts if negative) |

Errors (`err`):

| `err` | Meaning |
|---|---|
| `bad_command` | Unknown command or missing arguments |
| `reader_lost` | The PN532 isn't answering |
| `card_removed` | No card on the reader |
| `wrong_card` | A different card from the `<uid>` given |
| `unsupported` | Card type not supported |
| `read_failed` / `write_failed` / `verify_failed` | Card I/O failed, usually because it moved |
| `not_set_up` | `ADJUST` on a card without a valid record |
| `stale` | `ADJUST`'s `<seq>` doesn't match the card, which changed since it was read |
| `insufficient_funds` | `ADJUST` would take the balance below 0 |

**Why the bridge sends `READ`:** the Uno sometimes misses an EZ-link card being taken
away and never sends `removed`. So while one is on, the bridge sends `READ` every 1.5 s.
If the reply is `card_removed` or `reader_lost`, or there's no reply within 3 s, the bridge
treats the card as removed. The bridge only does this when `ready` reported `proto` 3 or
higher.

### How the app sends commands

The app's server can't reach the USB port, so it asks the bridge, which listens on
`127.0.0.1` only (port `BRIDGE_PORT`, default `3101`; the app finds it at `BRIDGE_URL`):

`POST /command`, with a body like `{"command":"ADJUST","args":["0423C2923E0289","42","1000"]}`

- Only `ADJUST` and `SETUP` are accepted. Each arg is letters, digits or `-`, so a request
  can't sneak in a second command line.
- The bridge adds the `id`, sends the line, and replies with the Arduino's `res` message.
- If the Arduino isn't connected, the reply is `{"ok":false,"err":"reader_not_connected"}`.
  If it doesn't answer within 6 s, the reply is `{"ok":false,"err":"no_reply"}`.
- `ADJUST` quotes the `seq` from the latest tap or write. If the card changed since then,
  the Arduino refuses with `stale`, so a write can never apply to an out-of-date balance.

> **A missed reply:** if the Arduino wrote the card but its reply was lost (`no_reply`), the
> kiosk shows an error even though the card did change. The new value shows the next time
> the card is tapped. This is rare, but if it happens, check the value on the card before
> retrying the top-up.

---

## 3. Bridge → app (HTTP)

The bridge forwards each tap and removal to the app:

`POST /api/reader/tap`, with a JSON body:

```json
{"type":"present","uid":"0423C2923E0289","reader":"ezlink","format":"ok",
 "card":{"type":"ezlink","balance":1500,"seq":4,"inside":false,"station":0,"lastFare":0}}
{"type":"present","uid":"0453F3973E0289","reader":"bank"}
{"type":"removed","reader":"ezlink"}
{"type":"removed","reader":"bank"}
```

| Field | Values | Notes |
|---|---|---|
| `type` | `"present"` / `"removed"` | |
| `uid` | hex, 4–32 characters | `present` only. The app uppercases it. |
| `reader` | `"ezlink"` / `"bank"` | Missing or anything else counts as `"ezlink"` |
| `format`, `card` | *optional*, as in the Arduino's `tap` | EZ-link only. The server keeps them for the card on the reader, and they're where the balance comes from. |

Reply: `{"ok":true}`, or `400 {"error":"Invalid tap"}` for a bad `uid`.

The app then pushes the same event to every open kiosk page over server-sent events
(`GET /api/reader/events`), as `data: {...}\n\n`. A newly opened page is sent the EZ-link
card that's currently on the reader, if there is one. It is never sent the bank card.

The dev panel (`npm run dev` only) posts these same bodies to fake taps.

### How the kiosk uses them

| Event | Screen | Result |
|---|---|---|
| `present`, `ezlink` | Start screen | Looks up the card. If it's an EZ-link card that has been set up, show the amount screen with the value on the card. If it's the wrong `kind`, show "Invalid card"; if it isn't set up, show "This card is not set up". |
| `removed`, `ezlink` | Any screen except "processing" | Back to the start screen |
| `present`, `bank` | Payment screen | Looks up the card. If it's a bank card, pay; if not, show "Invalid card. Please tap a bank card." |
| `present`, `bank` | Any other screen | Ignored |
| `removed`, `bank` | Any | Ignored |

Card lookups use `GET /api/cards/<uid>?reader=ezlink|bank`. The reply is the card, with an
EZ-link card's `balanceCents` taken from the card itself. Failures:
`404 {"error":"Invalid card"}` if it isn't registered or is the wrong `kind` for that reader,
or `422` with a message such as "This card is not set up. Please ask a teacher."

Writes: `POST /api/topups` (a top-up, sends `ADJUST`), `POST /api/cards/<uid>/balance`
(Teacher Mode, sends `ADJUST`) and `POST /api/cards/<uid>/setup` (cards page, sends `SETUP`).
Each replies with the card and its new balance, or `422 {"error":"…"}` with a message to show.
With `autoRegisterCards` on in `lib/config.ts`, an unknown card on the EZ-link reader is
added to the card list automatically as an EZ-link card. It still shows "not set up" until a
value is written onto it.

---

## 4. Saved cards (`data/db.json`)

Not an event, but this is what the `uid` in each event is matched against. In the Windows
app, the file is at `%APPDATA%\Grace Orchard Top-Up\data\db.json`.

```json
{
  "cards": [
    {"uid":"0413E59B3E0289","name":"EZ-Link Card 1","balanceCents":1500,"kind":"ezlink"},
    {"uid":"0433E78F3E0289","name":"Bank Card 1","balanceCents":500,"kind":"bank"}
  ],
  "transactions": [
    {"id":"3f1c…","uid":"0413E59B3E0289","amountCents":1000,"method":"nets",
     "balanceAfterCents":1500,"at":"2026-11-13T06:40:00.000Z"}
  ]
}
```

- All money is in **cents**.
- With balances on the card, an EZ-link card's `balanceCents` here is only the value it
  had when last seen on this computer. The cards page shows it as "(last seen)".
- `kind` is `"ezlink"` or `"bank"`. A card without `kind` counts as `"ezlink"`.
- `method` is `"nets"` or `"credit"`. `id` is unique per top-up, so retrying a top-up
  can't charge twice.
- Cards are managed on the cards page: **Manage cards** on the kiosk, password protected.

---

## Example: one top-up, start to finish

These are the real lines from a $10 top-up on EZ-Link Card 1, which held $5.00. In the
bridge's terminal, Arduino lines show up summarised, as in the last column.

| # | From → to | Message | Bridge terminal |
|---|---|---|---|
| 1 | Arduino → bridge | `{"t":"tap","src":"ezlink","uid":"0413E59B3E0289","format":"ok","card":{…,"balance":500,"seq":1,…}}` | `Card present (ezlink): 0413E59B3E0289, value 500 cents` |
| 2 | Bridge → app | `POST /api/reader/tap` `{"type":"present","uid":"0413E59B3E0289","reader":"ezlink","format":"ok","card":{…}}` | |
| 3 | Kiosk | Shows $5.00 from the card. The person picks $10 and NETS, and the payment screen appears. | |
| 4 | Arduino → bridge → app | `{"t":"tap","src":"bank","uid":"0433E78F3E0289"}`, then `{"type":"present","uid":"0433E78F3E0289","reader":"bank"}` | `Card present (bank): 0433E78F3E0289` |
| 5 | Kiosk → app | `POST /api/topups` `{"attemptId":"…","uid":"0413E59B3E0289","amountCents":1000,"method":"nets"}` | |
| 6 | App → bridge | `POST /command` `{"command":"ADJUST","args":["0413E59B3E0289","1","1000"]}` | |
| 7 | Bridge → Arduino | `ADJUST 4 0413E59B3E0289 1 1000` (`4` is the bridge's command id) | |
| 8 | Arduino → bridge | `{"t":"res","id":4,"ok":true,"uid":"0413E59B3E0289","format":"ok","card":{…,"balance":1500,"seq":2,…}}` | `ADJUST 0413E59B3E0289 1 1000 -> ok` |
| 9 | App → kiosk | The new balance, $15.00. The success screen appears after the 4-second processing screen. | |
| 10 | Arduino → bridge → app | `{"t":"removed","src":"ezlink",…}`, then `{"type":"removed","reader":"ezlink"}` | `Card removed (ezlink)` |

Setting up a new card works the same way from step 6, with
`{"command":"SETUP","args":["<uid>","EZLINK","500"]}`. The bridge terminal shows it as
`SETUP 0413E59B3E0289 EZLINK 500 -> ok`.

---

## Compatibility

| Firmware | What the bridge does |
|---|---|
| Two-reader sketch (`proto` 4) | Everything above |
| One-reader sketch (`proto` 3, no `src`) | Every tap counts as `ezlink`. `READ` checks still work. |
| `firmware/pn532_reader` (plain text) | Reads `present <UID>` and `removed`, with no commands. Kept for reference. |

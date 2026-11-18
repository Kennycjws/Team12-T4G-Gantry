# Handover: Grace Orchard MRT Top-Up Simulator

For the team taking over this project. This covers what the system is and how it fits
together, how to run, build and change it, and what is still unfinished.

## What it is

A practice MRT top-up machine for Grace Orchard School. Students tap a practice "EZ-Link"
card, choose an amount, then pay by tapping a practice "bank" card. No real money moves.
All the cards are plain MIFARE cards, labelled for the simulation.

Status at handover: the system works end to end on real hardware, on a Mac and in the
packaged Windows app. Teachers use the Windows app.

## Where everything is

| What | Where |
|---|---|
| Code | GitHub: `Kennycjws/grace-orchard-topup`. Most of the recent work is on the `pn532-uno-reader` branch, not `main` |
| Arduino sketch (two readers) | `firmware/nfc_bridge_two_readers/` |
| Old one-reader sketch (not used) | `firmware/pn532_reader/` |
| Serial and HTTP message formats | `docs/reader-protocol.md` |
| Windows app build | `desktop/` (output goes to `desktop/dist/`, which is not in git) |
| Card list and transactions | `data/db.json` on a Mac or dev machine (not in git); the Windows app keeps its own copy (see [Cards](#cards)) |

## How it fits together

```
 EZ-Link card ─► PN532 (I2C) ─┐
                              ├─► Arduino Uno ─USB serial─► bridge/reader.mjs ─HTTP─► Next.js app
 Bank card ────► RC522 (SPI) ─┘     (sketch)    115200 baud    (Node process)          (kiosk + API)
                                        ▲                          │   ▲                     │
                                        └── READ / SETUP / ADJUST ─┘   └── commands ─────────┘
```

- **Arduino sketch:** watches both readers. It sends one JSON line per event: `ready`, `tap`, `removed`, `status`, or `res` (a reply to a command). For EZ-Link cards it also reads and writes the balance record stored on the card.
- **Bridge (`bridge/reader.mjs`):** a browser can't open a serial port, so this Node process does. It forwards taps to the app (`POST /api/reader/tap`). It also takes the app's write commands on `127.0.0.1:3101/command` and passes them to the Arduino. It finds the Uno by its USB vendor ID, reconnects if the cable is pulled, and checks every 1.5 s that a card on the EZ-Link reader is still there.
- **Next.js app:** pushes taps to the kiosk page over server-sent events (`/api/reader/events`). Top-ups go through `/api/topups`.

All the message formats, with examples, are in `docs/reader-protocol.md`.

### Where the balance lives

- **EZ-Link cards:** the balance is stored **on the card**, in a 16-byte record that `firmware/nfc_bridge_two_readers/card_format.h` describes.
  - The same layout is used by the Raspberry Pi gantry (`ezcard_format.py`), so a card topped up here can be used at the gantry.
  - Each card keeps two copies of the record, so pulling the card away mid-write can't corrupt it.
  - Every write must quote the card's current `seq` (write counter), which blocks writes based on an old reading.
- **`data/db.json`:** holds each card's name and type, a "last seen" balance for the cards page, and the transaction log. The balance used for top-ups is always the one read from the card.
- **Bank cards:** they only identify who is paying. Nothing is written to them and nothing is deducted.

Setting `balanceOnCard: false` in `lib/config.ts` keeps balances in `db.json` instead. That's useful for working with no readers attached.

## Hardware

Parts: an Arduino Uno, a PN532 NFC module, an RC522 RFID module, MIFARE cards, and a USB cable.

**PN532 (EZ-Link reader).** Set its DIP switches to I2C (1 = ON, 2 = OFF).

| PN532 | Uno |
|---|---|
| VCC | 5V |
| GND | GND |
| SDA | SDA (A4) |
| SCL | SCL (A5) |

**RC522 (bank reader).** It runs on **3.3 V. Connecting it to 5 V can damage it.**

| RC522 | Uno |
|---|---|
| 3.3V | 3.3V |
| GND | GND |
| SDA (SS) | 10 |
| SCK | 13 |
| MOSI | 11 |
| MISO | 12 |
| RST | 9 |

**Uploading the sketch** (needed once per Uno, and again after any change):
1. In the Arduino IDE's Library Manager, install **Adafruit PN532** and **MFRC522**.
2. Open `firmware/nfc_bridge_two_readers/nfc_bridge_two_readers.ino`, select Arduino Uno and its port, and upload.
3. Close the Serial Monitor afterwards. Only one program can use the port at a time, and the bridge needs it.

## Running it

You need Node.js 20 or newer. Run `npm install` first.

| Command | What it's for |
|---|---|
| `npm run dev` | Development, at http://127.0.0.1:3000. A panel at the bottom right fakes card taps, so no reader is needed. Run `npm run bridge` in a second terminal to use the real reader |
| `npm run kiosk` | Lesson mode on a Mac or PC. Starts the app and the bridge, restarts them if they crash, and opens the browser. Run `npm run build` first, and again after any code change |
| `npm test` | Unit tests for the screen flow (`lib/machine.test.ts`) |
| `npm run desktop` | Builds the Windows app (see below). Stop any running kiosk first |

If more than one USB serial device is plugged in, choose the port yourself, for example `SERIAL_PORT=/dev/cu.usbmodem1101 npm run bridge`.

## The Windows app (for teachers)

Teachers don't install anything. They plug in the Uno and double-click the app. The app
starts the server and the bridge itself and opens the kiosk full screen.

**Building it:** run `npm run desktop` on a Mac or PC. The build (`desktop/build.mjs`):
1. makes a standalone Next.js build,
2. copies in the bridge and the current card list (as `default-db.json`),
3. packages everything with Electron.

It produces two outputs:
- `desktop/dist/Grace Orchard Top-Up.exe`: a single file. It unpacks itself every time it opens, so it can take a minute or more to start on a school laptop.
- `desktop/dist/win-unpacked/`: the same app as a folder. It opens much faster. Zip this folder to send it, and keep the folder together when you extract it.

**On the Windows laptop:**
- The app isn't code-signed, so Windows shows "Windows protected your PC". Click **More info → Run anyway**. School-managed laptops may block it completely, in which case IT has to allow it.
- Cheaper Uno clones need the **CH340** USB driver. A genuine Uno works without one.
- **Closing the app:** Manage cards (top right of the start screen) → password → **Close app**. Alt+F4 should also work.
- **Data:** the card list is saved in `%APPDATA%\Grace Orchard Top-Up\db.json`. On first run it is copied from the list the app was built with.
- **Log:** `%APPDATA%\Grace Orchard Top-Up\log.txt`. Ask for this file first when something goes wrong.

The app's code is in `desktop/main.cjs` (starts the server and the bridge on free ports and opens the window) and `desktop/preload.cjs`. `desktop/after-pack.cjs` copies the server into the package, because electron-builder would otherwise drop its `node_modules` and `.next` folders.

## Cards

- **Teacher password:** `123456`. It's in `components/kiosk/teacher-mode.tsx` (`TEACHER_PASSWORD`). Change it before real use.
- **Manage cards** (`/admin`, reached from the button on the start screen):
  - Add a card, choosing EZ-Link or Bank as its type.
  - Rename or delete cards.
  - Write a starting balance to the EZ-Link card on the reader with **"Write $X to card"**.
- **A new EZ-Link card** says "This card is not set up" until a value has been written to it once.
- **Teacher Mode** (on the balance screen) changes the balance of the card on the reader. It writes the change to the card.
- **Wrong reader:** tapping a card on the reader for the other type shows "Invalid card".
- **Auto-register:** `autoRegisterCards: true` means any unknown card tapped on the EZ-Link reader is added to the list. This is handy for testing, but you may want it off for lessons.

Cards at handover (from the development Mac):

| Name | UID | Type |
|---|---|---|
| EZ-Link Card 1 | 0413E59B3E0289 | EZ-Link |
| EZ-Link Card 2 | 04A337973E0289 | EZ-Link |
| EZ-Link Card 3 | 0423C2923E0289 | EZ-Link |
| Bank Card 1 | 0433E78F3E0289 | Bank |
| Bank Card 2 | 0493BE8B3E0289 | Bank |
| Bank Card 3 | 0453F3973E0289 | Bank |

There is also one extra card, `04C38B8C3E0289`, that auto-register added during testing. It can be deleted.

## Settings (`lib/config.ts`)

- **Top-up amounts:** $10, $20, $30, $50 and $100.
- **Payment methods:** NETS and credit/debit.
- **Card limit:** $500.
- **Timings:**
  - an idle screen goes back to the start after 60 s,
  - the result screen stays up for 8 s,
  - the processing screen shows for at least 4 s.
- **Card options:** `balanceOnCard`, `autoRegisterCards`, and `newCardBalanceCents` (the starting value for auto-added cards).

## Code map

| Path | What's there |
|---|---|
| `lib/machine.ts` | The flow as a reducer, one state per screen. Tested in `lib/machine.test.ts` |
| `components/kiosk/kiosk-simulator.tsx` | Connects the flow to the screens, the API and the reader events |
| `components/kiosk/screen-*.tsx` | The screens. They only take props and hold no logic, so designs can be edited directly |
| `lib/card-balance.ts` | Reads and changes a card's balance, on the card or in `db.json` |
| `lib/bridge-client.ts` | Sends `SETUP` / `ADJUST` commands to the bridge |
| `lib/reader-bus.ts` | Passes reader events between the API routes and the event stream |
| `lib/store.ts` | `db.json`: cards and transactions |
| `app/api/` | `cards`, `cards/[uid]` (plus `balance` and `setup`), `topups`, `reader/tap`, `reader/events` |
| `app/admin/page.tsx` | The Manage cards page |

This uses Next.js 16, which differs from older versions. Read `AGENTS.md` and the guides in `node_modules/next/dist/docs/` before changing routes.

## Known issues and tips

- **Loose wires cause most problems.** If cards are detected only some of the time, or a removed card still shows as present, solder the PN532 header pins rather than relying on jumper wires. Pressing the Uno's reset button recovers a stuck PN532.
- **The first read can fail.** If a card is still sliding onto the reader, the Arduino may see its ID but fail to read its record (`format: "unreadable"`). The bridge reads it again within about 1.5 s and the kiosk recovers on its own.
- **Card lists don't sync between machines.** Each laptop keeps its own card list. Balances still travel with the cards.
- **The README is out of date.** It still describes one reader and balances kept in `db.json`. This handover and `docs/reader-protocol.md` are correct.
- **The Windows app is unsigned and portable.** That causes the slow start and the SmartScreen warning.

## Suggested next steps

1. Merge `pn532-uno-reader` into `main`.
2. Build an installer instead of the portable `.exe` (electron-builder's `nsis` target). It installs once and then opens quickly, and it can add a Start-menu shortcut.
3. Change the teacher password, and turn off `autoRegisterCards` for lessons.
4. Bring the README up to date, or point it to this document.
5. If students should see a bank balance go down, store a balance on the bank cards too. The card format already has a bank card type.

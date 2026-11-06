# Grace Orchard MRT Top-Up Simulator

A local practice version of an MRT top-up machine, using a PN532 NFC reader on an Arduino
Uno and fake practice cards. No real money moves: balances are simulated in `data/db.json`.
The flow follows `TopUp_UI_State_Machine.pptx`.

## Run

    npm install
    npm run dev          # kiosk at http://127.0.0.1:3000, teacher page at /admin
    npm run bridge       # second terminal, for the Arduino reader

For a lesson, run `npm run kiosk`. It starts the app and the bridge, restarts them if
they crash, and opens the kiosk in the browser. The reader can be plugged in at any time.
After changing the code, run `npm run build` once so the kiosk picks it up.

No reader yet? In `npm run dev`, use the panel at the bottom right to fake taps.

## Reader setup

Set the PN532 switches to I2C, then wire it to the Uno:

| PN532 | Uno |
| ----- | --- |
| VCC   | 5V  |
| GND   | GND |
| SDA   | A4  |
| SCL   | A5  |

Upload the firmware once, using the Arduino IDE:

1. In Library Manager, install "Adafruit PN532" and accept its dependencies.
2. Open `firmware/pn532_reader/pn532_reader.ino`, pick Arduino Uno and its port, and upload.
3. Close the Serial Monitor. Only one program can use the port, and the bridge needs it.

Plug the Uno into the laptop by USB and `npm run bridge` finds it. If it doesn't, set
the port yourself: `SERIAL_PORT=/dev/cu.usbmodem1101 npm run bridge`.

## How it fits together

    PN532 -> Uno -> USB serial -> bridge/reader.mjs -> POST /api/reader/tap
                                                             |
    Browser <- GET /api/reader/events (live) <---------------+
       |
    lib/machine.ts      top-up flow, one state per screen
    components/kiosk/kiosk-simulator.tsx  connects the flow to screens and the API
    components/kiosk/*    the v0 screens
    lib/store.ts        cards and transactions in data/db.json
    lib/config.ts       amounts, payment methods, limits, timeouts

## Screens

The screens in `components/kiosk/` came from the v0 project `transit-card-kiosk`. They
only take props and hold no flow logic. To change a design, edit the screen directly.

Teacher Mode on the select screen changes the balance of the card on the reader
(password in `components/kiosk/teacher-mode.tsx`). Use `/admin` to register cards.

## Before the lesson

- `data/` is not in git. Label cards "Card 1" rather than with student names.

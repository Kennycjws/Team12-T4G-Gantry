// Browsers can't reach the Arduino, so this small process does it and forwards taps to
// the app. Run it beside the app with `npm run bridge`.
// Reads the lines sent by firmware/pn532_reader over USB serial.
import { SerialPort, ReadlineParser } from "serialport";

const APP_URL = process.env.APP_URL ?? "http://127.0.0.1:3000";
const BAUD_RATE = 115200; // must match the firmware
const RETRY_MS = 2000;
// Arduino (x2), CH340, FTDI, CP210x, Espressif. Covers Uno and ESP32 boards.
const USB_SERIAL_VENDORS = ["2341", "2a03", "1a86", "0403", "10c4", "303a"];

async function post(body) {
  try {
    await fetch(`${APP_URL}/api/reader/tap`, { method: "POST", body: JSON.stringify(body) });
  } catch {
    console.error(`Could not reach the app at ${APP_URL}. Is it running?`);
  }
}

// Set SERIAL_PORT if more than one USB serial device is plugged in.
async function findPort() {
  if (process.env.SERIAL_PORT) return process.env.SERIAL_PORT;
  const ports = await SerialPort.list();
  return ports.find((port) => USB_SERIAL_VENDORS.includes(port.vendorId?.toLowerCase()))?.path;
}

function parseJson(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null; // boot noise, or a line from firmware/pn532_reader
  }
}

// Handles two firmwares. Both report a card arriving and leaving:
// - our board sends {"t":"tap","uid":"0423C292"} and {"t":"removed"}
// - firmware/pn532_reader sends "present 0423C292" and "removed"
function onLine(rawLine) {
  const line = rawLine.trim();
  const message = parseJson(line);
  const uid = message?.t === "tap" ? message.uid : line.match(/^present ([0-9A-F]+)$/)?.[1];

  if (/^[0-9A-Fa-f]+$/.test(uid)) {
    console.log(`Card present: ${uid}`);
    post({ type: "present", uid });
  } else if (message?.t === "removed" || line === "removed") {
    console.log("Card removed");
    post({ type: "removed" });
  } else if (line) {
    console.log(`Arduino: ${line}`);
  }
}

async function connect() {
  const path = await findPort();
  if (!path) {
    setTimeout(connect, RETRY_MS);
    return;
  }

  const port = new SerialPort({ path, baudRate: BAUD_RATE }, (error) => {
    if (error) {
      console.error(`Could not open ${path}: ${error.message}`);
      setTimeout(connect, RETRY_MS);
    } else {
      console.log(`Reader connected: ${path}`);
    }
  });

  port.pipe(new ReadlineParser({ delimiter: "\n" })).on("data", onLine);
  port.on("error", (error) => console.error("Reader error:", error.message));
  port.on("close", () => {
    console.log("Reader disconnected");
    post({ type: "removed" }); // a card can't stay "on" a reader that has gone
    setTimeout(connect, RETRY_MS);
  });
}

console.log("Waiting for a reader…");
connect();

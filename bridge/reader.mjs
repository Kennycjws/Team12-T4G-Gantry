// Browsers can't reach the Arduino, so this small process does it: it forwards taps to the
// app, and passes the app's commands (writing a balance to a card) to the Arduino.
// Run it beside the app with `npm run bridge`. Message formats: docs/reader-protocol.md.
import http from "node:http";
import { SerialPort, ReadlineParser } from "serialport";

const APP_URL = process.env.APP_URL ?? "http://127.0.0.1:3000";
const COMMAND_PORT = Number(process.env.BRIDGE_PORT ?? 3101); // the app sends commands here
const BAUD_RATE = 115200; // must match the firmware
const RETRY_MS = 2000;
const CHECK_CARD_EVERY_MS = 1500;
const READ_TIMEOUT_MS = 3000; // a READ takes well under a second
const WRITE_TIMEOUT_MS = 6000; // a write reads, writes and reads back
const APP_COMMANDS = ["ADJUST", "SETUP"];
// Arduino (x2), CH340, FTDI, CP210x, Espressif. Covers Uno and ESP32 boards.
const USB_SERIAL_VENDORS = ["2341", "2a03", "1a86", "0403", "10c4", "303a"];

// Two readers: "ezlink" (PN532, starts a top-up) and "bank" (RC522, pays).
// Firmware that doesn't say which reader only has the EZ-link one.
let port = null;
const cardOn = { ezlink: false, bank: false };
let ezlinkTap = null; // { uid, format } last sent to the app for the EZ-link reader
let canAskBoard = false; // only boards that announce protocol 3+ understand commands
let nextCommandId = 1;
const waiting = new Map(); // command id -> { resolve, timer }

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

// Sends "<NAME> <id> <args…>" and resolves with the Arduino's reply, or an error reply.
function command(name, args, timeoutMs) {
  if (!port?.isOpen || !canAskBoard) return Promise.resolve({ ok: false, err: "reader_not_connected" });
  const id = nextCommandId++;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      waiting.delete(id);
      resolve({ ok: false, err: "no_reply" });
    }, timeoutMs);
    waiting.set(id, { resolve, timer });
    port.write(`${[name, id, ...args].join(" ")}\n`);
  });
}

function onReply(message) {
  const entry = waiting.get(message.id);
  if (!entry) return;
  clearTimeout(entry.timer);
  waiting.delete(message.id);
  entry.resolve(message);
}

function cardSeen(message, uid, reader) {
  cardOn[reader] = true;
  const value = message?.card ? `, value ${message.card.balance} cents` : "";
  const format = message?.format ? ` [${message.format}]` : "";
  console.log(`Card present (${reader}): ${uid}${format}${value}`);
  if (reader === "ezlink") ezlinkTap = { uid, format: message?.format };
  // EZ-link taps carry what is stored on the card; the app uses it for the balance.
  post({ type: "present", uid, reader, format: message?.format, card: message?.card });
}

function cardGone(reader, reason) {
  if (!cardOn[reader]) return;
  cardOn[reader] = false;
  console.log(reason ? `Card removed (${reader}, ${reason})` : `Card removed (${reader})`);
  post({ type: "removed", reader });
}

// The board sometimes misses an EZ-link card being taken away, and then never sends
// "removed". So while one is on, ask the board to read it. "card_removed" or no reply
// at all means the card is gone, so the kiosk doesn't stay stuck on it.
// The read on tap can also fail while the card is still sliding onto the reader
// ("unreadable"). If this later read gets the card's data, the app is told again.
// Skipped while another command is running, such as a write.
async function checkCardStillThere() {
  if (!cardOn.ezlink || waiting.size > 0) return;
  const reply = await command("READ", [], READ_TIMEOUT_MS);
  if (reply.ok) {
    if (reply.uid === ezlinkTap?.uid && reply.format !== ezlinkTap.format) {
      cardSeen(reply, reply.uid, "ezlink");
    }
    return;
  }
  // read_failed: the card is there, its data just didn't read this time
  if (reply.err === "reader_not_connected" || reply.err === "read_failed") return;
  if (reply.err === "no_reply") {
    console.error("The Arduino stopped answering. Press its reset button if taps stop working.");
    cardGone("ezlink", "Arduino not answering");
  } else {
    cardGone("ezlink", reply.err); // e.g. card_removed, reader_lost
  }
}

// Handles two firmwares:
// - our board sends {"t":"tap","src":"bank","uid":"0423C292"} and {"t":"removed","src":"bank"}
// - firmware/pn532_reader sends "present 0423C292" and "removed"
function onLine(rawLine) {
  const line = rawLine.trim();
  const message = parseJson(line);
  const reader = message?.src === "bank" ? "bank" : "ezlink";
  const uid = message?.t === "tap" ? message.uid : line.match(/^present ([0-9A-F]+)$/)?.[1];

  if (/^[0-9A-Fa-f]+$/.test(uid)) {
    cardSeen(message, uid, reader);
  } else if (message?.t === "removed" || line === "removed") {
    cardGone(reader);
  } else if (message?.t === "res") {
    onReply(message);
  } else if (line) {
    if (message?.t === "ready") {
      canAskBoard = message.proto >= 3;
      cardGone("ezlink", "Arduino restarted"); // a restarted board has forgotten its cards
      cardGone("bank", "Arduino restarted");
    }
    console.log(`Arduino: ${line}`);
  }
}

async function connect() {
  const path = await findPort();
  if (!path) {
    setTimeout(connect, RETRY_MS);
    return;
  }

  port = new SerialPort({ path, baudRate: BAUD_RATE }, (error) => {
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
    canAskBoard = false;
    for (const [id, entry] of waiting) {
      clearTimeout(entry.timer);
      entry.resolve({ ok: false, err: "reader_not_connected" });
      waiting.delete(id);
    }
    cardOn.ezlink = true; // so the kiosk always hears this removal
    cardGone("ezlink"); // a card can't stay "on" a reader that has gone
    cardGone("bank");
    setTimeout(connect, RETRY_MS);
  });
}

// The app's commands: POST /command {"command":"ADJUST","args":["0423C2923E0289","42","1000"]}.
// Only reachable from this computer. Args are letters, digits and "-" only, so a command
// can't smuggle in a second line.
function serveCommands() {
  const server = http.createServer((request, response) => {
    const reply = (status, body) => {
      response.writeHead(status, { "Content-Type": "application/json" });
      response.end(JSON.stringify(body));
    };
    if (request.method !== "POST" || request.url !== "/command") return reply(404, { ok: false, err: "not_found" });

    let raw = "";
    request.on("data", (chunk) => (raw += chunk));
    request.on("end", async () => {
      const body = parseJson(raw);
      const valid =
        APP_COMMANDS.includes(body?.command) &&
        Array.isArray(body.args) &&
        body.args.every((arg) => /^[0-9A-Za-z-]{1,32}$/.test(String(arg)));
      if (!valid) return reply(400, { ok: false, err: "bad_command" });

      const result = await command(body.command, body.args.map(String), WRITE_TIMEOUT_MS);
      console.log(`${body.command} ${body.args.join(" ")} -> ${result.ok ? "ok" : result.err}`);
      reply(200, result);
    });
  });
  server.on("error", (error) => console.error(`Command port ${COMMAND_PORT}: ${error.message}`));
  server.listen(COMMAND_PORT, "127.0.0.1");
}

console.log("Waiting for a reader…");
serveCommands();
setInterval(checkCardStillThere, CHECK_CARD_EVERY_MS);
connect();

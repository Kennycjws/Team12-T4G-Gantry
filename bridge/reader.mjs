// Browsers can't reach an NFC reader, so this small process does it and forwards
// taps to the app. Run it beside the app with `npm run bridge`.
// Not needed for a keyboard-wedge reader.
import { NFC } from "nfc-pcsc";

const APP_URL = process.env.APP_URL ?? "http://127.0.0.1:3000";
const GET_UID = Buffer.from([0xff, 0xca, 0x00, 0x00, 0x00]); // standard PC/SC command

async function post(body) {
  try {
    await fetch(`${APP_URL}/api/reader/tap`, { method: "POST", body: JSON.stringify(body) });
  } catch {
    console.error(`Could not reach the app at ${APP_URL}. Is it running?`);
  }
}

const nfc = new NFC();

nfc.on("reader", (reader) => {
  console.log(`Reader connected: ${reader.reader.name}`);
  // Auto-processing only handles some card types. Ask for the UID ourselves.
  reader.autoProcessing = false;

  reader.on("card", async () => {
    try {
      const response = await reader.transmit(GET_UID, 40);
      const status = response.subarray(-2).toString("hex");
      if (status !== "9000") return console.error(`Card rejected UID request: ${status}`);

      const uid = response.subarray(0, -2).toString("hex").toUpperCase();
      console.log(`Card present: ${uid}`);
      await post({ type: "present", uid });
    } catch (error) {
      console.error("Could not read card:", error.message);
    }
  });

  reader.on("card.off", () => post({ type: "removed" }));
  reader.on("error", (error) => console.error("Reader error:", error.message));
  reader.on("end", () => console.log("Reader disconnected"));
});

nfc.on("error", (error) => console.error("NFC error:", error.message));
console.log("Waiting for a reader…");

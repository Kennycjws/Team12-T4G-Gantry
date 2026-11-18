import type { CardRecord } from "./reader-bus";

// The bridge (bridge/reader.mjs) passes commands on to the Arduino and returns its reply.
const BRIDGE_URL = process.env.BRIDGE_URL ?? "http://127.0.0.1:3101";
const TIMEOUT_MS = 10000; // the bridge gives up first, after 6 s

export type BridgeReply =
  | { ok: true; uid: string; format: string; card?: CardRecord }
  | { ok: false; err: string };

export async function sendCommand(command: "ADJUST" | "SETUP", args: string[]): Promise<BridgeReply> {
  try {
    const response = await fetch(`${BRIDGE_URL}/command`, {
      method: "POST",
      body: JSON.stringify({ command, args }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return await response.json();
  } catch {
    return { ok: false, err: "reader_not_connected" };
  }
}

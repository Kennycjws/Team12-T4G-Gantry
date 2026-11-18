// Two readers: "ezlink" starts a top-up, "bank" pays for it.
export type ReaderSource = "ezlink" | "bank";

// The record stored on an EZ-link card (see card_format.h in the Arduino sketch).
export type CardRecord = {
  type: "ezlink" | "bank";
  balance: number; // cents
  seq: number; // write counter: a write must quote the current value
  inside: boolean;
  station: number;
  lastFare: number;
};

// format: what the sketch found on the card ("ok" means `card` is the record on it)
export type ReaderEvent =
  | { type: "present"; uid: string; reader: ReaderSource; format?: string; card?: CardRecord }
  | { type: "removed"; reader: ReaderSource };
type Listener = (event: ReaderEvent) => void;

type TappedCard = { uid: string; format?: string; card?: CardRecord };
type Bus = { listeners: Set<Listener>; current: TappedCard | null };

// On globalThis because Next can load this module once per route, and the tap route,
// the event stream and the top-up route must share one bus.
const globalForBus = globalThis as typeof globalThis & { readerBus?: Bus };
const bus = (globalForBus.readerBus ??= { listeners: new Set(), current: null });

export function publish(event: ReaderEvent) {
  if (event.reader === "ezlink") {
    bus.current =
      event.type === "present" ? { uid: event.uid, format: event.format, card: event.card } : null;
  }
  bus.listeners.forEach((listener) => listener(event));
}

// What was read from the EZ-link card on the reader, if that card is `uid`.
export function tappedCard(uid: string): TappedCard | null {
  return bus.current?.uid === uid ? bus.current : null;
}

// After a write, the card holds a new record (new balance and seq).
export function updateTappedCard(uid: string, card: CardRecord) {
  if (bus.current?.uid === uid) bus.current = { uid, format: "ok", card };
}

export function subscribe(listener: Listener) {
  bus.listeners.add(listener);
  // A reloaded page should see an EZ-link card that is already on the reader.
  if (bus.current) listener({ type: "present", reader: "ezlink", ...bus.current });
  return () => {
    bus.listeners.delete(listener);
  };
}

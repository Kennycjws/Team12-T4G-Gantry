export type ReaderEvent = { type: "present"; uid: string } | { type: "removed" };
type Listener = (event: ReaderEvent) => void;

type Bus = { listeners: Set<Listener>; currentUid: string | null };

// On globalThis because Next can load this module once per route, and the tap route
// and the event stream must share one bus.
const globalForBus = globalThis as typeof globalThis & { readerBus?: Bus };
const bus = (globalForBus.readerBus ??= { listeners: new Set(), currentUid: null });

export function publish(event: ReaderEvent) {
  bus.currentUid = event.type === "present" ? event.uid : null;
  bus.listeners.forEach((listener) => listener(event));
}

export function subscribe(listener: Listener) {
  bus.listeners.add(listener);
  // A reloaded page should see a card that is already on the reader.
  if (bus.currentUid) listener({ type: "present", uid: bus.currentUid });
  return () => {
    bus.listeners.delete(listener);
  };
}

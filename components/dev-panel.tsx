"use client";

const tap = (body: object) =>
  fetch("/api/reader/tap", { method: "POST", body: JSON.stringify(body) });

// Stands in for the reader during development. Goes through the same route as the
// real bridge, so everything after the tap is the real code path.
export function DevPanel() {
  return (
    <div className="fixed bottom-2 right-2 flex gap-2 rounded bg-black/70 p-2 text-sm text-white">
      <span>dev</span>
      <button onClick={() => tap({ type: "present", uid: "DE0000000001" })}>Tap demo card</button>
      <button onClick={() => tap({ type: "present", uid: "FFFFFFFF" })}>Tap unknown card</button>
      <button onClick={() => tap({ type: "removed" })}>Remove card</button>
      <button onClick={() => tap({ type: "present", uid: "BA0000000001", reader: "bank" })}>
        Tap bank card
      </button>
    </div>
  );
}

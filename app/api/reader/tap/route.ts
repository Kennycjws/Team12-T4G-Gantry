import { publish, type CardRecord } from "@/lib/reader-bus";

// Called by bridge/reader.mjs, and by the dev panel in place of a real reader.
export async function POST(request: Request) {
  const body = await request.json();
  const reader = body.reader === "bank" ? "bank" : "ezlink";

  if (body.type === "removed") {
    publish({ type: "removed", reader });
    return Response.json({ ok: true });
  }

  const uid = String(body.uid ?? "").toUpperCase();
  if (body.type !== "present" || !/^[0-9A-F]{4,32}$/.test(uid)) {
    return Response.json({ error: "Invalid tap" }, { status: 400 });
  }
  // EZ-link taps also say what is stored on the card (see docs/reader-protocol.md).
  const format = typeof body.format === "string" ? body.format : undefined;
  const card = isCardRecord(body.card) ? body.card : undefined;
  publish({ type: "present", uid, reader, format, card });
  return Response.json({ ok: true });
}

function isCardRecord(value: unknown): value is CardRecord {
  const card = value as CardRecord | null;
  return (
    typeof card === "object" &&
    card !== null &&
    Number.isInteger(card.balance) &&
    Number.isInteger(card.seq)
  );
}

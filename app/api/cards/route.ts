import { listCards, saveCard } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(listCards());
}

export async function POST(request: Request) {
  const { uid, name, balanceCents } = await request.json();
  const normalisedUid = String(uid ?? "").toUpperCase();
  if (!/^[0-9A-F]{4,32}$/.test(normalisedUid) || !name || !Number.isInteger(balanceCents)) {
    return Response.json({ error: "Invalid card" }, { status: 400 });
  }
  return Response.json(saveCard({ uid: normalisedUid, name, balanceCents }));
}

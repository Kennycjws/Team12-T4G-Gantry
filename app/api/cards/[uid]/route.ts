import { CardError, withBalance } from "@/lib/card-balance";
import { config } from "@/lib/config";
import { deleteCard, findCard, saveCard } from "@/lib/store";

export const dynamic = "force-dynamic";

// ?reader=ezlink|bank says which reader the card was tapped on. A card only works on its
// own reader, so a bank card on the EZ-link reader (or the other way round) is invalid.
export async function GET(request: Request, ctx: RouteContext<"/api/cards/[uid]">) {
  const { uid } = await ctx.params;
  const reader = new URL(request.url).searchParams.get("reader") === "bank" ? "bank" : "ezlink";
  const normalisedUid = uid.toUpperCase();

  let card = findCard(normalisedUid);
  if (!card && reader === "ezlink" && config.autoRegisterCards) {
    card = saveCard({
      uid: normalisedUid,
      name: `Card ${normalisedUid}`,
      balanceCents: config.newCardBalanceCents,
      kind: "ezlink",
    });
  }
  if (!card || (card.kind ?? "ezlink") !== reader) {
    return Response.json({ error: "Invalid card" }, { status: 404 });
  }
  try {
    return Response.json(withBalance(card));
  } catch (error) {
    if (error instanceof CardError) return Response.json({ error: error.message }, { status: 422 });
    throw error;
  }
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/cards/[uid]">) {
  const { uid } = await ctx.params;
  deleteCard(uid.toUpperCase());
  return Response.json({ ok: true });
}

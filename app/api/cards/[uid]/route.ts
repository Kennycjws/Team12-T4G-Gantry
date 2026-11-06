import { config } from "@/lib/config";
import { deleteCard, findCard, saveCard } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, ctx: RouteContext<"/api/cards/[uid]">) {
  const { uid } = await ctx.params;
  const normalisedUid = uid.toUpperCase();
  const card =
    findCard(normalisedUid) ??
    (config.autoRegisterCards
      ? saveCard({
          uid: normalisedUid,
          name: `Card ${normalisedUid}`,
          balanceCents: config.newCardBalanceCents,
        })
      : undefined);
  if (!card) return Response.json({ error: "Card not recognised" }, { status: 404 });
  return Response.json(card);
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/cards/[uid]">) {
  const { uid } = await ctx.params;
  deleteCard(uid.toUpperCase());
  return Response.json({ ok: true });
}

import { CardError, changeBalance, withBalance } from "@/lib/card-balance";
import { config } from "@/lib/config";
import { findCard } from "@/lib/store";

// Teacher Mode: set the balance of the card on the reader to an exact amount.
export async function POST(request: Request, ctx: RouteContext<"/api/cards/[uid]/balance">) {
  const { uid } = await ctx.params;
  const { balanceCents } = await request.json();
  if (!Number.isInteger(balanceCents) || balanceCents < 0 || balanceCents > config.maxBalanceCents) {
    return Response.json({ error: "Invalid amount" }, { status: 400 });
  }
  const card = findCard(uid.toUpperCase());
  if (!card) return Response.json({ error: "Invalid card" }, { status: 404 });

  try {
    const current = withBalance(card).balanceCents;
    return Response.json({ ...card, balanceCents: await changeBalance(card, balanceCents - current) });
  } catch (error) {
    if (error instanceof CardError) return Response.json({ error: error.message }, { status: 422 });
    throw error;
  }
}

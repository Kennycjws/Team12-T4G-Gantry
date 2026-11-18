import { CardError, setUpCard } from "@/lib/card-balance";
import { config } from "@/lib/config";
import { findCard } from "@/lib/store";

// Cards page: write a fresh record with this balance onto the card on the EZ-link reader.
// Needed once for each new card, and resets it between lessons.
export async function POST(request: Request, ctx: RouteContext<"/api/cards/[uid]/setup">) {
  const { uid } = await ctx.params;
  const { balanceCents } = await request.json();
  if (!Number.isInteger(balanceCents) || balanceCents < 0 || balanceCents > config.maxBalanceCents) {
    return Response.json({ error: "Invalid amount" }, { status: 400 });
  }
  const card = findCard(uid.toUpperCase());
  if (!card) return Response.json({ error: "Save the card first" }, { status: 404 });
  if (card.kind === "bank") {
    return Response.json({ error: "Bank cards don't store a balance" }, { status: 400 });
  }

  try {
    return Response.json({ ...card, balanceCents: await setUpCard(card, balanceCents) });
  } catch (error) {
    if (error instanceof CardError) return Response.json({ error: error.message }, { status: 422 });
    throw error;
  }
}

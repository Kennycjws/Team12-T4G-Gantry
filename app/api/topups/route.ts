import { CardError, changeBalance, withBalance } from "@/lib/card-balance";
import { config, type PaymentMethod } from "@/lib/config";
import { findCard, findTransaction, recordTransaction } from "@/lib/store";

export async function POST(request: Request) {
  const { attemptId, uid, amountCents, method } = await request.json();
  const valid =
    typeof attemptId === "string" &&
    typeof uid === "string" &&
    config.topUpAmountsCents.includes(amountCents) &&
    config.paymentMethods.includes(method);
  if (!valid) return Response.json({ error: "Invalid top-up" }, { status: 400 });

  const card = findCard(uid.toUpperCase());
  if (!card) return Response.json({ error: "Invalid card" }, { status: 422 });

  // Safe to repeat: an attemptId that already went through returns its result, not a second charge.
  const done = findTransaction(attemptId);
  if (done) return Response.json({ ...card, balanceCents: done.balanceAfterCents });

  try {
    if (withBalance(card).balanceCents + amountCents > config.maxBalanceCents) {
      throw new CardError("This top-up would go over the card limit");
    }
    const balanceAfterCents = await changeBalance(card, amountCents);
    recordTransaction({
      id: attemptId,
      uid: card.uid,
      amountCents,
      method: method as PaymentMethod,
      balanceAfterCents,
      at: new Date().toISOString(),
    });
    return Response.json({ ...card, balanceCents: balanceAfterCents });
  } catch (error) {
    if (error instanceof CardError) return Response.json({ error: error.message }, { status: 422 });
    throw error;
  }
}

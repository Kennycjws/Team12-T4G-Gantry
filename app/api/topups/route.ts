import { config, type PaymentMethod } from "@/lib/config";
import { topUp, TopUpError } from "@/lib/store";

export async function POST(request: Request) {
  const { attemptId, uid, amountCents, method } = await request.json();
  const valid =
    typeof attemptId === "string" &&
    typeof uid === "string" &&
    config.topUpAmountsCents.includes(amountCents) &&
    config.paymentMethods.includes(method);
  if (!valid) return Response.json({ error: "Invalid top-up" }, { status: 400 });

  try {
    return Response.json(topUp(attemptId, uid, amountCents, method as PaymentMethod));
  } catch (error) {
    if (error instanceof TopUpError) {
      return Response.json({ error: error.message }, { status: 422 });
    }
    throw error;
  }
}

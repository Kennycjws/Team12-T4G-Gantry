// Everything that should match the real machine lives here.
// Amounts and methods follow the team's "Select amount" mockup (U02).
export const config = {
  topUpAmountsCents: [1000, 2000, 3000, 5000, 10000],
  paymentMethods: ["nets", "credit"] as const,
  maxBalanceCents: 50000,
  // EZ-link balances are stored on the card itself and written by the Arduino. Set to false
  // to keep them in data/db.json instead, e.g. to try the kiosk with no readers attached.
  balanceOnCard: true,
  autoRegisterCards: true, // for testing: any new card is added on its first tap
  newCardBalanceCents: 500, // starting balance for those cards
  cardExpiry: "31 Jul 2029", // shown for every practice card
  screenTimeoutMs: 60000, // idle time before returning to the start screen
  resultScreenMs: 8000, // how long the success or error screen stays up
  processingMs: 4000, // the processing screen shows at least this long, like a real payment
};

export type PaymentMethod = (typeof config.paymentMethods)[number];

export const paymentLabels: Record<PaymentMethod, string> = {
  nets: "NETS Card",
  credit: "Credit / Debit Card",
};

export const formatMoney = (cents: number) => `$${(cents / 100).toFixed(2)}`;

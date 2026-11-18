// Where an EZ-link card's balance lives. With config.balanceOnCard it is stored on the card
// itself, written by the Arduino; otherwise in data/db.json (handy with no readers attached).
// Bank cards only identify the payer, so their balance is never on the card.
import { sendCommand, type BridgeReply } from "./bridge-client";
import { config } from "./config";
import type { Card } from "./machine";
import { tappedCard, updateTappedCard } from "./reader-bus";
import { saveCard } from "./store";

// A problem the person at the kiosk can understand.
export class CardError extends Error {}

const KEEP_CARD_ON = "Please keep your card on the reader.";
const READER_PROBLEM = "The card reader is not responding. Please ask a teacher.";
const WRITE_FAILED = "Could not update the card. Please try again.";

const messages: Record<string, string> = {
  card_removed: KEEP_CARD_ON,
  wrong_card: KEEP_CARD_ON,
  reader_lost: READER_PROBLEM,
  reader_not_connected: READER_PROBLEM,
  no_reply: READER_PROBLEM,
  stale: "The card changed. Please remove it and tap again.",
  insufficient_funds: "Not enough value on the card.",
  not_set_up: "This card is not set up. Please ask a teacher.",
  unsupported: "This card can't be used.",
};

const usesCard = (card: Card) => config.balanceOnCard && (card.kind ?? "ezlink") === "ezlink";

// The card with its current balance. Throws if the card's balance can't be known.
export function withBalance(card: Card): Card {
  if (!usesCard(card)) return card;
  const tapped = tappedCard(card.uid);
  if (tapped?.card) return { ...card, balanceCents: tapped.card.balance };
  if (tapped?.format === "unreadable") throw new CardError("Please hold your card still on the reader.");
  if (tapped) throw new CardError("This card is not set up. Please ask a teacher.");
  throw new CardError("Please tap your card again.");
}

// Adds deltaCents (or subtracts, if negative). Returns the new balance.
export async function changeBalance(card: Card, deltaCents: number): Promise<number> {
  if (!usesCard(card)) {
    const balanceCents = card.balanceCents + deltaCents;
    saveCard({ ...card, balanceCents });
    return balanceCents;
  }
  const seq = tappedCard(card.uid)?.card?.seq;
  if (seq === undefined) throw new CardError(KEEP_CARD_ON);
  return afterWrite(card, await sendCommand("ADJUST", [card.uid, String(seq), String(deltaCents)]));
}

// Writes a fresh record with this balance onto the card on the EZ-link reader.
export async function setUpCard(card: Card, balanceCents: number): Promise<number> {
  if (!usesCard(card)) {
    saveCard({ ...card, balanceCents });
    return balanceCents;
  }
  return afterWrite(card, await sendCommand("SETUP", [card.uid, "EZLINK", String(balanceCents)]));
}

function afterWrite(card: Card, reply: BridgeReply): number {
  if (!reply.ok) throw new CardError(messages[reply.err] ?? WRITE_FAILED);
  if (!reply.card) throw new CardError(WRITE_FAILED);
  updateTappedCard(card.uid, reply.card);
  // Kept as "last seen" for the cards page, which can't read a card that isn't on the reader.
  saveCard({ ...card, balanceCents: reply.card.balance });
  return reply.card.balance;
}

import fs from "node:fs";
import path from "node:path";
import { config, type PaymentMethod } from "./config";
import type { Card } from "./machine";

// A JSON file instead of a database: one kiosk, a few cards, and nothing native to
// install on the school laptop. All calls are synchronous, so each read-change-write
// finishes before the next request runs.
export type Transaction = {
  id: string;
  uid: string;
  amountCents: number;
  method: PaymentMethod;
  balanceAfterCents: number;
  at: string;
};

type Db = { cards: Card[]; transactions: Transaction[] };

const dbPath = path.join(process.cwd(), "data", "db.json");

const seed: Db = {
  cards: [{ uid: "DE0000000001", name: "Demo Card", balanceCents: 320 }],
  transactions: [],
};

function load(): Db {
  if (!fs.existsSync(dbPath)) return structuredClone(seed);
  return JSON.parse(fs.readFileSync(dbPath, "utf8"));
}

function save(db: Db) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const tmp = `${dbPath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, dbPath);
}

export class TopUpError extends Error {}

export const listCards = () => load().cards;
export const listTransactions = () => load().transactions;
export const findCard = (uid: string) => load().cards.find((c) => c.uid === uid);

export function saveCard(card: Card) {
  const db = load();
  const existing = db.cards.find((c) => c.uid === card.uid);
  if (existing) Object.assign(existing, card);
  else db.cards.push(card);
  save(db);
  return card;
}

export function deleteCard(uid: string) {
  const db = load();
  db.cards = db.cards.filter((c) => c.uid !== uid);
  save(db);
}

// Safe to repeat: the same attemptId applies once, so a retried request can't charge twice.
export function topUp(attemptId: string, uid: string, amountCents: number, method: PaymentMethod) {
  const db = load();
  const card = db.cards.find((c) => c.uid === uid);
  if (!card) throw new TopUpError("Card not recognised");
  if (db.transactions.some((t) => t.id === attemptId)) return card;

  const balanceAfterCents = card.balanceCents + amountCents;
  if (balanceAfterCents > config.maxBalanceCents) {
    throw new TopUpError("This top-up would go over the card limit");
  }

  card.balanceCents = balanceAfterCents;
  db.transactions.push({
    id: attemptId,
    uid,
    amountCents,
    method,
    balanceAfterCents,
    at: new Date().toISOString(),
  });
  save(db);
  return card;
}

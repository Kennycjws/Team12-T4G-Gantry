import fs from "node:fs";
import path from "node:path";
import type { PaymentMethod } from "./config";
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

// The Windows app keeps cards in the teacher's own app data folder (KIOSK_DATA_DIR),
// because its program files are replaced each time it starts.
const dataDir = process.env.KIOSK_DATA_DIR ?? path.join(process.cwd(), "data");
const dbPath = path.join(dataDir, "db.json");

const seed: Db = {
  cards: [
    { uid: "DE0000000001", name: "Demo Card", balanceCents: 320, kind: "ezlink" },
    { uid: "BA0000000001", name: "Demo Bank Card", balanceCents: 0, kind: "bank" },
  ],
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

// The top-up route checks this first, so a retried attemptId can't charge twice.
export const findTransaction = (id: string) => load().transactions.find((t) => t.id === id);

export function recordTransaction(transaction: Transaction) {
  const db = load();
  db.transactions.push(transaction);
  save(db);
}

"use client";

import { useEffect, useState } from "react";
import { useCardReader } from "@/hooks/use-card-reader";
import { formatMoney } from "@/lib/config";
import type { Card } from "@/lib/machine";

// Teacher page: register practice cards and reset balances between lessons.
export default function AdminPage() {
  const [cards, setCards] = useState<Card[]>([]);
  const [uid, setUid] = useState("");
  const [name, setName] = useState("");
  const [balance, setBalance] = useState("5.00");

  const refresh = () =>
    fetch("/api/cards").then((r) => r.json()).then(setCards);

  useEffect(() => {
    refresh();
  }, []);

  useCardReader((event) => {
    if (event.type === "present") setUid(event.uid);
  });

  const save = async (card: Card) => {
    await fetch("/api/cards", { method: "POST", body: JSON.stringify(card) });
    refresh();
  };

  const remove = async (cardUid: string) => {
    await fetch(`/api/cards/${cardUid}`, { method: "DELETE" });
    refresh();
  };

  const balanceCents = Math.round(Number(balance) * 100);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 bg-white p-8">
      <h1 className="text-2xl font-semibold">Practice cards</h1>

      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          save({ uid, name, balanceCents });
          setUid("");
          setName("");
        }}
      >
        <input className="border p-2" placeholder="Tap a card" value={uid}
          onChange={(e) => setUid(e.target.value)} required />
        <input className="border p-2" placeholder="Label, e.g. Card 1" value={name}
          onChange={(e) => setName(e.target.value)} required />
        <input className="w-24 border p-2" aria-label="Balance" value={balance}
          onChange={(e) => setBalance(e.target.value)} required />
        <button className="border px-4 py-2" disabled={!Number.isInteger(balanceCents)}>Save</button>
      </form>

      <ul className="divide-y">
        {cards.map((card) => (
          <li key={card.uid} className="flex items-center gap-4 py-2">
            <span className="flex-1">{card.name}</span>
            <code className="text-sm">{card.uid}</code>
            <span>{formatMoney(card.balanceCents)}</span>
            <button className="underline" onClick={() => save({ ...card, balanceCents })}>
              Set to {formatMoney(balanceCents)}
            </button>
            <button className="underline" onClick={() => remove(card.uid)}>Delete</button>
          </li>
        ))}
      </ul>
    </main>
  );
}

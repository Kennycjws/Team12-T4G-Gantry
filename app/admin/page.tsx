"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useCardReader } from "@/hooks/use-card-reader";
import { config, formatMoney } from "@/lib/config";
import type { Card, CardKind } from "@/lib/machine";
import type { ReaderEvent } from "@/lib/reader-bus";

// Provided by the Windows app (desktop/preload.cjs). Missing in a normal browser.
declare global {
  interface Window {
    kioskApp?: { quit: () => void };
  }
}

// Teacher page: register practice cards and reset balances between lessons.
export default function AdminPage() {
  const [cards, setCards] = useState<Card[]>([]);
  const [uid, setUid] = useState("");
  const [name, setName] = useState("");
  const [balance, setBalance] = useState("5.00");
  const [kind, setKind] = useState<CardKind>("ezlink");
  const [inApp, setInApp] = useState(false);
  // The card on the EZ-link reader, with what the Arduino read from it
  const [tapped, setTapped] = useState<Extract<ReaderEvent, { type: "present" }> | null>(null);
  const [writeStatus, setWriteStatus] = useState("");

  const refresh = () =>
    fetch("/api/cards").then((r) => r.json()).then(setCards);

  useEffect(() => {
    refresh();
    setInApp(Boolean(window.kioskApp));
  }, []);

  useCardReader((event) => {
    if (event.type === "present") setUid(event.uid);
    if (event.reader !== "ezlink") return;
    setTapped(event.type === "present" ? event : null);
    setWriteStatus("");
  });

  // Writes a fresh record with the balance from the form onto the card on the EZ-link reader.
  const writeToCard = async (cardUid: string) => {
    setWriteStatus("Writing… keep the card on the reader.");
    const response = await fetch(`/api/cards/${cardUid}/setup`, {
      method: "POST",
      body: JSON.stringify({ balanceCents }),
    });
    const body = await response.json();
    if (!response.ok) {
      setWriteStatus(body.error ?? "Could not write to the card.");
      return;
    }
    setWriteStatus(`Done. The card now holds ${formatMoney(body.balanceCents)}.`);
    setTapped((current) =>
      current && current.uid === cardUid
        ? {
            ...current,
            format: "ok",
            card: { type: "ezlink", seq: 0, inside: false, station: 0, lastFare: 0, ...current.card, balance: body.balanceCents },
          }
        : current,
    );
    refresh();
  };

  const save = async (card: Card) => {
    await fetch("/api/cards", { method: "POST", body: JSON.stringify(card) });
    refresh();
  };

  const remove = async (cardUid: string) => {
    await fetch(`/api/cards/${cardUid}`, { method: "DELETE" });
    refresh();
  };

  const balanceCents = Math.round(Number(balance) * 100);
  // Saving a UID that is already in the list replaces that card, so say so first.
  const existing = cards.find((card) => card.uid === uid.toUpperCase());

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 bg-white p-8">
      <div className="flex items-center justify-between">
        <Link href="/" className="underline">
          ← Back to kiosk
        </Link>
        {inApp && (
          <button className="border px-4 py-2" onClick={() => window.kioskApp?.quit()}>
            Close app
          </button>
        )}
      </div>
      <h1 className="text-2xl font-semibold">Practice cards</h1>

      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          save({ uid, name, balanceCents, kind });
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
        <select className="border p-2" aria-label="Card type" value={kind}
          onChange={(e) => setKind(e.target.value as CardKind)}>
          <option value="ezlink">EZ-Link</option>
          <option value="bank">Bank</option>
        </select>
        <button className="border px-4 py-2" disabled={!Number.isInteger(balanceCents)}>
          {existing ? "Replace" : "Save"}
        </button>
      </form>
      {existing && (
        <p role="alert" className="-mt-4 font-semibold text-red-600">
          This card is already saved as &quot;{existing.name}&quot;. Saving will replace it.
        </p>
      )}

      {config.balanceOnCard && tapped && (
        <section className="flex flex-col gap-2 border p-4">
          <h2 className="font-semibold">Card on the EZ-Link reader</h2>
          <p>
            {cards.find((card) => card.uid === tapped.uid)?.name ?? "Not saved yet"}{" "}
            <code className="text-sm">{tapped.uid}</code>
          </p>
          <p>
            Value on card:{" "}
            <strong>
              {tapped.format === "ok" && tapped.card ? formatMoney(tapped.card.balance) : "not set up yet"}
            </strong>
          </p>
          {cards.some((card) => card.uid === tapped.uid && card.kind !== "bank") ? (
            <button
              className="self-start border px-4 py-2"
              disabled={!Number.isInteger(balanceCents)}
              onClick={() => writeToCard(tapped.uid)}
            >
              Write {formatMoney(balanceCents)} to card
            </button>
          ) : (
            <p className="text-sm">Save this card as an EZ-Link card first, then write a value to it.</p>
          )}
          {writeStatus && <p role="status" className="font-semibold">{writeStatus}</p>}
        </section>
      )}

      <ul className="divide-y">
        {cards.map((card) => (
          <li key={card.uid} className="flex items-center gap-4 py-2">
            <span className="flex-1">{card.name}</span>
            <span className="text-sm">{card.kind === "bank" ? "Bank" : "EZ-Link"}</span>
            <code className="text-sm">{card.uid}</code>
            {config.balanceOnCard && card.kind !== "bank" ? (
              // The real value is on the card; this is what it held when last seen here.
              <span title="Value when the card was last on the reader">
                {formatMoney(card.balanceCents)} <span className="text-sm">(last seen)</span>
              </span>
            ) : (
              <>
                <span>{formatMoney(card.balanceCents)}</span>
                <button className="underline" onClick={() => save({ ...card, balanceCents })}>
                  Set to {formatMoney(balanceCents)}
                </button>
              </>
            )}
            <button className="underline" onClick={() => remove(card.uid)}>Delete</button>
          </li>
        ))}
      </ul>
    </main>
  );
}

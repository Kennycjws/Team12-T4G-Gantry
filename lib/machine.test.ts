import { test } from "node:test";
import assert from "node:assert/strict";
import { reducer, initialState, type Card, type Event, type State } from "./machine.ts";

const card: Card = { uid: "AA01", name: "Demo", balanceCents: 500 };
const run = (events: Event[], from: State = initialState) => events.reduce(reducer, from);

const toPay: Event[] = [
  { type: "CARD_PRESENTED", uid: "AA01" },
  { type: "CARD_LOADED", card },
  { type: "SELECT_TOPUP", amountCents: 1000, method: "nets" },
];

test("walks the happy path to done", () => {
  const paid = { ...card, balanceCents: 1500 };
  const end = run([
    ...toPay,
    { type: "CONFIRM_PAYMENT", attemptId: "a1" },
    { type: "TOPUP_OK", card: paid },
  ]);
  assert.deepEqual(end, { screen: "done", card: paid, amountCents: 1000 });
});

test("removing the card before paying cancels", () => {
  assert.deepEqual(run([...toPay, { type: "CARD_REMOVED" }]), initialState);
});

test("removing the card or timing out while processing does not abandon the top-up", () => {
  const processing = run([...toPay, { type: "CONFIRM_PAYMENT", attemptId: "a1" }]);
  assert.equal(reducer(processing, { type: "CARD_REMOVED" }).screen, "processing");
  assert.equal(reducer(processing, { type: "TIMEOUT" }).screen, "processing");
});

test("a card lookup that finishes after removal is ignored", () => {
  const end = run([
    { type: "CARD_PRESENTED", uid: "AA01" },
    { type: "CARD_REMOVED" },
    { type: "CARD_LOADED", card },
  ]);
  assert.deepEqual(end, initialState);
});

test("a second card mid-flow is ignored", () => {
  const menu = run(toPay.slice(0, 2));
  assert.equal(reducer(menu, { type: "CARD_PRESENTED", uid: "BB02" }), menu);
});

test("a card read again after an error is looked up again", () => {
  const failed = run([
    { type: "CARD_PRESENTED", uid: "AA01" },
    { type: "CARD_FAILED", message: "Please hold your card still on the reader." },
  ]);
  assert.deepEqual(reducer(failed, { type: "CARD_PRESENTED", uid: "AA01" }), {
    screen: "reading",
    uid: "AA01",
  });
});

test("teacher mode updates the balance on the select screen", () => {
  const edited = { ...card, balanceCents: 900 };
  assert.deepEqual(reducer(run(toPay.slice(0, 2)), { type: "CARD_EDITED", card: edited }), {
    screen: "select",
    card: edited,
  });
});

test("cash shows the unavailable screen, then returns to select", () => {
  const select = run(toPay.slice(0, 2));
  const cash = reducer(select, { type: "SELECT_CASH" });
  assert.equal(cash.screen, "cashUnavailable");
  assert.deepEqual(reducer(cash, { type: "ACKNOWLEDGE" }), select);
});

test("removing the card after success returns to idle", () => {
  const done = run([
    ...toPay,
    { type: "CONFIRM_PAYMENT", attemptId: "a1" },
    { type: "TOPUP_OK", card },
  ]);
  assert.deepEqual(reducer(done, { type: "CARD_REMOVED" }), initialState);
});

test("a wrong card at payment shows a notice and keeps the top-up", () => {
  const rejected = run([...toPay, { type: "PAYMENT_CARD_REJECTED", message: "Invalid card" }]);
  assert.equal(rejected.screen, "pay");
  assert.equal(rejected.screen === "pay" && rejected.notice, "Invalid card");

  const paying = reducer(rejected, { type: "CONFIRM_PAYMENT", attemptId: "a1" });
  assert.deepEqual(paying, {
    screen: "processing",
    card,
    amountCents: 1000,
    method: "nets",
    attemptId: "a1",
  });
});

test("a rejected payment card is ignored away from the payment screen", () => {
  const select = run(toPay.slice(0, 2));
  assert.equal(reducer(select, { type: "PAYMENT_CARD_REJECTED", message: "Invalid card" }), select);
});

test("removing the card from an error screen returns to idle straight away", () => {
  const error = run([
    { type: "CARD_PRESENTED", uid: "BA01" },
    { type: "CARD_FAILED", message: "Invalid card" },
  ]);
  assert.equal(error.screen, "error");
  assert.deepEqual(reducer(error, { type: "CARD_REMOVED" }), initialState);
});

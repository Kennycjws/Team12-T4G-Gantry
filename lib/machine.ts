// The top-up flow as a pure state machine. No React or I/O, so it can be tested alone.
// Screens only render a state and dispatch events; they hold no flow logic.
import type { PaymentMethod } from "./config";

export type Card = { uid: string; name: string; balanceCents: number };

export type State =
  | { screen: "idle" }
  | { screen: "reading"; uid: string }
  | { screen: "select"; card: Card }
  | { screen: "cashUnavailable"; card: Card }
  | { screen: "pay"; card: Card; amountCents: number; method: PaymentMethod }
  | { screen: "processing"; card: Card; amountCents: number; method: PaymentMethod; attemptId: string }
  | { screen: "done"; card: Card; amountCents: number }
  | { screen: "error"; message: string };

export type Event =
  | { type: "CARD_PRESENTED"; uid: string }
  | { type: "CARD_REMOVED" }
  | { type: "CARD_LOADED"; card: Card }
  | { type: "CARD_FAILED"; message: string }
  | { type: "SELECT_TOPUP"; amountCents: number; method: PaymentMethod }
  | { type: "SELECT_CASH" }
  | { type: "ACKNOWLEDGE" }
  | { type: "CONFIRM_PAYMENT"; attemptId: string }
  | { type: "TOPUP_OK"; card: Card }
  | { type: "TOPUP_FAILED"; message: string }
  | { type: "CARD_EDITED"; card: Card }
  | { type: "TIMEOUT" };

export const initialState: State = { screen: "idle" };

export function reducer(state: State, event: Event): State {
  switch (event.type) {
    case "CARD_PRESENTED":
      return state.screen === "idle" ? { screen: "reading", uid: event.uid } : state;

    case "CARD_REMOVED":
      // Keep the screen while the top-up commits and on an error message.
      if (state.screen === "processing" || state.screen === "error") return state;
      return initialState;

    case "CARD_LOADED":
      return state.screen === "reading" && state.uid === event.card.uid
        ? { screen: "select", card: event.card }
        : state;

    case "CARD_FAILED":
      return state.screen === "reading" ? { screen: "error", message: event.message } : state;

    case "SELECT_TOPUP":
      return state.screen === "select"
        ? {
            screen: "pay",
            card: state.card,
            amountCents: event.amountCents,
            method: event.method,
          }
        : state;

    case "SELECT_CASH":
      return state.screen === "select" ? { screen: "cashUnavailable", card: state.card } : state;

    case "ACKNOWLEDGE":
      return state.screen === "cashUnavailable" ? { screen: "select", card: state.card } : state;

    case "CONFIRM_PAYMENT":
      return state.screen === "pay"
        ? { ...state, screen: "processing", attemptId: event.attemptId }
        : state;

    case "TOPUP_OK":
      return state.screen === "processing"
        ? { screen: "done", card: event.card, amountCents: state.amountCents }
        : state;

    case "TOPUP_FAILED":
      return state.screen === "processing" ? { screen: "error", message: event.message } : state;

    case "CARD_EDITED":
      return state.screen === "select" ? { screen: "select", card: event.card } : state;

    case "TIMEOUT":
      return state.screen === "processing" ? state : initialState;
  }
}

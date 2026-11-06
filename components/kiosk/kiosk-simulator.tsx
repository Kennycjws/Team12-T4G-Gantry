"use client"

import { useCallback, useEffect, useReducer, useState } from "react"
import { DevPanel } from "@/components/dev-panel"
import { useCardReader } from "@/hooks/use-card-reader"
import { config } from "@/lib/config"
import { initialState, reducer, type Card, type State } from "@/lib/machine"
import type { ReaderEvent } from "@/lib/reader-bus"
import { ScreenCash } from "./screen-cash"
import { ScreenCompletion } from "./screen-completion"
import { ScreenPay } from "./screen-pay"
import { ScreenPlacement } from "./screen-placement"
import { ScreenProcessing } from "./screen-processing"
import { ScreenSelect } from "./screen-select"
import { TeacherModeModal } from "./teacher-mode"

async function requestCard(url: string, init?: RequestInit): Promise<Card> {
  const response = await fetch(url, init)
  const body = await response.json()
  if (!response.ok) throw new Error(body.error ?? "Something went wrong")
  return body
}

function timeoutFor(state: State) {
  if (state.screen === "idle" || state.screen === "processing") return null
  if (state.screen === "done" || state.screen === "error") return config.resultScreenMs
  return config.screenTimeoutMs
}

export function KioskSimulator() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const [teacherOpen, setTeacherOpen] = useState(false)

  useCardReader(
    useCallback((event: ReaderEvent) => {
      if (event.type === "present") dispatch({ type: "CARD_PRESENTED", uid: event.uid })
      else dispatch({ type: "CARD_REMOVED" })
    }, []),
  )

  const uid = state.screen === "reading" ? state.uid : null
  useEffect(() => {
    if (!uid) return
    requestCard(`/api/cards/${uid}`)
      .then((card) => dispatch({ type: "CARD_LOADED", card }))
      .catch((error) => dispatch({ type: "CARD_FAILED", message: error.message }))
  }, [uid])

  const attempt = state.screen === "processing" ? state : null
  useEffect(() => {
    if (!attempt) return
    const { attemptId, card, amountCents, method } = attempt
    requestCard("/api/topups", {
      method: "POST",
      body: JSON.stringify({ attemptId, uid: card.uid, amountCents, method }),
    })
      .then((updated) => dispatch({ type: "TOPUP_OK", card: updated }))
      .catch((error) => dispatch({ type: "TOPUP_FAILED", message: error.message }))
  }, [attempt?.attemptId]) // eslint-disable-line react-hooks/exhaustive-deps

  const timeout = timeoutFor(state)
  useEffect(() => {
    if (timeout === null) return
    const timer = setTimeout(() => dispatch({ type: "TIMEOUT" }), timeout)
    return () => clearTimeout(timer)
  }, [state.screen, timeout])

  useEffect(() => {
    if (state.screen !== "done") return
    new Audio("/sounds/success.mp3").play().catch(() => {})
  }, [state.screen])

  async function saveBalance(card: Card, balanceCents: number) {
    const updated = await requestCard("/api/cards", {
      method: "POST",
      body: JSON.stringify({ ...card, balanceCents }),
    })
    dispatch({ type: "CARD_EDITED", card: updated })
    setTeacherOpen(false)
  }

  function renderScreen() {
    switch (state.screen) {
      case "idle":
      case "reading":
        return <ScreenPlacement />
      case "select":
        return (
          <ScreenSelect
            cardValue={state.card.balanceCents}
            onNets={(amountCents) =>
              dispatch({ type: "SELECT_TOPUP", amountCents, method: "nets" })
            }
            onCredit={(amountCents) =>
              dispatch({ type: "SELECT_TOPUP", amountCents, method: "credit" })
            }
            onCash={() => dispatch({ type: "SELECT_CASH" })}
            onOpenTeacher={() => setTeacherOpen(true)}
          />
        )
      case "cashUnavailable":
        return <ScreenCash onBack={() => dispatch({ type: "ACKNOWLEDGE" })} />
      case "pay":
        return (
          <ScreenPay
            method={state.method}
            amount={state.amountCents}
            onAdvance={() => dispatch({ type: "CONFIRM_PAYMENT", attemptId: crypto.randomUUID() })}
          />
        )
      case "processing":
        return <ScreenProcessing />
      case "done":
        return <ScreenCompletion newValue={state.card.balanceCents} added={state.amountCents} />
      case "error":
        return <ScreenCash message={state.message} onBack={() => dispatch({ type: "TIMEOUT" })} />
    }
  }

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 bg-neutral-900 p-4">
      {/* Device frame: 960x540 with dark teal bezel */}
      <div
        className="relative overflow-hidden rounded-[28px] border-[12px] border-bezel bg-bezel shadow-2xl"
        style={{ width: 960, height: 540, maxWidth: "95vw", maxHeight: "80vh" }}
      >
        <div className="h-full w-full overflow-hidden rounded-[16px]">{renderScreen()}</div>
        {teacherOpen && state.screen === "select" && (
          <TeacherModeModal
            currentValue={state.card.balanceCents}
            onClose={() => setTeacherOpen(false)}
            onSave={(balanceCents) => saveBalance(state.card, balanceCents)}
          />
        )}
      </div>
      {process.env.NODE_ENV === "development" && <DevPanel />}
    </main>
  )
}

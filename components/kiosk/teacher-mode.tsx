"use client"

import { useEffect, useRef, useState } from "react"
import { Lock, X, PencilLine } from "lucide-react"
import { config, formatMoney } from "@/lib/config"

const TEACHER_PASSWORD = "123456"

export function TeacherModeModal({
  currentValue,
  onClose,
  onSave,
}: {
  currentValue: number
  onClose: () => void
  onSave: (value: number) => void
}) {
  const [step, setStep] = useState<"password" | "edit">("password")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [value, setValue] = useState((currentValue / 100).toFixed(2))
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [step])

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  function submitPassword() {
    if (password === TEACHER_PASSWORD) {
      setError("")
      setStep("edit")
    } else {
      setError("Incorrect password. Please try again.")
      setPassword("")
    }
  }

  function submitValue() {
    const parsed = Number.parseFloat(value)
    if (Number.isNaN(parsed) || parsed < 0) {
      setError("Enter a valid amount (0 or greater).")
      return
    }
    const cents = Math.round(parsed * 100)
    if (cents > config.maxBalanceCents) {
      setError(`Maximum card value is ${formatMoney(config.maxBalanceCents)}.`)
      return
    }
    onSave(cents)
  }

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Teacher mode"
    >
      <div
        className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between bg-bezel px-4 py-3">
          <div className="flex items-center gap-2 text-white">
            <Lock size={16} />
            <span className="text-sm font-semibold">Teacher Mode</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close teacher mode"
            className="rounded-full p-1 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        {step === "password" ? (
          <div className="flex flex-col gap-3 p-5">
            <label htmlFor="teacher-password" className="text-sm font-medium text-bezel">
              Enter password to continue
            </label>
            <input
              ref={inputRef}
              id="teacher-password"
              type="password"
              inputMode="numeric"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) submitPassword()
              }}
              placeholder="••••"
              className="w-full rounded-lg border border-border bg-screen-2 px-3 py-2.5 text-center text-lg tracking-[0.4em] text-bezel outline-none focus:border-kiosk-green-2 focus:ring-2 focus:ring-kiosk-green-2/30"
            />
            {error && <p className="text-xs font-medium text-nets-red">{error}</p>}
            <button
              type="button"
              onClick={submitPassword}
              className="mt-1 rounded-lg bg-kiosk-green-2 py-2.5 text-sm font-bold text-white transition-all hover:bg-kiosk-green active:scale-[0.98]"
            >
              Unlock
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3 p-5">
            <label htmlFor="teacher-value" className="flex items-center gap-1.5 text-sm font-medium text-bezel">
              <PencilLine size={14} className="text-kiosk-green-2" />
              Set card value
            </label>
            <div className="flex items-center rounded-lg border border-border bg-screen-2 px-3 focus-within:border-kiosk-green-2 focus-within:ring-2 focus-within:ring-kiosk-green-2/30">
              <span className="text-lg font-bold text-bezel">$</span>
              <input
                ref={inputRef}
                id="teacher-value"
                type="number"
                min={0}
                step="0.01"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) submitValue()
                }}
                className="w-full bg-transparent px-1 py-2.5 text-lg font-bold text-bezel outline-none"
              />
            </div>
            {error && <p className="text-xs font-medium text-nets-red">{error}</p>}
            <div className="mt-1 flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-lg border border-border py-2.5 text-sm font-semibold text-bezel transition-colors hover:bg-screen-2"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitValue}
                className="flex-1 rounded-lg bg-kiosk-green-2 py-2.5 text-sm font-bold text-white transition-all hover:bg-kiosk-green active:scale-[0.98]"
              >
                Save value
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

"use client"

import { useEffect, useState } from "react"
import { HeaderBar } from "./header-bar"
import { config } from "@/lib/config"

// Shown in order, spread across the processing time, like a real payment terminal.
const STEPS = ["Connecting to payment terminal...", "Authorising payment...", "Updating card value..."]

export function ScreenProcessing() {
  const [step, setStep] = useState(0)

  useEffect(() => {
    const timer = setInterval(
      () => setStep((current) => Math.min(current + 1, STEPS.length - 1)),
      config.processingMs / STEPS.length,
    )
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="flex h-full w-full flex-col bg-screen-2">
      <HeaderBar />

      <div className="flex flex-1 flex-col items-center justify-center gap-6">
        <svg viewBox="0 0 50 50" className="h-20 w-20 animate-spin text-kiosk-green-2" aria-hidden="true">
          <circle cx="25" cy="25" r="20" fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="5" />
          <path
            d="M25 5 a20 20 0 0 1 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="5"
            strokeLinecap="round"
          />
        </svg>
        <div className="flex flex-col items-center gap-2 text-center" aria-live="polite">
          <p className="text-lg font-medium text-bezel">{STEPS[step]}</p>
          <p className="text-sm font-semibold text-nets-red">Please do not remove your card.</p>
        </div>
      </div>
    </div>
  )
}

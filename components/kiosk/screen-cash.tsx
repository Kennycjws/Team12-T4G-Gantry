"use client"

import { HeaderBar } from "./header-bar"
import { TrafficCone } from "lucide-react"

export function ScreenCash({
  message = "Service Currently Not Available",
  onBack,
}: {
  message?: string
  onBack: () => void
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onBack}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onBack()
      }}
      className="flex h-full w-full cursor-pointer flex-col bg-screen-2 text-left"
    >
      <HeaderBar />

      <div className="flex flex-1 flex-col items-center justify-center gap-7 p-6">
        {/* Warning triangle with traffic cone */}
        <div className="relative flex h-32 w-36 items-end justify-center">
          <svg viewBox="0 0 120 104" className="absolute inset-0 h-full w-full" aria-hidden="true">
            <path
              d="M60 6 L114 98 Q117 103 111 103 L9 103 Q3 103 6 98 Z"
              fill="var(--color-warn)"
              stroke="#111"
              strokeWidth="6"
              strokeLinejoin="round"
            />
          </svg>
          <TrafficCone size={46} className="relative mb-4 text-black" strokeWidth={2.4} />
        </div>

        <h1 className="max-w-md text-center text-3xl font-bold leading-tight text-black text-balance">
          {message}
        </h1>
      </div>
    </div>
  )
}

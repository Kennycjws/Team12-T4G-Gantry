"use client"

import { HeaderBar } from "./header-bar"

export function ScreenProcessing() {
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
        <p className="text-lg font-medium text-bezel">Processing. Please wait...</p>
      </div>
    </div>
  )
}

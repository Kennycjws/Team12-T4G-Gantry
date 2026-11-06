"use client"

import { useEffect, useState } from "react"

export function KioskLogo({ size = 22 }: { size?: number }) {
  return (
    <img
      src="/kiosk/logo.png"
      alt="Kiosk operator logo"
      width={size * 1.55}
      height={size}
      style={{ width: size * 1.55, height: size, objectFit: "cover" }}
      className="rounded-[3px]"
    />
  )
}

const LANGUAGES = ["English", "中文", "Melayu", "தமிழ்"]

function formatClock(now: Date) {
  const time = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
  const date = now
    .toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    .toUpperCase()
  return { time, date }
}

export function HeaderBar() {
  // Set after mount: the server's clock would not match the browser's during hydration.
  const [clock, setClock] = useState<{ time: string; date: string } | null>(null)

  useEffect(() => {
    const tick = () => setClock(formatClock(new Date()))
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <header className="flex items-center justify-between bg-kiosk-bar px-3 py-1.5 text-white">
      <div className="flex items-center gap-2.5">
        <KioskLogo />
        <span className="text-[11px] font-medium tracking-wide text-white/85">
          {clock?.time} <span className="text-white/35">|</span> {clock?.date}
        </span>
      </div>
      <div className="flex items-center gap-2" role="group" aria-label="Language selection">
        {LANGUAGES.map((lang, i) => (
          <button
            key={lang}
            type="button"
            onClick={(e) => e.stopPropagation()}
            className={
              i === 0
                ? "rounded-md bg-white px-2.5 py-1 text-[11px] font-semibold text-kiosk-bar"
                : "px-1 py-1 text-[11px] font-medium text-white/85 hover:text-white"
            }
          >
            {lang}
          </button>
        ))}
      </div>
    </header>
  )
}

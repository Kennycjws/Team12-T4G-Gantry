"use client"

import { HeaderBar } from "./header-bar"
import { Check, Volume2 } from "lucide-react"
import { formatMoney } from "@/lib/config"

export function ScreenCompletion({
  newValue,
  added,
}: {
  newValue: number
  added: number
}) {
  return (
    <div className="relative flex h-full w-full flex-col bg-screen text-left">
      <HeaderBar />

      <div className="flex flex-1 items-stretch gap-4 p-5">
        <div className="flex flex-1 flex-col items-center justify-center rounded-xl bg-white p-6 shadow-sm">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-kiosk-green-2 text-white shadow">
            <Check size={30} strokeWidth={3} />
          </div>
          <p className="mt-4 text-sm font-medium text-muted-foreground">New value</p>
          <p className="text-4xl font-bold tracking-tight text-bezel">{formatMoney(newValue)}</p>

          <div className="mt-5 flex w-full max-w-[240px] items-center justify-between border-t border-black/10 pt-3 text-sm">
            <span className="text-muted-foreground">Value added</span>
            <span className="font-semibold text-bezel">{formatMoney(added)}</span>
          </div>

          <p className="mt-6 text-sm font-medium text-kiosk-green">Please remove card</p>
        </div>

        <div className="w-[42%] overflow-hidden rounded-xl shadow-sm">
          <img
            src="/kiosk/mrt-kiosk.webp"
            alt="Teal MRT station self-service top-up kiosks"
            className="h-full w-full object-cover"
            crossOrigin="anonymous"
          />
        </div>
      </div>

      <span className="absolute bottom-4 right-4 flex h-9 w-9 items-center justify-center rounded-full bg-black/10 text-bezel">
        <Volume2 size={16} />
      </span>
    </div>
  )
}

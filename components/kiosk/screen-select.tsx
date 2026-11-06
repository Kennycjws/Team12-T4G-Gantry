"use client"

import { HeaderBar } from "./header-bar"
import { History, Gift, Plus, Coins, Lock } from "lucide-react"
import { config, formatMoney } from "@/lib/config"

const AMOUNT_BUTTON =
  "rounded-md bg-kiosk-green-2 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:bg-kiosk-green active:scale-[0.97]"

function AmountGrid({ label, onPick }: { label: string; onPick: (cents: number) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {config.topUpAmountsCents.map((cents) => (
        <button
          key={cents}
          type="button"
          aria-label={`$${cents / 100} by ${label}`}
          onClick={() => onPick(cents)}
          className={AMOUNT_BUTTON}
        >
          ${cents / 100}
        </button>
      ))}
      {/* Shown to match the machine. Does nothing yet. */}
      <button type="button" className={AMOUNT_BUTTON}>
        More
      </button>
    </div>
  )
}

function NetsMark() {
  return <img src="/kiosk/nets.png" alt="NETS" className="h-6 w-auto object-contain" />
}

export function ScreenSelect({
  onNets,
  onCredit,
  onCash,
  cardValue,
  onOpenTeacher,
}: {
  onNets: (amt: number) => void
  onCredit: (amt: number) => void
  onCash: () => void
  cardValue: number
  onOpenTeacher: () => void
}) {
  return (
    <div className="flex h-full w-full flex-col bg-screen">
      <HeaderBar />

      <div className="flex flex-1 flex-col gap-2.5 px-4 pt-2.5">
        <h1 className="text-lg font-semibold text-bezel">Select amount</h1>

        <div className="flex flex-1 gap-3">
          {/* Left: card value */}
          <div className="flex w-[30%] flex-col rounded-xl bg-white p-3 shadow-sm">
            <div className="flex items-start justify-between">
              <p className="text-xs font-medium text-muted-foreground">Card value</p>
              <img src="/kiosk/simplygo.png" alt="SimplyGo" className="h-3.5 w-auto object-contain" />
            </div>
            <p className="mt-1 text-3xl font-bold tracking-tight text-bezel">{formatMoney(cardValue)}</p>
            <p className="mt-1 text-[10px] text-muted-foreground">Card expires: {config.cardExpiry}</p>
            <button
              type="button"
              onClick={onOpenTeacher}
              className="mt-auto flex w-fit items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] font-semibold text-muted-foreground transition-colors hover:bg-screen-2 hover:text-bezel"
            >
              <Lock size={11} />
              Teacher Mode
            </button>
          </div>

          {/* Right: payment columns */}
          <div className="grid flex-1 grid-cols-2 gap-3">
            {/* NETS */}
            <div className="flex flex-col overflow-hidden rounded-xl bg-white shadow-sm">
              <div className="flex items-center justify-center bg-kiosk-green/10 py-1.5">
                <span className="text-sm font-semibold text-bezel">NETS Card</span>
              </div>
              <div className="flex flex-col gap-2 p-2.5">
                <div className="flex justify-center py-0.5">
                  <NetsMark />
                </div>
                <AmountGrid label="NETS Card" onPick={onNets} />
              </div>
            </div>

            {/* Credit / Debit */}
            <div className="flex flex-col overflow-hidden rounded-xl bg-white shadow-sm">
              <div className="flex items-center justify-center bg-kiosk-green/10 py-1.5">
                <span className="text-sm font-semibold text-bezel">Credit / Debit Card</span>
              </div>
              <div className="flex flex-col gap-2 p-2.5">
                <div className="flex items-center justify-center gap-2 py-0.5">
                  <img src="/kiosk/visa.webp" alt="Visa" className="h-4 w-auto object-contain" />
                  <img src="/kiosk/mastercard.png" alt="Mastercard" className="h-5 w-auto object-contain" />
                  <img src="/kiosk/jcb.png" alt="JCB" className="h-5 w-auto object-contain" />
                </div>
                <AmountGrid label="Credit / Debit Card" onPick={onCredit} />
              </div>
            </div>
          </div>
        </div>

        {/* Cash button */}
        <button
          type="button"
          onClick={onCash}
          className="flex w-fit items-center gap-2 rounded-md border border-warn/60 bg-white py-2 pl-3 pr-5 text-sm font-bold text-bezel shadow-sm transition-all hover:bg-screen-2 active:scale-[0.98]"
        >
          <Coins size={18} className="text-warn" />
          Cash
        </button>
      </div>

      {/* Bottom nav */}
      <div className="mt-2.5 flex items-center gap-2 bg-kiosk-green px-3 py-2">
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-md bg-kiosk-green-2 px-3 py-1.5 text-[11px] font-semibold text-white"
        >
          <Plus size={14} />
          Add value
        </button>
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-[11px] font-medium text-bezel"
        >
          <History size={14} />
          Transaction History
        </button>
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-[11px] font-medium text-bezel"
        >
          <Gift size={14} />
          Vouchers & Rewards
        </button>
      </div>
    </div>
  )
}

"use client"

import { HeaderBar } from "./header-bar"

import { formatMoney, paymentLabels, type PaymentMethod } from "@/lib/config"

function NetsMark() {
  return <img src="/kiosk/nets.png" alt="NETS" className="h-7 w-auto object-contain" />
}

export function ScreenPay({
  method,
  amount,
  onAdvance,
}: {
  method: PaymentMethod
  amount: number
  onAdvance: () => void
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onAdvance}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onAdvance()
      }}
      className="relative flex h-full w-full cursor-pointer flex-col bg-screen-2 text-left"
    >
      <HeaderBar />

      <div className="flex flex-1 flex-col px-5 pt-3">
        <h1 className="text-lg font-semibold text-bezel">
          Pay {formatMoney(amount)} by {paymentLabels[method]}
        </h1>

        <div className="relative mt-2 flex flex-1 items-center justify-center">
          {/* Terminal photo (includes payment-method strip) */}
          <div className="flex h-[74%] w-[46%] items-center justify-center overflow-hidden rounded-2xl">
            <img
              src="/kiosk/terminal.jpg"
              alt="Card payment terminal with NETS, Visa, Mastercard and JCB logos"
              className="h-full w-full object-contain"
              crossOrigin="anonymous"
            />
          </div>
        </div>

        {/* NETS mark below terminal */}
        <div className="flex -translate-y-2 justify-center pb-4">
          <NetsMark />
        </div>
      </div>
    </div>
  )
}

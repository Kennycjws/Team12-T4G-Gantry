"use client"

export function ScreenPlacement() {
  return (
    <div className="relative h-full w-full overflow-hidden bg-bezel">
      <img
        src="/kiosk/mrt-kiosk.webp"
        alt="Teal MRT station self-service top-up kiosks"
        className="h-full w-full object-cover"
        crossOrigin="anonymous"
      />

      <div className="absolute left-0 top-1/2 -translate-y-1/2">
        <div className="rounded-r-2xl bg-kiosk-green-2 py-4 pl-6 pr-8 text-white shadow-lg">
          <p className="text-2xl font-semibold leading-tight text-balance">
            Place your card to
            <br />
            begin
          </p>
        </div>
      </div>
    </div>
  )
}

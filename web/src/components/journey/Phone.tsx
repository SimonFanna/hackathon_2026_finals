"use client";

import { BatteryFull, CellSignalFull, WifiHigh } from "@phosphor-icons/react";

export const FRAME_W = 410;
export const FRAME_H = 864;

/** A phone frame scaled to the stage. Below 520px wide the app runs full screen (a real phone). */
export function Phone({ scale, framed, children }: { scale: number; framed: boolean; children: React.ReactNode }) {
  if (!framed) {
    return <div className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-surface">{children}</div>;
  }
  return (
    <div style={{ width: FRAME_W * scale, height: FRAME_H * scale }} className="relative shrink-0">
      <div
        style={{ width: FRAME_W, height: FRAME_H, transform: `scale(${scale})`, transformOrigin: "top left" }}
        className="absolute left-0 top-0 rounded-[60px] bg-[#070d17] p-[10px] shadow-phone"
      >
        <div className="relative flex h-full w-full flex-col overflow-hidden rounded-[50px] bg-surface">
          <StatusBar />
          {children}
          <span aria-hidden className="pointer-events-none absolute bottom-2 left-1/2 z-30 h-[5px] w-[134px] -translate-x-1/2 rounded-full bg-night/80" />
        </div>
      </div>
    </div>
  );
}

function StatusBar() {
  return (
    <div aria-hidden className="relative z-20 flex h-[50px] shrink-0 items-center justify-between px-8 pt-2 text-[15px] font-bold text-night">
      <span className="tabular">9:41</span>
      <span className="absolute left-1/2 top-[11px] h-[30px] w-[118px] -translate-x-1/2 rounded-full bg-[#070d17]" />
      <span className="flex items-center gap-1.5">
        <CellSignalFull size={17} weight="fill" />
        <WifiHigh size={17} weight="bold" />
        <BatteryFull size={22} weight="fill" />
      </span>
    </div>
  );
}

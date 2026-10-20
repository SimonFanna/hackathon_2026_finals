"use client";

import type { Scoreboard } from "@/engine";
import { StageLabel } from "./IntentPanel";
import { eur, num } from "./format";
import { useTween } from "./useTween";

export function ScoreboardPanel({ board, decided, total }: { board: Scoreboard; decided: number; total: number }) {
  return (
    <section aria-labelledby="win-title" className="flex flex-col gap-5 rounded-3xl bg-navy p-6 text-white shadow-2xl shadow-navy/25">
      <StageLabel n={3} id="win-title" dark>Triple win · live</StageLabel>

      <Block title="Customer" accent="bg-[#ffb547]">
        <Big value={board.customer.eur} fmt={eur} label="saved or unlocked" />
        <div className="grid grid-cols-2 gap-3">
          <Small value={board.customer.kwhPerYear} fmt={num} label="kWh / year saved" />
          <Small value={board.customer.co2KgPerYear} fmt={num} label="kg CO₂ / year" />
        </div>
      </Block>

      <Block title="KBC" accent="bg-kbc">
        <div className="grid grid-cols-2 gap-3">
          <Small value={board.kbc.productsActivated} fmt={num} label="products activated" big />
          <Small value={board.kbc.revenueEur} fmt={eur} label="revenue" big />
        </div>
      </Block>

      <Block title="Partners" accent="bg-[#7cc243]">
        <div className="grid grid-cols-2 gap-3">
          <Small value={board.partners.leads} fmt={num} label="consented leads" big />
          <Small value={board.partners.valueEur} fmt={eur} label="lead value" big />
        </div>
      </Block>

      <div>
        <div className="flex justify-between font-mono text-[0.72rem] uppercase tracking-wider text-white/60">
          <span>Journey progress</span>
          <span className="tabular">{decided} / {total}</span>
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-white/10">
          <div className="h-full rounded-full bg-white transition-[width] duration-500" style={{ width: `${(decided / Math.max(total, 1)) * 100}%` }} />
        </div>
      </div>

      <p className="text-[0.72rem] leading-snug text-white/50">Illustrative figures for the demo — not KBC data.</p>
    </section>
  );
}

function Block({ title, accent, children }: { title: string; accent: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-t border-white/10 pt-4">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <span className={`size-2.5 rounded-full ${accent}`} aria-hidden />
        {title}
      </p>
      {children}
    </div>
  );
}

function Big({ value, fmt, label }: { value: number; fmt: (n: number) => string; label: string }) {
  const v = useTween(value);
  return (
    <p>
      <span className="tabular block font-display text-[2.8rem] font-extrabold leading-none" aria-live="polite">{fmt(v)}</span>
      <span className="text-[0.8rem] text-white/60">{label}</span>
    </p>
  );
}

function Small({ value, fmt, label, big }: { value: number; fmt: (n: number) => string; label: string; big?: boolean }) {
  const v = useTween(value);
  return (
    <p>
      <span className={`tabular block font-mono font-semibold leading-tight ${big ? "text-[1.7rem]" : "text-[1.25rem]"}`}>{fmt(v)}</span>
      <span className="text-[0.75rem] text-white/60">{label}</span>
    </p>
  );
}

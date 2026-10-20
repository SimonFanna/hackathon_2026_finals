"use client";

import type { Customer, DetectedIntent, Signal } from "@/engine";
import { pct, shortDate } from "./format";

export type IntentStatus = "detected" | "confirmed" | "declined";

export function IntentPanel({
  customer,
  signals,
  intent,
  status,
  onConfirm,
  onDecline,
}: {
  customer: Customer;
  signals: Signal[];
  intent: DetectedIntent | undefined;
  status: IntentStatus;
  onConfirm: () => void;
  onDecline: () => void;
}) {
  const mine = signals.filter((s) => s.customerId === customer.id);

  return (
    <section aria-labelledby="signals-title" className="flex flex-col gap-5">
      <StageLabel n={1} id="signals-title">Signals</StageLabel>

      <ol className="flex flex-col gap-2.5">
        {mine.map((s, i) => (
          <li
            key={s.id}
            className="rise rounded-xl border border-line bg-white px-4 py-3 shadow-[0_1px_0_rgb(11_37_71/0.04)]"
            style={{ animationDelay: `${120 + i * 140}ms` }}
          >
            <div className="flex items-center justify-between font-mono text-[0.72rem] uppercase tracking-wider text-mute">
              <span>{s.source}</span>
              <time dateTime={s.observedAt}>{shortDate(s.observedAt)}</time>
            </div>
            <p className="mt-1 text-[0.95rem] leading-snug">{s.label}</p>
          </li>
        ))}
      </ol>

      {intent ? (
        <article
          className="rise relative overflow-hidden rounded-2xl bg-navy p-5 text-white shadow-xl shadow-navy/20"
          style={{ animationDelay: `${200 + mine.length * 140}ms` }}
        >
          <p className="font-mono text-[0.72rem] uppercase tracking-[0.16em] text-kbc">Intent detected</p>
          <h2 className="mt-1 font-display text-[1.9rem] font-extrabold leading-none">{intent.label}</h2>

          <div className="mt-5">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-white/70">Confidence</span>
              <span className="tabular font-mono text-2xl font-semibold">{pct(intent.confidence)}</span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-white/15" role="presentation">
              <div className="h-full rounded-full bg-kbc transition-[width] duration-700" style={{ width: pct(intent.confidence) }} />
            </div>
          </div>

          <details className="group mt-4 text-sm">
            <summary className="cursor-pointer list-none text-white/80 hover:text-white">
              <span className="underline decoration-white/30 underline-offset-4">Why am I seeing this?</span>
            </summary>
            <ul className="mt-2 flex flex-col gap-1.5 text-white/80">
              {intent.reasons.map((r) => (
                <li key={r} className="flex gap-2">
                  <span aria-hidden className="text-kbc">→</span>
                  {r}
                </li>
              ))}
            </ul>
          </details>

          {status === "detected" && intent.needsConfirmation && (
            <div className="mt-5 rounded-xl bg-white/10 p-4">
              <p className="font-display text-lg font-semibold leading-tight">Is buying a home your project?</p>
              <p className="mt-1 text-sm text-white/70">We are not sure enough to assume — so we ask first.</p>
              <div className="mt-3 flex flex-col gap-2">
                <button
                  onClick={onConfirm}
                  className="pulse rounded-lg bg-kbc px-4 py-2.5 font-semibold text-white transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  Yes, it&apos;s my project
                </button>
                <button
                  onClick={onDecline}
                  className="rounded-lg px-4 py-2.5 font-medium text-white/80 ring-1 ring-white/25 transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white"
                >
                  Not now
                </button>
              </div>
            </div>
          )}
          {status === "detected" && !intent.needsConfirmation && (
            <button onClick={onConfirm} className="mt-5 w-full rounded-lg bg-kbc px-4 py-2.5 font-semibold">
              Show my journey
            </button>
          )}
          {status === "confirmed" && (
            <p className="mt-5 flex items-center gap-2 text-sm font-medium text-white/90">
              <span className="grid size-5 place-items-center rounded-full bg-kbc text-[0.7rem]">✓</span>
              Confirmed by {customer.name}
            </p>
          )}
          {status === "declined" && (
            <p className="mt-5 text-sm text-white/80">Understood. KBC stays quiet — nothing is shared.</p>
          )}
        </article>
      ) : (
        <p className="rounded-xl border border-dashed border-line p-4 text-mute">No intent detected. KBC says nothing.</p>
      )}
    </section>
  );
}

export function StageLabel({ n, id, children, dark }: { n: number; id?: string; children: React.ReactNode; dark?: boolean }) {
  return (
    <h2 id={id} className={`flex items-center gap-3 font-mono text-[0.78rem] font-semibold uppercase tracking-[0.18em] ${dark ? "text-white/70" : "text-mute"}`}>
      <span className={`grid size-6 place-items-center rounded-full text-[0.72rem] ${dark ? "bg-white text-navy" : "bg-navy text-white"}`}>{n}</span>
      {children}
    </h2>
  );
}

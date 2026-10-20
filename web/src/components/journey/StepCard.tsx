"use client";

import type { JourneyStep, StepDecision } from "@/engine";
import { eur, num } from "./format";

export function StepCard({
  step,
  decision,
  consents,
  onDecide,
  onConsent,
  index,
}: {
  step: JourneyStep;
  decision: StepDecision;
  consents: Record<string, boolean>;
  onDecide: (d: StepDecision) => void;
  onConsent: (field: string, ok: boolean) => void;
  index: number;
}) {
  const isPartner = step.provider.kind === "partner";
  const providerName = step.provider.kind === "partner" ? step.provider.name : "KBC";
  const shared = step.dataShared.filter((f) => consents[f]);
  const noLead = isPartner && decision === "accepted" && shared.length === 0;
  const o = step.outcome;

  const badges = [
    o.customerEur ? `+${eur(o.customerEur)} for you` : null,
    o.kwhPerYear ? `−${num(o.kwhPerYear)} kWh/yr` : null,
    o.co2KgPerYear ? `−${num(o.co2KgPerYear)} kg CO₂/yr` : null,
  ].filter(Boolean) as string[];

  return (
    <li className="rise relative pl-14" style={{ animationDelay: `${index * 70}ms` }}>
      {/* timeline node */}
      <span
        aria-hidden
        className={`absolute left-0 top-4 grid size-10 place-items-center rounded-full font-mono text-sm font-semibold ring-4 ring-paper transition-colors ${
          decision === "accepted" ? "bg-kbc text-white" : decision === "skipped" ? "bg-line text-mute" : "bg-white text-navy ring-offset-0 outline outline-1 outline-line"
        }`}
      >
        {decision === "accepted" ? "✓" : step.order}
      </span>

      <article
        className={`rounded-2xl border bg-white p-5 transition-all duration-300 ${
          decision === "accepted"
            ? "border-kbc/50 shadow-lg shadow-kbc/10"
            : decision === "skipped"
              ? "border-line opacity-55"
              : "border-line shadow-sm"
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-[0.72rem] font-semibold uppercase tracking-wider">
              <span className={`rounded-full px-2.5 py-1 ${isPartner ? "bg-partner-soft text-partner" : "bg-sky text-kbc"}`}>
                {isPartner ? `Partner · ${providerName}` : "KBC"}
              </span>
              <span className="text-mute">{step.ecosystem}</span>
            </div>
            <h3 className={`mt-2 font-display text-[1.35rem] font-semibold leading-tight text-navy ${decision === "skipped" ? "line-through decoration-2" : ""}`}>
              {step.title}
            </h3>
            <p className="mt-1 text-[0.95rem] leading-snug text-mute">{step.why}</p>
          </div>

          <div role="group" aria-label={`Decision for ${step.title}`} className="flex shrink-0 overflow-hidden rounded-lg ring-1 ring-line">
            <button
              onClick={() => onDecide(decision === "accepted" ? "pending" : "accepted")}
              aria-pressed={decision === "accepted"}
              className={`px-4 py-2 text-sm font-semibold transition focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-kbc ${
                decision === "accepted" ? "bg-kbc text-white" : "bg-white text-navy hover:bg-sky"
              }`}
            >
              Accept
            </button>
            <button
              onClick={() => onDecide(decision === "skipped" ? "pending" : "skipped")}
              aria-pressed={decision === "skipped"}
              className={`border-l border-line px-4 py-2 text-sm font-semibold transition focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-kbc ${
                decision === "skipped" ? "bg-navy text-white" : "bg-white text-mute hover:bg-paper"
              }`}
            >
              Skip
            </button>
          </div>
        </div>

        {badges.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2">
            {badges.map((b) => (
              <li key={b} className="tabular rounded-md bg-paper px-2 py-1 font-mono text-[0.78rem] text-ink">
                {b}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 border-t border-dashed border-line pt-3">
          {isPartner && step.dataShared.length > 0 ? (
            <fieldset disabled={decision === "skipped"}>
              <legend className="text-[0.8rem] text-mute">
                Shared with <b className="font-semibold text-ink">{providerName}</b> only if you agree:
              </legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {step.dataShared.map((f) => (
                  <ConsentToggle key={f} label={f} on={!!consents[f]} onChange={(v) => onConsent(f, v)} />
                ))}
              </div>
              {noLead && (
                <p className="mt-2 text-[0.8rem] font-medium text-warn">
                  Nothing shared — {providerName} cannot follow up. No lead for the partner.
                </p>
              )}
            </fieldset>
          ) : (
            <p className="text-[0.8rem] text-mute">
              <span aria-hidden>🔒 </span>Stays inside KBC — no data leaves the bank.
            </p>
          )}
          <p className="mt-2 font-mono text-[0.68rem] uppercase tracking-wider text-mute/80">Catalogue · {step.catalogueItem}</p>
        </div>
      </article>
    </li>
  );
}

function ConsentToggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-[0.82rem] font-medium ring-1 transition disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kbc ${
        on ? "bg-partner-soft text-partner ring-partner/30" : "bg-white text-mute ring-line"
      }`}
    >
      <span className={`relative h-5 w-9 rounded-full transition-colors ${on ? "bg-partner" : "bg-line"}`}>
        <span className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-all ${on ? "left-[1.125rem]" : "left-0.5"}`} />
      </span>
      {label}
    </button>
  );
}

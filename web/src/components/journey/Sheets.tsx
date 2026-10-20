"use client";

import type { JourneyState, JourneyStep, Signal } from "@/engine";
import { providerName, purposeFor } from "./copy";
import { eur, naturalList, num, shortDate } from "./format";
import { Sheet, Switch } from "./Sheet";
import { PrimaryButton } from "./ui";

export function WhySheet({ open, signals, note, onClose }: { open: boolean; signals: Signal[]; note: string; onClose: () => void }) {
  return (
    <Sheet open={open} title="Why am I seeing this?" onClose={onClose}>
      <p className="text-[16px] leading-[23px] text-night-300">Kate noticed these moments in the last few weeks:</p>
      <ul className="mt-3 space-y-3">
        {signals.map((s) => (
          <li key={s.id} className="rounded-[8px] bg-element p-3.5">
            <p className="text-[16px] font-semibold leading-[22px]">{s.label}</p>
            <p className="mt-0.5 text-[13px] text-night-300">{s.source} · {shortDate(s.observedAt)}</p>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[15px] leading-[21px] text-night-300">
        {note}
      </p>
      <div className="mt-5"><PrimaryButton onClick={onClose}>Got it</PrimaryButton></div>
    </Sheet>
  );
}

export function ConsentSheet({
  open, step, consents, onToggle, onClose,
}: { open: boolean; step: JourneyStep | null; consents: Record<string, boolean>; onToggle: (field: string, ok: boolean) => void; onClose: () => void }) {
  const name = step ? providerName(step) : "";
  const chosen = step ? step.dataShared.filter((f) => consents[f]) : [];
  return (
    <Sheet open={open && !!step} title={`Choose what ${name} receives`} onClose={onClose}>
      {step && (
        <>
          <p className="text-[15px] leading-[21px] text-night-300">{purposeFor(step)}</p>
          <div className="mt-3">
            {step.dataShared.map((f) => (
              <Switch key={f} label={f} on={!!consents[f]} onChange={(v) => onToggle(f, v)} />
            ))}
          </div>
          <p className="mt-4 rounded-[8px] bg-element p-3.5 text-[15px] leading-[21px]" aria-live="polite">
            {chosen.length > 0 ? <>{name} will receive: <b>{naturalList(chosen)}</b>. Shared once.</> : <>{name} will receive nothing.</>}
          </p>
          <div className="mt-5"><PrimaryButton onClick={onClose}>Done</PrimaryButton></div>
        </>
      )}
    </Sheet>
  );
}

export function EstimateSheet({ open, state, onClose }: { open: boolean; state: JourneyState | null; onClose: () => void }) {
  const accepted = state ? state.journey.steps.filter((s) => state.decisions[s.id] === "accepted") : [];
  return (
    <Sheet open={open} title="How we estimate this" onClose={onClose}>
      <p className="text-[15px] leading-[21px] text-night-300">
        Each accepted step adds its own estimate. These are estimates, not KBC offers.
      </p>
      <ul className="mt-3 divide-y divide-night-100/60">
        {accepted.map((s) => {
          const o = s.outcome;
          const parts = [
            o.customerEurOneOff ? `${eur(o.customerEurOneOff)} once` : null,
            o.customerEurPerYear ? `${eur(o.customerEurPerYear)}/yr` : null,
            o.kwhPerYear ? `${num(o.kwhPerYear)} kWh/yr` : null,
            o.co2KgPerYear ? `${num(o.co2KgPerYear)} kg CO₂/yr` : null,
          ].filter(Boolean);
          return (
            <li key={s.id} className="py-3">
              <p className="text-[15px] font-semibold">{s.title}</p>
              <p className="tabular text-[13px] text-night-300">{parts.length ? parts.join(" · ") : "No direct saving for you"}</p>
            </li>
          );
        })}
      </ul>
      <div className="mt-5"><PrimaryButton onClick={onClose}>Close</PrimaryButton></div>
    </Sheet>
  );
}

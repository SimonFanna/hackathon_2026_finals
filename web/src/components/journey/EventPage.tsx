"use client";

import { ArrowRight, WarningCircle } from "@phosphor-icons/react";
import type { PendingHit, Persona, Run } from "@/engine";
import { formatLimit, formatValue } from "./copy";
import { KateLine } from "./Kate";
import { EventBadge, HealthBar } from "./outcome-ui";
import { OptionCard, rankOptions } from "./OutcomeScreens";
import { PrimaryButton, ScreenLayout } from "./ui";

/**
 * Demo V2: one page per surprise, kept light for the stage. One headline, one line on what happened,
 * the broken limit (before → after) in one row, and the scored options as compact cards with Kate's pick.
 * No motion of its own: the page slide (Stage) and the phone jolt are the whole transition.
 */
export function EventPage({
  persona, run, pending, index, selected, onSelect, onChoose,
}: {
  persona: Persona;
  run: Run;
  pending: PendingHit;
  /** 0-based index of the surprise. */
  index: number;
  selected: string | null;
  onSelect: (id: string) => void;
  onChoose: () => void;
}) {
  const d = pending.disruption;
  const model = persona.outcome;
  const options = rankOptions(pending.options);
  const chosen = pending.options.find((o) => o.id === selected);
  const label = !chosen ? "Choose an option" : chosen.recommended ? "Go with Kate's pick" : chosen.feasible ? "Choose this option" : "Choose it anyway";

  return (
    <ScreenLayout actions={<PrimaryButton onClick={onChoose}>{label}</PrimaryButton>}>
      <div className="pt-3">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full bg-danger px-3 py-1.5 text-[13px] font-bold text-white">
            <WarningCircle size={16} weight="bold" />
            Unexpected · {index + 1} of {model.disruptions.length}
          </span>
          <span className="text-[13px] font-semibold text-night-300">Month {d.month}</span>
        </div>

        <div className="mt-4 flex items-start gap-3.5">
          <EventBadge kind={d.kind} size={44} />
          <div className="min-w-0">
            <h1 className="text-[24px] font-extrabold leading-[28px] tracking-[-0.02em]">{d.title}</h1>
            <p className="mt-1.5 text-[15px] leading-[21px] text-night-300">{d.detail}</p>
          </div>
        </div>

        <div className="mt-4 rounded-[8px] border border-danger/25 bg-white p-4 shadow-card">
          <HealthBar value={pending.healthHit} from={pending.healthBefore} />
          <ul className="mt-3 space-y-1.5">
            {pending.broken.map((c) => {
              const def = model.constraints.find((x) => x.key === c.key)!;
              return (
                <li key={c.key} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[14px] leading-[19px]">
                  <span className="whitespace-nowrap font-semibold">{def.label}</span>
                  <span className="tabular ml-auto flex items-center gap-1.5 whitespace-nowrap font-bold">
                    <span className="text-night-300">{formatValue(def, run.plan.values[c.key])}</span>
                    <ArrowRight size={14} weight="bold" className="text-danger" />
                    <span className="text-danger">{formatValue(def, c.value)}</span>
                    <span className="font-semibold text-night-300">· {formatLimit(def, c.limit)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="mt-4">
          <KateLine>I&apos;ve re-planned. Pick the way you prefer.</KateLine>
        </div>

        <div role="radiogroup" aria-label="Options" className="mt-3 space-y-2">
          {options.map((o, i) => (
            <OptionCard key={o.id} option={o} n={i + 1} persona={persona} active={o.id === selected} onSelect={() => onSelect(o.id)} />
          ))}
        </div>
      </div>
    </ScreenLayout>
  );
}

"use client";

import { ArrowRight, WarningCircle } from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";
import type { PendingHit, Persona, Run } from "@/engine";
import { formatLimit, formatValue, kindLabel } from "./copy";
import { KateLine } from "./Kate";
import { EventBadge, HealthBar } from "./outcome-ui";
import { OptionCard, rankOptions } from "./OutcomeScreens";
import { PrimaryButton, ScreenLayout } from "./ui";

/**
 * Demo V2: one page per surprise. What happened, what broke (before → after), the scored options
 * with Kate's recommendation, and the customer's pick. Merges the old EventScreen + OptionsScreen.
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
  const reduce = useReducedMotion();
  const d = pending.disruption;
  const model = persona.outcome;
  const told = d.kind === "income" || d.kind === "health";
  const options = rankOptions(pending.options);
  const chosen = pending.options.find((o) => o.id === selected);
  const label = !chosen ? "Choose an option" : chosen.recommended ? "Go with Kate's pick" : chosen.feasible ? "Choose this option" : "Choose it anyway";
  const usable = pending.options.filter((o) => o.available && o.strategy !== "keep").length;

  return (
    <ScreenLayout actions={<PrimaryButton onClick={onChoose}>{label}</PrimaryButton>}>
      <div className="pt-3">
        <motion.div
          initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", bounce: 0.3, duration: 0.5 }}
          className="flex items-center gap-2"
        >
          <span className="flex items-center gap-1.5 rounded-full bg-danger px-3 py-1.5 text-[13px] font-bold text-white">
            <WarningCircle size={16} weight="bold" />
            Unexpected · {index + 1} of {model.disruptions.length}
          </span>
          <span className="text-[13px] font-semibold text-night-300">Month {d.month} · {kindLabel[d.kind]}</span>
        </motion.div>

        <div className="mt-4 flex items-start gap-3.5">
          <EventBadge kind={d.kind} size={44} />
          <div className="min-w-0">
            <h1 className="text-[24px] font-extrabold leading-[28px] tracking-[-0.02em]">{d.title}</h1>
            <p className="mt-1.5 text-[15px] leading-[21px]">{d.detail}</p>
            <p className="mt-1 text-[13px] font-semibold text-night-300">{told ? "You told Kate" : `Source: ${d.source}`}</p>
          </div>
        </div>

        <div className="mt-4 rounded-[8px] border border-danger/25 bg-white p-4 shadow-card">
          <HealthBar value={pending.healthHit} from={pending.healthBefore} />
          <h2 className="mt-4 text-[13px] font-bold text-night-300">What this breaks</h2>
          <ul className="mt-1.5 space-y-1.5">
            {pending.broken.map((c) => {
              const def = model.constraints.find((x) => x.key === c.key)!;
              const before = run.plan.values[c.key];
              return (
                <li key={c.key} className="text-[14px] leading-[19px]">
                  <span className="font-semibold">{def.label}</span>
                  <span className="tabular mt-0.5 flex items-center gap-1.5 font-bold">
                    <span className="text-night-300">{formatValue(def, before)}</span>
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
          <KateLine delay={0.3}>
            I&apos;ve recalculated your plan. There {usable === 1 ? "is 1 way" : `are ${usable} ways`} to keep your goal. You decide.
          </KateLine>
        </div>

        <div role="radiogroup" aria-label="Options" className="mt-3 space-y-2.5">
          {options.map((o, i) => (
            <OptionCard key={o.id} option={o} n={i + 1} persona={persona} pending={pending} active={o.id === selected} onSelect={() => onSelect(o.id)} />
          ))}
        </div>
      </div>
    </ScreenLayout>
  );
}

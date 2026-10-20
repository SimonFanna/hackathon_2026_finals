"use client";

import { CheckCircle, LockSimple, Sparkle } from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";
import { checkPlan, planHealth, type Chapter, type JourneyState, type Persona, type Run } from "@/engine";
import { outcomeLine, providerName } from "./copy";
import { chapterSpan } from "./demoSequence";
import { naturalList } from "./format";
import { KateLine } from "./Kate";
import { ConstraintRow, HealthBar } from "./outcome-ui";
import { PrimaryButton, ScreenLayout } from "./ui";

/**
 * Demo V2: one chapter of the plan being done. The accepted steps tick off one by one,
 * each with its provider, what was shared, and the outcome line; the goal health sits above.
 */
export function ChapterScreen({
  persona, state, run, chapter, position, count, onNext,
}: {
  persona: Persona;
  state: JourneyState;
  run: Run;
  chapter: { id: Chapter; label: string };
  /** 1-based chapter number and chapter count, for the pill. */
  position: number;
  count: number;
  onNext: () => void;
}) {
  const reduce = useReducedMotion();
  const model = persona.outcome;
  const steps = state.journey.steps.filter((s) => s.chapter === chapter.id && state.decisions[s.id] === "accepted");
  const span = chapterSpan(chapter.id, state.journey, model);
  const checks = checkPlan(run.plan, model.constraints);
  const h = planHealth(run.plan, model.constraints);
  const last = run.history[run.history.length - 1];
  const partners = [...new Set(steps.flatMap((s) => (s.provider.kind === "partner" ? [s.provider.name] : [])))];

  const kate =
    position === 1
      ? "Your plan is live. I'll watch it and tell you the moment something changes."
      : last && last.healthAfter < 80
        ? "You chose to keep a broken limit. I'll keep an eye on it while this chapter runs."
        : partners.length > 0
          ? `${naturalList(partners)} ${partners.length === 1 ? "is" : "are"} on it. Nothing else left KBC.`
          : "This chapter stays inside KBC. Nothing was shared.";

  return (
    <ScreenLayout
      top={
        <div className="flex items-center justify-between pt-2">
          <span className="rounded-full bg-white px-3 py-1.5 text-[13px] font-bold text-night shadow-card">
            Chapter <span className="tabular">{position}</span>
            <span className="text-night-300"> of {count}</span>
          </span>
          {span && <span className="tabular text-[13px] font-semibold text-night-300">Months {span.from}–{span.to}</span>}
        </div>
      }
      actions={<PrimaryButton onClick={onNext}>{position < count ? "Continue" : "See how it ends"}</PrimaryButton>}
    >
      <div className="pt-4">
        <KateLine key={kate}>{kate}</KateLine>
        <h1 className="mt-5 text-[28px] font-extrabold leading-[32px] tracking-[-0.02em]">{chapter.label}</h1>

        <div className="mt-4 rounded-[8px] bg-white p-4 shadow-card">
          <HealthBar value={h} from={last?.healthAfter} />
          <div className="mt-4 space-y-3">
            {model.constraints.map((d, i) => <ConstraintRow key={d.key} def={d} check={checks[i]} />)}
          </div>
        </div>

        <ul className="mt-5 space-y-2" aria-label={`${chapter.label}: steps`}>
          {steps.map((s, i) => {
            const shared = s.dataShared.filter((f) => state.consents[s.id]?.[f]);
            const line = outcomeLine(s);
            const change = run.changes[s.id];
            const partner = s.provider.kind === "partner";
            return (
              <motion.li
                key={s.id}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: "spring", bounce: 0, duration: 0.45, delay: 0.25 + i * 0.22 }}
                className="flex items-start gap-3 rounded-[8px] bg-white px-3.5 py-3 shadow-card"
              >
                <motion.span
                  initial={reduce ? false : { scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", bounce: 0.45, duration: 0.5, delay: 0.5 + i * 0.22 }}
                  className="mt-0.5 shrink-0"
                >
                  <CheckCircle size={22} weight="fill" className="text-green-600" />
                </motion.span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[16px] font-semibold leading-[21px]">{s.title}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[13px] leading-[18px] text-night-300">
                    <span className="font-semibold">{providerName(s)}</span>
                    {partner && (
                      <span className="flex items-center gap-1">
                        <LockSimple size={12} weight="bold" />
                        {shared.length > 0 ? `${shared.length} ${shared.length === 1 ? "detail" : "details"} shared` : "nothing shared"}
                      </span>
                    )}
                  </span>
                  {line && (
                    <span className={`tabular mt-1 block text-[13px] font-bold ${line.green ? "text-green-600" : "text-accent-600"}`}>{line.text}</span>
                  )}
                  {change && (
                    <span className="mt-1 flex w-fit items-center gap-1 rounded-[4px] bg-accent-100 px-1.5 py-0.5 text-[12px] font-bold text-accent-600">
                      <Sparkle size={12} weight="fill" /> {change.note}
                    </span>
                  )}
                </span>
              </motion.li>
            );
          })}
        </ul>
        {steps.length === 0 && <p className="mt-2 text-[15px] text-night-300">You didn&apos;t add any step here. Kate still watches your goal.</p>}
      </div>
    </ScreenLayout>
  );
}

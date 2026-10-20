"use client";

import { CheckCircle, CircleDashed, LockSimple, Sparkle, WarningCircle } from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";
import {
  checkPlan, goalReached, isComplete, nextDisruption, planHealth, stepStatus,
  type EvaluatedOption, type JourneyState, type PendingHit, type Persona, type Run, type StepStatus,
} from "@/engine";
import { brokenLine, formatValue, kindLabel, providerName, strategyLabel } from "./copy";
import { ConstraintRow, EventBadge, HealthBar } from "./outcome-ui";
import { KateLine } from "./Kate";
import { BackButton, PrimaryButton, ScreenLayout, TextButton } from "./ui";

/** S7: the plan, live. Time moves forward; Kate watches; changed steps are flagged. */
export function LiveScreen({
  persona, state, run, lastChanged, finishLine, onNext, onAdvisor, final,
}: {
  persona: Persona;
  state: JourneyState;
  run: Run;
  lastChanged: string[];
  finishLine: number;
  onNext: () => void;
  onAdvisor: () => void;
  /** Shown next to the stage finale: no actions. */
  final?: boolean;
}) {
  const model = persona.outcome;
  const next = nextDisruption(run, model);
  const done = isComplete(run, model);
  const atFinish = done && run.month >= finishLine;
  const checks = checkPlan(run.plan, model.constraints);
  const h = planHealth(run.plan, model.constraints);
  const last = run.history[run.history.length - 1];
  const accepted = state.journey.steps.filter((s) => state.decisions[s.id] === "accepted");

  const kate = atFinish
    ? goalReached(run, model)
      ? "You made it. Four surprises, and the plan held."
      : "You reached the finish line, but some limits are still broken. Let's look at them together."
    : run.history.length === 0
      ? "Your plan is live. I'll watch it and tell you the moment something changes."
      : h >= 80
        ? "Done. Your plan is back on track. I keep watching."
        : "You chose to keep a broken limit. I'll keep an eye on it.";

  const cta = atFinish ? "See the outcome" : next ? `Fast-forward to month ${next.month}` : `Fast-forward to month ${finishLine}`;

  return (
    <ScreenLayout
      top={
        <div className="flex items-center justify-between pt-2">
          <span className="rounded-full bg-white px-3 py-1.5 text-[13px] font-bold text-night shadow-card">
            <span className="tabular">Month {run.month}</span>
            <span className="text-night-300"> of {finishLine}</span>
          </span>
          <span className="text-[13px] font-semibold text-night-300">
            {model.disruptions.length - run.next > 0 ? `${run.history.length} of ${model.disruptions.length} surprises handled` : "All surprises handled"}
          </span>
        </div>
      }
      actions={
        final ? undefined : <>
          <PrimaryButton onClick={onNext}>{cta}</PrimaryButton>
          {!atFinish && <TextButton onClick={onAdvisor}>Talk it through with a KBC advisor</TextButton>}
        </>
      }
    >
      <div className="pt-4">
        <KateLine key={kate}>{kate}</KateLine>
        <h1 className="mt-5 text-[24px] font-extrabold leading-[28px] tracking-[-0.02em]">{model.goal}</h1>

        <div className="mt-4 rounded-[8px] bg-white p-4 shadow-card">
          <HealthBar value={h} from={last?.healthHit} />
          <div className="mt-4 space-y-3">
            {model.constraints.map((d, i) => <ConstraintRow key={d.key} def={d} check={checks[i]} />)}
          </div>
        </div>

        <h2 className="mt-5 text-[15px] font-bold text-night-300">Your plan</h2>
        <ul className="mt-2 space-y-1.5">
          {accepted.map((s) => {
            const status = stepStatus(run, model, s.id);
            const change = run.changes[s.id];
            const fresh = lastChanged.includes(s.id);
            return (
              <motion.li
                key={s.id}
                layout
                initial={false}
                animate={fresh ? { backgroundColor: ["#e5f4ff", "#ffffff"] } : undefined}
                transition={{ duration: 1.6 }}
                className={`flex items-start gap-3 rounded-[8px] bg-white px-3.5 py-2.5 shadow-card ${fresh ? "ring-2 ring-accent" : ""}`}
              >
                <StatusIcon status={status} />
                <span className="min-w-0 flex-1">
                  <span className={`block text-[15px] font-semibold leading-[20px] ${status === "done" ? "text-night-300" : ""}`}>{s.title}</span>
                  <span className="text-[12px] text-night-300">{providerName(s)}</span>
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
        {accepted.length === 0 && <p className="mt-2 text-[15px] text-night-300">You didn&apos;t add any step. Kate still watches your goal.</p>}
      </div>
    </ScreenLayout>
  );
}

function StatusIcon({ status }: { status: StepStatus }) {
  if (status === "done") return <CheckCircle size={20} weight="fill" className="mt-0.5 shrink-0 text-green-600" />;
  if (status === "active")
    return (
      <span className="relative mt-[3px] grid size-[18px] shrink-0 place-items-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-accent/40 motion-reduce:animate-none" />
        <span className="size-2.5 rounded-full bg-accent" />
      </span>
    );
  return <CircleDashed size={20} className="mt-0.5 shrink-0 text-night-100" />;
}

/** S8: something unexpected happened. What broke, in one screen. */
export function EventScreen({
  persona, pending, index, onOptions,
}: { persona: Persona; pending: PendingHit; index: number; onOptions: () => void }) {
  const reduce = useReducedMotion();
  const d = pending.disruption;
  const model = persona.outcome;
  const affected = persona.journey.steps.filter((s) => d.affects.includes(s.id));
  const usable = pending.options.filter((o) => o.available && o.strategy !== "keep").length;
  return (
    <ScreenLayout actions={<PrimaryButton onClick={onOptions}>See my options</PrimaryButton>}>
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

        <div className="mt-5 flex items-start gap-3.5">
          <EventBadge kind={d.kind} size={48} />
          <h1 className="text-[26px] font-extrabold leading-[30px] tracking-[-0.02em]">{d.title}</h1>
        </div>
        <p className="mt-3 text-[16px] leading-[23px]">{d.detail}</p>
        <p className="mt-1.5 text-[13px] text-night-300">Source: {d.source}</p>

        <div className="mt-5 rounded-[8px] border border-danger/25 bg-white p-4 shadow-card">
          <HealthBar value={pending.healthHit} from={pending.healthBefore} />
          <h2 className="mt-4 text-[13px] font-bold text-night-300">What this breaks</h2>
          <ul className="mt-1.5 space-y-1">
            {pending.broken.map((c) => {
              const def = model.constraints.find((x) => x.key === c.key)!;
              return (
                <li key={c.key} className="tabular text-[15px] font-semibold leading-[21px] text-danger">{brokenLine(def, c)}</li>
              );
            })}
          </ul>
          {affected.length > 0 && (
            <p className="mt-3 text-[13px] leading-[18px] text-night-300">
              Steps involved: {affected.map((s) => s.title).join(" · ")}
            </p>
          )}
        </div>

        <div className="mt-5">
          <KateLine delay={0.3}>I&apos;ve already recalculated your plan. There {usable === 1 ? "is 1 way" : `are ${usable} ways`} to keep your goal. You decide.</KateLine>
        </div>
      </div>
    </ScreenLayout>
  );
}

/** S9: every option, scored by the engine. Kate recommends one; the customer chooses. */
export function OptionsScreen({
  persona, pending, selected, onSelect, onChoose, onBack,
}: {
  persona: Persona;
  pending: PendingHit;
  selected: string | null;
  onSelect: (id: string) => void;
  onChoose: () => void;
  onBack: () => void;
}) {
  const options = rankOptions(pending.options);
  const chosen = pending.options.find((o) => o.id === selected);
  const label = !chosen ? "Choose an option" : chosen.recommended ? "Go with Kate's pick" : chosen.feasible ? "Choose this option" : "Choose it anyway";

  return (
    <ScreenLayout
      top={<BackButton onClick={onBack} />}
      actions={<PrimaryButton onClick={onChoose}>{label}</PrimaryButton>}
    >
      <div className="pt-1">
        <h1 className="text-[26px] font-extrabold leading-[30px] tracking-[-0.02em]">How to keep your goal</h1>
        <p className="mt-1.5 text-[15px] leading-[21px] text-night-300">
          Every option is checked against your limits. Kate recommends one. You decide.
        </p>
        <div role="radiogroup" aria-label="Options" className="mt-4 space-y-2.5">
          {options.map((o, i) => (
            <OptionCard key={o.id} option={o} n={i + 1} persona={persona} pending={pending} active={o.id === selected} onSelect={() => onSelect(o.id)} />
          ))}
        </div>
      </div>
    </ScreenLayout>
  );
}

function OptionCard({
  option: o, n, persona, pending, active, onSelect,
}: { option: EvaluatedOption; n: number; persona: Persona; pending: PendingHit; active: boolean; onSelect: () => void }) {
  const model = persona.outcome;
  const missing = o.requiresStep ? persona.journey.steps.find((s) => s.id === o.requiresStep) : null;
  // Show the constraints this option moves, plus any it leaves broken.
  const moved = o.checks.filter((c) => {
    const before = pending.hit.values[c.key];
    return c.value !== before || c.limit !== pending.hit.limits[c.key] || !c.ok;
  });
  const provider = o.provider ? (o.provider.kind === "kbc" ? "KBC" : o.provider.name) : null;

  return (
    <button
      role="radio"
      aria-checked={active}
      disabled={!o.available}
      onClick={onSelect}
      className={`press relative block w-full rounded-[8px] bg-white p-3.5 text-left shadow-card transition-shadow ${
        active ? "ring-2 ring-accent" : "ring-1 ring-transparent hover:ring-night-100"
      } ${!o.available ? "opacity-55" : ""}`}
    >
      <span className="flex items-center gap-2 text-[12px] font-bold">
        <span className="tabular grid size-5 place-items-center rounded-full bg-surface text-night-300">{n}</span>
        <span className="rounded-[4px] bg-element px-1.5 py-0.5 text-night-300">{strategyLabel[o.strategy]}</span>
        {provider && <span className="text-night-300">{provider}</span>}
        {o.recommended && (
          <span className="ml-auto flex items-center gap-1 rounded-full bg-kate/20 px-2 py-0.5 text-night">
            <Sparkle size={12} weight="fill" className="text-accent-600" /> Kate recommends
          </span>
        )}
      </span>
      <span className="mt-2 block text-[17px] font-bold leading-[22px]">{o.label}</span>
      <span className="mt-1 block text-[14px] leading-[19px] text-night-300">{o.tradeoff}</span>

      {!o.available && missing ? (
        <span className="mt-2 flex items-center gap-1.5 text-[13px] font-semibold text-night-300">
          <LockSimple size={14} weight="bold" /> Not available: you skipped “{missing.title}”
        </span>
      ) : (
        <span className="mt-2 flex flex-wrap gap-1.5">
          {moved.map((c) => {
            const def = model.constraints.find((x) => x.key === c.key)!;
            return (
              <span
                key={c.key}
                className={`tabular rounded-[4px] px-1.5 py-0.5 text-[12px] font-bold ${c.ok ? "bg-green/12 text-green-600" : "bg-danger/10 text-danger"}`}
              >
                {c.ok ? "✓" : "✕"} {def.label} {formatValue(def, c.value)}
              </span>
            );
          })}
          <span className="tabular rounded-[4px] bg-surface px-1.5 py-0.5 text-[12px] font-bold text-night-300">
            Health {o.health}%{o.extraCostEur ? ` · €${(o.extraCostEur / 1000).toLocaleString("en-GB", { maximumFractionDigits: 1 })}k hidden cost` : ""}
          </span>
        </span>
      )}
    </button>
  );
}

/** Display order: Kate's pick, other options that keep the goal, broken ones, unavailable ones, then "keep the plan". */
export function rankOptions(options: EvaluatedOption[]): EvaluatedOption[] {
  const rank = (o: EvaluatedOption) => (o.recommended ? 0 : o.strategy === "keep" ? 4 : !o.available ? 3 : o.feasible ? 1 : 2);
  return [...options].sort((a, b) => rank(a) - rank(b) || b.score - a.score);
}

"use client";

import { Check, Question } from "@phosphor-icons/react";
import { motion } from "motion/react";
import { checkPlan, planHealth, type PendingHit, type Persona, type Run } from "@/engine";
import { EventBadge, ConstraintRow, HealthBar } from "./outcome-ui";

export type Phase = "detect" | "plan" | "execute" | "adapt" | "outcome";
/** Inside "adapt": what the engine is doing right now. */
export type AdaptStep = "detect" | "recalculate" | "replan" | "decide";

const PHASES: { id: Phase; label: string }[] = [
  { id: "detect", label: "Detect" },
  { id: "plan", label: "Plan" },
  { id: "execute", label: "Execute" },
  { id: "adapt", label: "Adapt" },
  { id: "outcome", label: "Outcome" },
];

const ADAPT: { id: AdaptStep; label: string }[] = [
  { id: "detect", label: "Impact detected" },
  { id: "recalculate", label: "Constraints recalculated" },
  { id: "replan", label: "Options scored" },
  { id: "decide", label: "Customer decides" },
];

/**
 * The engine's view, next to the phone: pipeline, goal health, constraints and the four surprises.
 * It reads the same engine state as the phone; nothing here is staged.
 */
export function EngineHud({
  persona, run, pending, phase, adaptStep,
}: { persona: Persona; run: Run | null; pending: PendingHit | null; phase: Phase; adaptStep: AdaptStep | null }) {
  const model = persona.outcome;
  const plan = pending ? pending.hit : run?.plan ?? model.baseline;
  const checks = checkPlan(plan, model.constraints);
  const h = pending ? pending.healthHit : planHealth(plan, model.constraints);
  const from = pending ? pending.healthBefore : run?.history[run.history.length - 1]?.healthHit;
  const phaseIndex = PHASES.findIndex((p) => p.id === phase);

  return (
    <motion.aside
      aria-label="Outcome engine"
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 12, transition: { duration: 0.15 } }}
      transition={{ type: "spring", bounce: 0, duration: 0.4 }}
      className="w-[340px] shrink-0 text-white"
    >
      <p className="flex items-center gap-2 text-[13px] font-bold text-white/60">
        <span className="size-2 rounded-full bg-green shadow-[0_0_8px_var(--color-green)]" />
        KBC Outcome Engine · live
      </p>
      <h2 className="mt-1 text-[22px] font-extrabold leading-[27px] tracking-[-0.01em]">{model.goal}</h2>

      {/* Pipeline */}
      <ol className="mt-4 flex gap-1" aria-label="Pipeline">
        {PHASES.map((p, i) => {
          const state = i < phaseIndex ? "done" : i === phaseIndex ? "now" : "next";
          return (
            <li key={p.id} className="flex-1">
              <span
                className={`block h-1.5 rounded-full transition-colors duration-300 ${
                  state === "now" ? (p.id === "adapt" ? "bg-danger" : "bg-accent") : state === "done" ? "bg-white/50" : "bg-white/12"
                }`}
              />
              <span className={`mt-1.5 block text-[12px] font-bold ${state === "now" ? "text-white" : "text-white/45"}`}>{p.label}</span>
            </li>
          );
        })}
      </ol>

      {phase === "adapt" && adaptStep && (
        <ol className="mt-3 space-y-1 rounded-[8px] bg-white/6 p-3 text-[13px]">
          {ADAPT.map((a, i) => {
            const idx = ADAPT.findIndex((x) => x.id === adaptStep);
            const st = i < idx ? "done" : i === idx ? "now" : "next";
            return (
              <li key={a.id} className={`flex items-center gap-2 ${st === "next" ? "text-white/40" : "text-white"}`}>
                <span className={`grid size-4 place-items-center rounded-full ${st === "done" ? "bg-green" : st === "now" ? "bg-danger hud-pulse" : "bg-white/15"}`}>
                  {st === "done" && <Check size={10} weight="bold" />}
                </span>
                {a.label}
              </li>
            );
          })}
        </ol>
      )}

      {/* Goal health + constraints */}
      <div className="mt-5 rounded-[8px] bg-white/6 p-4">
        <HealthBar key={`${pending?.disruption.id ?? "run"}-${run?.history.length ?? 0}`} value={h} from={from} dark size="lg" />
        <div className="mt-4 space-y-3">
          {model.constraints.map((d, i) => <ConstraintRow key={d.key} def={d} check={checks[i]} dark />)}
        </div>
      </div>

      {/* The four surprises */}
      <h3 className="mt-5 text-[13px] font-bold text-white/60">Unexpected events</h3>
      <ol className="mt-2 space-y-2">
        {model.disruptions.map((d, i) => {
          const res = run?.history[i];
          const live = pending?.disruption.id === d.id;
          const opt = res ? d.options.find((o) => o.id === res.optionId) : null;
          const tone = res ? "done" : live ? "danger" : "idle";
          return (
            <li
              key={d.id}
              className={`flex items-center gap-3 rounded-[8px] px-3 py-2 transition-colors duration-300 ${live ? "hud-pulse bg-danger/15 ring-1 ring-danger/60" : "bg-white/4"}`}
            >
              {res || live ? (
                <EventBadge kind={d.kind} size={30} tone={tone} />
              ) : (
                <span className="grid size-[30px] shrink-0 place-items-center rounded-full border border-dashed border-white/25 text-white/40">
                  <Question size={14} weight="bold" />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className={`block truncate text-[14px] font-bold ${res || live ? "text-white" : "text-white/40"}`}>
                  {res || live ? d.title : `Month ${d.month} · ???`}
                </span>
                {opt && (
                  <span className="block truncate text-[12px] text-white/60">
                    {res!.optionId === res!.recommendedId ? "Kate's pick: " : "Customer's call: "}
                    {opt.label}
                  </span>
                )}
                {live && <span className="block text-[12px] text-[#ff6b81]">Re-planning…</span>}
              </span>
            </li>
          );
        })}
      </ol>

      <p className="mt-4 text-[12px] leading-[17px] text-white/45">
        Score = goal health − 1 pt per €1k hidden cost. No language model decides.
      </p>
    </motion.aside>
  );
}

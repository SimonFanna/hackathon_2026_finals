import type {
  ConstraintCheck, ConstraintDef, Delta, Disruption, EvaluatedOption, OutcomeModel, OutcomePlan,
  PendingHit, Run, StepStatus,
} from "./types";

// Adaptive Outcome Engine: deterministic, no language model.
// detect (a disruption hits the plan) → recalculate (which constraints break) →
// re-plan (score every option) → the customer decides → track.
// Nothing here knows about houses or businesses: goals differ only by their OutcomeModel data.

/** Within this share of a limit, the plan is "close to the edge" and loses a little health. */
const EDGE = 0.98;

export function applyDelta(plan: OutcomePlan, delta: Delta): OutcomePlan {
  const values = { ...plan.values };
  const limits = { ...plan.limits };
  for (const [k, v] of Object.entries(delta.values ?? {})) values[k as keyof typeof values] += v ?? 0;
  for (const [k, v] of Object.entries(delta.limits ?? {})) limits[k as keyof typeof limits] += v ?? 0;
  return { values, limits };
}

export function checkPlan(plan: OutcomePlan, defs: ConstraintDef[]): ConstraintCheck[] {
  return defs.map(({ key, kind }) => {
    const value = plan.values[key];
    const limit = plan.limits[key];
    const usage = kind === "max" ? value / limit : value <= 0 ? 2 : limit / value;
    return { key, value, limit, ok: kind === "max" ? value <= limit : value >= limit, usage };
  });
}

/** A plan with a broken constraint is never "on track" (80+), whatever the penalty. */
const BROKEN_CAP = 79;

/** Goal health, 0–100: every broken constraint costs a lot, being close to an edge costs a little. */
export function health(checks: ConstraintCheck[]): number {
  let penalty = 0;
  for (const c of checks) {
    if (!c.ok) penalty += Math.min(40, 15 + 100 * Math.abs(c.usage - 1));
    else if (c.usage > EDGE) penalty += (c.usage - EDGE) * 100;
  }
  const h = Math.max(5, Math.round(100 - penalty));
  return checks.some((c) => !c.ok) ? Math.min(h, BROKEN_CAP) : h;
}

export function planHealth(plan: OutcomePlan, defs: ConstraintDef[]): number {
  return health(checkPlan(plan, defs));
}

export function startRun(model: OutcomeModel): Run {
  return { plan: model.baseline, month: 0, next: 0, history: [], changes: {} };
}

export function nextDisruption(run: Run, model: OutcomeModel): Disruption | null {
  return model.disruptions[run.next] ?? null;
}

/**
 * A disruption hits the current plan. Returns what broke and every option, scored.
 * `accepted` = the steps the customer added to the plan (some options depend on them).
 */
export function hit(run: Run, model: OutcomeModel, accepted: ReadonlySet<string>): PendingHit | null {
  const disruption = nextDisruption(run, model);
  if (!disruption) return null;
  const healthBefore = planHealth(run.plan, model.constraints);
  const hitPlan = applyDelta(run.plan, disruption.delta);
  const checks = checkPlan(hitPlan, model.constraints);
  return {
    disruption,
    hit: hitPlan,
    broken: checks.filter((c) => !c.ok),
    healthBefore,
    healthHit: health(checks),
    options: evaluateOptions(hitPlan, disruption, model, accepted),
  };
}

/**
 * Scores every option on the plan after the disruption:
 * score = goal health − 1 point per €1,000 of hidden long-term cost.
 * The recommendation is the best available option that keeps every constraint; if none does, the best available one.
 */
export function evaluateOptions(
  hitPlan: OutcomePlan, disruption: Disruption, model: OutcomeModel, accepted: ReadonlySet<string>,
): EvaluatedOption[] {
  const evaluated = disruption.options.map((o) => {
    const result = applyDelta(hitPlan, o.delta);
    const checks = checkPlan(result, model.constraints);
    const h = health(checks);
    const available = !o.requiresStep || accepted.has(o.requiresStep);
    return {
      ...o,
      result,
      checks,
      available,
      feasible: checks.every((c) => c.ok),
      health: h,
      score: available ? h - (o.extraCostEur ?? 0) / 1000 : -Infinity,
      recommended: false,
    };
  });
  const pool = evaluated.filter((o) => o.available && o.feasible);
  const candidates = pool.length > 0 ? pool : evaluated.filter((o) => o.available);
  const best = candidates.reduce<EvaluatedOption | null>((a, b) => (!a || b.score > a.score ? b : a), null);
  return evaluated.map((o) => ({ ...o, recommended: o.id === best?.id }));
}

/** The customer picks an option (recommended or not): the plan moves on with it. */
export function resolve(run: Run, model: OutcomeModel, pending: PendingHit, optionId: string): Run {
  const option = pending.options.find((o) => o.id === optionId);
  if (!option) throw new Error(`Unknown option: ${optionId}`);
  if (!option.available) throw new Error(`Option not available: ${optionId}`);
  const changes = { ...run.changes };
  for (const c of option.changes ?? []) changes[c.stepId] = c;
  return {
    plan: option.result,
    month: pending.disruption.month,
    next: run.next + 1,
    changes,
    history: [
      ...run.history,
      {
        disruptionId: pending.disruption.id,
        optionId,
        recommendedId: pending.options.find((o) => o.recommended)?.id ?? optionId,
        healthBefore: pending.healthBefore,
        healthHit: pending.healthHit,
        healthAfter: option.health,
      },
    ],
  };
}

/** Moves time forward without a disruption (e.g. to the finish line). */
export function advance(run: Run, month: number): Run {
  return { ...run, month: Math.max(run.month, month) };
}

export function isComplete(run: Run, model: OutcomeModel): boolean {
  return run.next >= model.disruptions.length;
}

export function goalReached(run: Run, model: OutcomeModel): boolean {
  return isComplete(run, model) && checkPlan(run.plan, model.constraints).every((c) => c.ok);
}

/** Where a step stands at the current month, after any re-planning shifts. */
export function stepStatus(run: Run, model: OutcomeModel, stepId: string): StepStatus {
  const s = model.schedule[stepId];
  if (!s) return "upcoming";
  const start = s.start + (run.changes[stepId]?.shiftMonths ?? 0);
  if (run.month >= start + s.months) return "done";
  if (run.month >= start) return "active";
  return "upcoming";
}

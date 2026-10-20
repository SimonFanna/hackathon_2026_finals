// T6 — ⑪ Disruption detection and impact analysis. Pure: no I/O, no clock, inputs never mutated.
import type {
  ConstraintCheck, Disruption, DisruptionCode, Event, Goal, Impact, PersistentContext, Plan, RuleSet, Signal,
} from "../types";
import { DISRUPTION_CODES } from "../vocabulary";
import { annuity, DEFAULT_RATE_PCT } from "./finance";
import { checkConstraints } from "./orchestrator";
import {
  addDays, clone, daysBetween, disruptedStep, isActive, isFinished, withDependents, type DisruptionDelta,
} from "./replan-util";

/** Context-diff thresholds: KBC sees these without any partner event. */
export const INCOME_DROP_MIN_PCT = 0.1;          // ≥ 10% lower monthly income
export const SAVINGS_DROP_MIN_PCT = 0.2;         // ≥ 20% of savings…
export const SAVINGS_DROP_MIN_EUR = 5000;        // …and at least €5,000

const DETAIL_NUM = (e: Event | undefined, key: string): number | undefined =>
  typeof e?.detail[key] === "number" ? (e.detail[key] as number) : undefined;

/**
 * Turn disruption signals (T1) and a context diff into disruptions, one per code.
 * `events` (optional) lets us read partner details (capability, sourceRow, amounts) behind the signal evidence.
 */
export function detectDisruptions(
  signals: Signal[], before: PersistentContext, after: PersistentContext, rules: RuleSet, asOf: string, events: Event[] = [],
): Disruption[] {
  const byId = new Map(events.map((e) => [e.id, e]));
  const found = new Map<DisruptionCode, Disruption>();
  const add = (code: DisruptionCode, at: string, evidence: string[], delta: DisruptionDelta) => {
    const prev = found.get(code);
    if (!prev) {
      found.set(code, { code, customerId: after.customerId, at, evidence: [...evidence], delta });
      return;
    }
    prev.evidence = [...new Set([...prev.evidence, ...evidence])];
    prev.at = prev.at > at ? prev.at : at;
    prev.delta = { ...delta, ...prev.delta };
  };
  const known = new Set(rules.disruptionTypes.map((t) => t.code));

  // 1. Signals tagged as disruptions.
  for (const type of rules.disruptionTypes) {
    for (const s of signals.filter((x) => type.signals.includes(x.code))) {
      const ev = s.evidence.map((id) => byId.get(id)).find((e) => e?.detail);
      const capability = ev?.detail.capability as DisruptionDelta["capability"] | undefined;
      const sourceRow = ev?.sourceRow ?? DETAIL_NUM(ev, "sourceRow");
      const delta: DisruptionDelta = {};
      if (capability) delta.capability = capability;
      if (sourceRow !== undefined) delta.sourceRow = sourceRow;
      if (type.code === "COST_OVERRUN") delta.costOverrunEur = DETAIL_NUM(ev, "overrunEur") ?? s.value;
      if (type.code === "PARTNER_DELAY") delta.delayDays = DETAIL_NUM(ev, "delayDays") ?? s.value;
      if (type.code === "RATE_CHANGE") delta.rateDeltaPct = DETAIL_NUM(ev, "rateDeltaPct") ?? s.value;
      add(type.code, s.at, s.evidence, delta);
    }
  }

  // 2. Context diff (the persistent context is recomputed by T1 from facts).
  if (known.has("INCOME_DROP") && after.monthlyIncome < before.monthlyIncome * (1 - INCOME_DROP_MIN_PCT)) {
    add("INCOME_DROP", asOf, [], {
      monthlyIncome: after.monthlyIncome, employment: after.employment, debtRatio: after.debtRatio, cashflowPressure: after.cashflowPressure,
    });
  }
  const savingsDrop = before.savings - after.savings;
  if (known.has("UNEXPECTED_EXPENSE") && savingsDrop >= Math.max(SAVINGS_DROP_MIN_EUR, before.savings * SAVINGS_DROP_MIN_PCT)) {
    add("UNEXPECTED_EXPENSE", asOf, [], { savings: after.savings });
  }

  return DISRUPTION_CODES.filter((c) => found.has(c)).map((c) => found.get(c)!);
}

/** Purchase price implied by the plan (T5 money model), so a cost overrun cannot be absorbed by the house price. */
export function purchasePriceOf(goal: Goal, plan: Plan): number | undefined {
  return goal.constraints.targetProperty?.price ?? plan.summary?.purchasePrice;
}

/**
 * Apply a disruption to copies of the goal and plan, without re-planning:
 * cost overrun on the quote, ETA shift on the late step and its dependents, re-priced loans on a rate change.
 */
export function applyDisruption(d: Disruption, goal: Goal, plan: Plan): { goal: Goal; plan: Plan } {
  const g = clone(goal);
  const p = clone(plan);
  const delta = d.delta as DisruptionDelta;
  const step = disruptedStep(p, delta);

  if (d.code === "COST_OVERRUN" && step && delta.costOverrunEur) {
    const price = purchasePriceOf(goal, plan);
    if (price !== undefined) g.constraints.targetProperty = { ...g.constraints.targetProperty, price };
    step.provider.costEur = (step.provider.costEur ?? 0) + delta.costOverrunEur;
  }
  if (d.code === "PARTNER_DELAY" && step && delta.delayDays) {
    const hit = withDependents(p, step.id);
    for (const s of p.steps) if (hit.has(s.id) && s.eta && !isFinished(s)) s.eta = addDays(s.eta, delta.delayDays);
  }
  if (d.code === "RATE_CHANGE" && delta.rateDeltaPct) {
    const rate = g.constraints.ratePct ?? DEFAULT_RATE_PCT;
    const term = g.constraints.termYears ?? 25;
    const factor = annuity(1, rate + delta.rateDeltaPct, term) / annuity(1, rate, term);
    g.constraints.ratePct = rate + delta.rateDeltaPct;
    for (const s of p.steps) if (s.estimates.monthlyPayment) s.estimates.monthlyPayment = Math.round(s.estimates.monthlyPayment * factor);
  }
  return { goal: g, plan: p };
}

/** How far over the limit a broken check is: relative for amounts, in days for dates. */
export function overshoot(c: ConstraintCheck): { ratio: number; days: number } {
  if (c.constraint === "ownFunds" && typeof c.actual === "number" && typeof c.limit === "number") {
    // reversed: actual = savings, limit = own funds needed; short when savings < limit
    return { ratio: c.limit > 0 ? Math.max(0, (c.limit - c.actual) / c.limit) : 0, days: 0 };
  }
  if (typeof c.actual === "number" && typeof c.limit === "number") {
    return { ratio: c.limit > 0 ? (c.actual - c.limit) / c.limit : c.actual > 0 ? 1 : 0, days: 0 };
  }
  return { ratio: 0, days: Math.max(0, daysBetween(String(c.limit), String(c.actual))) };
}

export function severityOf(broken: ConstraintCheck[]): Impact["severity"] {
  let level = 0;
  for (const c of broken) {
    const { ratio, days } = overshoot(c);
    const l = ratio >= 0.2 || days >= 60 ? 2 : ratio >= 0.05 || days >= 14 ? 1 : 0;
    level = Math.max(level, l);
  }
  return (["low", "medium", "high"] as const)[level];
}

/** Which constraints break, which steps are involved, how badly. */
export function assessImpact(d: Disruption, goal: Goal, plan: Plan, ctxAfter: PersistentContext): Impact {
  const { goal: g, plan: p } = applyDisruption(d, goal, plan);
  const broken = checkConstraints(p, g, ctxAfter).filter((c) => !c.ok);
  const open = p.steps.filter((s) => isActive(s) && !isFinished(s));
  const affected = new Set<string>();
  const step = disruptedStep(p, d.delta as DisruptionDelta);
  if (step && (d.code === "COST_OVERRUN" || d.code === "PARTNER_DELAY")) withDependents(p, step.id).forEach((id) => affected.add(id));
  for (const c of broken) {
    for (const s of open) {
      if ((c.constraint === "maxMonthlyPayment" || c.constraint === "ownFunds") && s.estimates.monthlyPayment) affected.add(s.id);
      if (c.constraint === "budget" && (s.provider.costEur || s.estimates.monthlyPayment)) affected.add(s.id);
      if (c.constraint === "deadline" && s.eta && s.eta > String(c.limit)) affected.add(s.id);
    }
  }
  return {
    goalId: goal.id,
    disruption: d.code,
    broken,
    affectedStepIds: p.steps.filter((s) => affected.has(s.id)).map((s) => s.id),
    severity: severityOf(broken),
  };
}

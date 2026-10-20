// T6 — What-if simulation: same machinery as replanning, run on copies. Nothing is committed. Pure.
import type { CapabilityCode, Disruption, DisruptionCode, Goal, PersistentContext, Plan, RuleSet, Scenario } from "../types";
import { assessImpact } from "./disruption";
import { DEFAULT_RATE_PCT } from "./finance";
import { buildPlan } from "./orchestrator";
import { applyDecisionRules } from "./rules";
import { replan } from "./replan";
import { clone, eur, lastEta, monthlyPayment, patchOf, round2 } from "./replan-util";

export type WhatIf = {
  budget?: number; incomeDeltaPct?: number; termYears?: number; rateDeltaPct?: number; deadline?: string; dropCapabilities?: CapabilityCode[];
};

/** How many repair options to add when the what-if breaks the plan. */
export const WHATIF_FIXES = 2;

/**
 * Run a what-if on copies of the goal, plan and context.
 * Returns the scenario "as asked" first; if it breaks a constraint, up to 2 repaired scenarios follow.
 */
export function simulate(goal: Goal, plan: Plan, ctx: PersistentContext, change: WhatIf, rules: RuleSet, asOf: string): Scenario[] {
  if (change.budget !== undefined && !(Number.isFinite(change.budget) && change.budget >= 0 && change.budget <= 10_000_000))
    throw new RangeError("budget must be between 0 and €10M");   // REVIEW P0 #1: never search an unbounded budget
  const g = clone(goal);
  const c = g.constraints;
  const x = clone(ctx);

  if (change.budget !== undefined && c.budget !== undefined) {
    const delta = change.budget - c.budget;
    if (c.targetProperty?.price !== undefined) c.targetProperty.price = Math.max(0, c.targetProperty.price + delta);
  }
  if (change.budget !== undefined) c.budget = change.budget;
  if (change.termYears !== undefined) c.termYears = change.termYears;
  if (change.deadline !== undefined) c.deadline = change.deadline;
  if (change.rateDeltaPct) c.ratePct = round2((c.ratePct ?? DEFAULT_RATE_PCT) + change.rateDeltaPct);
  if (change.incomeDeltaPct) {
    x.monthlyIncome = Math.round(x.monthlyIncome * (1 + change.incomeDeltaPct / 100));
    x.debtRatio = x.monthlyIncome > 0 ? round2(x.monthlyDebt / x.monthlyIncome) : 0;
  }

  const forceProviders: Partial<Record<CapabilityCode, number>> = {};
  for (const s of plan.steps) forceProviders[s.capability] = s.provider.sourceRow;
  const asked = applyDecisionRules(buildPlan(g, x, rules, asOf, {
    forceProviders, dropCapabilities: change.dropCapabilities, version: plan.version, reason: "scenario",
  }), x, [], rules);
  const pay = monthlyPayment(asked);
  const ok = asked.checks.every((k) => k.ok);
  const asIs: Scenario = {
    id: `${plan.id}:whatif`,
    goalId: goal.id,
    label: `What if ${describe(change)}`,
    strategies: [],
    plan: asked,
    goalPatch: patchOf(goal, g),
    score: ok ? 1 : 0,
    probabilityOfSuccess: ok ? 1 : 0,
    tradeoffs: asked.checks.map((k) => k.message),
    monthlyPayment: pay > 0 ? pay : null,
    deadline: g.constraints.deadline ?? lastEta(asked),
  };
  if (ok) return [asIs];

  // Repair it like a disruption on the what-if state.
  const code = disruptionFor(asked, change);
  const d: Disruption = { code, customerId: ctx.customerId, at: asOf, evidence: [], delta: {} };
  const impact = assessImpact(d, g, asked, x);
  const fixes = replan(g, asked, x, impact, rules, asOf, d)
    .filter((s) => !s.plan.atRisk && s.goalStatus !== "paused")
    .slice(0, WHATIF_FIXES)
    .map((s) => ({ ...s, id: `${s.id}:whatif`, goalPatch: { ...patchOf(goal, g), ...s.goalPatch }, plan: { ...s.plan, reason: "scenario" as const } }));
  return [asIs, ...fixes];
}

function disruptionFor(plan: Plan, change: WhatIf): DisruptionCode {
  const broken = plan.checks.filter((k) => !k.ok).map((k) => k.constraint);
  if (broken.every((b) => b === "deadline")) return "PARTNER_DELAY";
  if (broken.includes("ownFunds")) return "UNEXPECTED_EXPENSE";
  if (change.rateDeltaPct && !change.incomeDeltaPct && change.budget === undefined) return "RATE_CHANGE";
  return "INCOME_DROP"; // affordability family: smaller scope or longer term
}

function describe(w: WhatIf): string {
  const parts: string[] = [];
  if (w.budget !== undefined) parts.push(`the budget is ${eur(w.budget)}`);
  if (w.incomeDeltaPct) parts.push(`your income ${w.incomeDeltaPct < 0 ? "drops" : "rises"} ${Math.abs(w.incomeDeltaPct)}%`);
  if (w.termYears !== undefined) parts.push(`the loan runs ${w.termYears} years`);
  if (w.rateDeltaPct) parts.push(`the rate ${w.rateDeltaPct > 0 ? "rises" : "falls"} ${Math.abs(w.rateDeltaPct)} points`);
  if (w.deadline) parts.push(`you need it done by ${w.deadline}`);
  if (w.dropCapabilities?.length) parts.push(`you skip ${w.dropCapabilities.map((c) => c.replace(/_/g, " ")).join(", ")}`);
  return parts.join(" and ") || "nothing changes";
}

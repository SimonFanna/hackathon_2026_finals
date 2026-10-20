// T6 — ⑪ Replanning: strategies → candidate plans (via T5 buildPlan) → score → 2 distinct scenarios. Pure.
import type {
  CapabilityCode, ConstraintCheck, Disruption, Goal, Impact, PersistentContext, Plan, PlanStep, ReplanStrategy,
  ReplanStrategyCode, RuleSet, Scenario,
} from "../types";
import { overshoot, purchasePriceOf } from "./disruption";
import { affordability, DEFAULT_RATE_PCT } from "./finance";
import { buildPlan, checkConstraints, type BuildPlanOptions } from "./orchestrator";
import { applyDecisionRules } from "./rules";
import {
  addDays, clamp, clone, daysBetween, disruptedStep, ENERGY_CAPABILITIES, eur, isActive, isFinished, lastEta, monthlyPayment,
  patchOf, round2, withDependents, type DisruptionDelta,
} from "./replan-util";

type BuildOpts = BuildPlanOptions;

/** score = 0.4·P(success) + 0.25·(1 − cost penalty) + 0.2·(1 − delay penalty) + 0.15·priority fit */
export const SCORE_WEIGHTS = { success: 0.4, cost: 0.25, delay: 0.2, fit: 0.15 } as const;
/** Extra cost equal to this share of the budget = full cost penalty. */
export const COST_PENALTY_SCALE = 0.2;
/** A delay of this many days = full delay penalty. */
export const DELAY_PENALTY_DAYS = 180;
/** Unknown outcome of a paused goal. */
export const PAUSE_SUCCESS = 0.35;
/** A payment at or below this share of the max gets full safety credit. */
export const SAFE_PAYMENT_SHARE = 0.85;

interface Candidate {
  strategies: ReplanStrategyCode[];
  goal: Goal;
  plan: Plan;
  notes: string[];          // trade-offs specific to how the candidate was built
  paused?: boolean;
}

interface Base {
  goal: Goal;               // goal after the disruption (pinned price, new rate, own funds within savings)
  opts: BuildOpts;          // disruption effects + current providers kept
  delayed?: PlanStep;       // step hit by a partner delay / overrun, from the original plan
}

const STRATEGY_ORDER: ReplanStrategyCode[] = ["REDUCE_SCOPE", "EXTEND_TERM", "SWAP_PROVIDER", "REORDER", "ADD_PROTECTION", "MAXIMISE_GRANTS", "PAUSE"];

const constraintsOf = (g: Goal) => g.constraints;
const num = (v: unknown, d: number) => (typeof v === "number" ? v : d);
const strs = (v: unknown) => (Array.isArray(v) ? (v as string[]) : []);

/** Generate, score and rank replanning scenarios. The 2 best (with different strategies) come first. */
export function replan(
  goal: Goal, plan: Plan, ctx: PersistentContext, impact: Impact, rules: RuleSet, asOf: string, disruption?: Disruption,
): Scenario[] {
  const base = baseOf(goal, plan, ctx, disruption);
  const strategies = rules.replanStrategies
    .filter((s) => s.appliesTo.includes(impact.disruption))
    .sort((a, b) => STRATEGY_ORDER.indexOf(a.code) - STRATEGY_ORDER.indexOf(b.code));
  const byCode = new Map(strategies.map((s) => [s.code, s]));

  const combos: ReplanStrategyCode[][] = strategies.map((s) => [s.code]);
  for (const s of strategies) {
    for (const other of strs(s.params.combineWith) as ReplanStrategyCode[]) {
      if (byCode.has(other)) combos.push([other, s.code]);
    }
  }

  const candidates: Candidate[] = [];
  for (const combo of combos) {
    const c = buildCandidate(combo, byCode, base, plan, ctx, rules, asOf, impact);
    if (c) candidates.push(c);
  }
  // Same date, same providers, no disruption: what "on track" would look like today.
  const reference = buildPlan(goal, ctx, rules, asOf, { forceProviders: base.opts.forceProviders, version: plan.version });
  const scored = candidates.map((c) => toScenario(c, goal, reference, ctx, base, plan.id));
  return rank(scored);
}

/** Pick the chosen scenario: it becomes the active plan, the goal is `replanned` (or `paused`). */
export function chooseScenario(goal: Goal, s: Scenario): { goal: Goal; plan: Plan } {
  const status = s.goalStatus ?? "replanned";
  return {
    goal: { ...clone(goal), constraints: { ...clone(goal.constraints), ...clone(s.goalPatch) }, status },
    plan: { ...clone(s.plan), reason: "replan" },
  };
}

// ---------------------------------------------------------------- candidates

function baseOf(goal: Goal, plan: Plan, ctx: PersistentContext, d?: Disruption): Base {
  const g = clone(goal);
  const c = constraintsOf(g);
  const delta = (d?.delta ?? {}) as DisruptionDelta;
  const forceProviders: Partial<Record<CapabilityCode, number>> = {};
  for (const s of plan.steps) forceProviders[s.capability] = s.provider.sourceRow;
  const opts: BuildOpts = { forceProviders, version: plan.version + 1, reason: "replan" };
  const delayed = d ? disruptedStep(plan, delta) : undefined;

  if (d?.code === "COST_OVERRUN" && delayed && delta.costOverrunEur) {
    const price = purchasePriceOf(goal, plan);
    if (price !== undefined) c.targetProperty = { ...(c.targetProperty ?? {}), price };
    opts.costOverrides = { [delayed.capability]: (delayed.provider.costEur ?? 0) + delta.costOverrunEur };
  }
  if (d?.code === "PARTNER_DELAY" && delayed && delta.delayDays) {
    opts.extraLeadDays = { [delayed.capability]: delta.delayDays };
  }
  if (d?.code === "RATE_CHANGE" && delta.rateDeltaPct) {
    c.ratePct = round2((c.ratePct ?? DEFAULT_RATE_PCT) + delta.rateDeltaPct);
  }
  // Own funds can never exceed what is left on the savings accounts.
  const funds = affordability(ctx).ownFunds;
  if (c.ownFunds !== undefined && c.ownFunds > funds) c.ownFunds = funds;
  return { goal: g, opts, delayed };
}

function buildCandidate(
  combo: ReplanStrategyCode[], byCode: Map<ReplanStrategyCode, ReplanStrategy>, base: Base, original: Plan,
  ctx: PersistentContext, rules: RuleSet, asOf: string, impact: Impact,
): Candidate | null {
  const g = clone(base.goal);
  const c = constraintsOf(g);
  const opts: BuildOpts = clone(base.opts);
  const notes: string[] = [];
  const p = (code: ReplanStrategyCode) => byCode.get(code)!.params;
  const openCaps = new Set(original.steps.filter((s) => !isFinished(s)).map((s) => s.capability));
  let searchBudget = false;
  let paused = false;
  let reorder = false;

  for (const code of combo) {
    switch (code) {
      case "REDUCE_SCOPE": {
        const later = (strs(p(code).phaseLater) as CapabilityCode[]).filter((cap) => openCaps.has(cap));
        if (later.length) {
          opts.dropCapabilities = [...(opts.dropCapabilities ?? []), ...later];
          notes.push(`${later.map(capLabel).join(" and ")} move to a 2nd phase`);
        }
        searchBudget = impact.broken.some((b) => b.constraint !== "deadline");
        break;
      }
      case "EXTEND_TERM": {
        const max = num(p(code).maxTermYears, 30);
        if ((c.termYears ?? 25) >= max) return null;
        c.termYears = max;
        // A cost overrun is absorbed by borrowing it over a longer term: the envelope grows by the overrun.
        const over = impact.broken.find((b) => b.constraint === "budget");
        if (over && typeof over.actual === "number" && c.budget !== undefined && impact.disruption === "COST_OVERRUN") {
          c.budget = Math.max(c.budget, over.actual);
          notes.push(`the extra ${eur(over.actual - Number(over.limit))} is added to the loan`);
        }
        searchBudget = impact.broken.some((b) => b.constraint === "maxMonthlyPayment" || b.constraint === "ownFunds");
        break;
      }
      case "SWAP_PROVIDER": {
        const s = base.delayed;
        if (!s || !rules.providers.some((x) => x.capability === s.capability && x.sourceRow !== s.provider.sourceRow)) return null;
        opts.excludeProviders = [...(opts.excludeProviders ?? []), s.provider.sourceRow];
        delete opts.forceProviders?.[s.capability];
        delete opts.costOverrides?.[s.capability];
        delete opts.extraLeadDays?.[s.capability];
        break;
      }
      case "REORDER": {
        if (!base.delayed) return null;
        reorder = true;
        break;
      }
      case "ADD_PROTECTION": {
        const caps = strs(p(code).always) as CapabilityCode[];
        if (/self|freelan/i.test(ctx.employment)) caps.push(...(strs(p(code).selfEmployed) as CapabilityCode[]));
        opts.includeCapabilities = [...(opts.includeCapabilities ?? []), ...caps];
        break;
      }
      case "MAXIMISE_GRANTS": {
        const cap = (p(code).capability as CapabilityCode | undefined) ?? "identify_grants";
        opts.includeCapabilities = [...(opts.includeCapabilities ?? []), cap];
        const step = original.steps.find((s) => s.capability === cap);
        if (step) {
          const best = [step.provider, ...step.alternatives].reduce((a, b) =>
            (b.estimates.customerEurOneOff ?? 0) > (a.estimates.customerEurOneOff ?? 0) ? b : a);
          opts.forceProviders = { ...opts.forceProviders, [cap]: best.sourceRow };
        }
        break;
      }
      case "PAUSE": {
        paused = true;
        const days = num(p(code).followUpDays, 30);
        notes.push(`nothing is lost: Kate checks in again on ${addDays(asOf, days)}`);
        break;
      }
    }
  }

  // Decision rules on the new context (e.g. commercial non-urgent steps WAIT under cashflow pressure).
  const build = (goal: Goal) => keepProgress(applyDecisionRules(buildPlan(goal, ctx, rules, asOf, opts), ctx, [], rules), original);
  let plan = build(g);

  if (searchBudget && !fitsMoney(plan, g, ctx, rules, combo)) {
    const priceFixed = original.steps.some((s) => (s.capability === "find_property" || s.capability === "finance_property") && isFinished(s));
    const found = searchBudgetDown(g, ctx, build, rules, combo, priceFixed);
    if (!found) return null;
    plan = found.plan;
    Object.assign(g, { constraints: found.goal.constraints });
  }
  if (reorder && base.delayed) {
    const later = withDependents(plan, plan.steps.find((s) => s.capability === base.delayed!.capability)?.id ?? "");
    plan = { ...plan, steps: plan.steps.map((s) => (later.has(s.id) && !isFinished(s) ? { ...s, status: "paused" } : s)) };
    const n = later.size - 1;
    notes.push(`${capLabel(base.delayed.capability)}${n > 0 ? ` and ${n} dependent step${n > 1 ? "s" : ""}` : ""} wait for ${base.delayed.provider.provider}; everything else continues now`);
  }
  if (combo.includes("MAXIMISE_GRANTS")) plan = grantsFirst(plan, (p("MAXIMISE_GRANTS").capability as CapabilityCode) ?? "identify_grants");
  if (paused) {
    plan = { ...plan, steps: plan.steps.map((s) => (isFinished(s) ? s : { ...s, status: "paused" })) };
    c.deadline = c.deadline ? addDays(c.deadline, num(p("PAUSE").followUpDays, 30)) : c.deadline;
  }
  plan = { ...plan, checks: checksFor(plan, g, ctx), version: base.opts.version ?? plan.version, reason: base.opts.reason ?? plan.reason };
  plan.atRisk = plan.checks.some((x) => !x.ok);
  return { strategies: combo, goal: g, plan, notes, paused };
}

/** Steps put on hold (REORDER phase 2 / PAUSE) do not count against the deadline. */
function checksFor(plan: Plan, goal: Goal, ctx: PersistentContext): ConstraintCheck[] {
  const live = plan.steps.filter((s) => s.status !== "paused");
  const checks = checkConstraints({ ...plan, steps: live }, goal, ctx);
  if (live.length === plan.steps.length) return checks;
  const money = checkConstraints(plan, goal, ctx);
  return checks.map((c) => (c.constraint === "deadline" ? c : money.find((m) => m.constraint === c.constraint) ?? c));
}

function fitsMoney(plan: Plan, goal: Goal, ctx: PersistentContext, _rules: RuleSet, combo: ReplanStrategyCode[]): boolean {
  const checks = checkConstraints(plan, goal, ctx).filter((c) => c.constraint !== "deadline");
  if (checks.some((c) => !c.ok)) return false;
  if (!combo.includes("REDUCE_SCOPE")) return true;
  // Reducing scope aims for a comfortable payment, not the edge of the limit.
  const pay = checks.find((c) => c.constraint === "maxMonthlyPayment");
  return !pay || typeof pay.actual !== "number" || typeof pay.limit !== "number" || pay.actual <= pay.limit * 0.95;
}

/** Largest budget (in €5k steps) that fits the money constraints; a target price moves with it. */
function searchBudgetDown(
  goal: Goal, ctx: PersistentContext, build: (g: Goal) => Plan, rules: RuleSet, combo: ReplanStrategyCode[], priceFixed: boolean,
): { goal: Goal; plan: Plan } | null {
  if (priceFixed) return null; // the home is already found: only the renovation scope can move
  const c0 = constraintsOf(goal);
  const budget = c0.budget;
  if (!budget) return null;
  const step = 5000;
  const at = (cut: number) => {
    const g = clone(goal);
    const c = constraintsOf(g);
    c.budget = budget - cut;
    if (c.targetProperty?.price !== undefined) c.targetProperty.price = Math.max(0, c.targetProperty.price - cut);
    return { goal: g, plan: build(g) };
  };
  // Floor: a home costing just the own funds, plus the net works. Below it the budget check breaks again.
  const s0 = build(goal).summary;
  const floor = (c0.ownFunds ?? 0) + (s0 ? Math.max(0, s0.renovationCost - s0.grants) : 0);
  let lo = 0;                                                  // cuts (in steps) known not to fit
  let hi = Math.max(0, Math.floor((budget - floor) / step));   // cuts known to fit (checked below)
  const top = at(hi * step);
  if (!fitsMoney(top.plan, top.goal, ctx, rules, combo)) return null;
  let best = top;
  for (let guard = 0; hi - lo > 1 && guard < 64; guard++) {    // bounded: no 32-bit overflow, at most 64 halvings
    const mid = Math.floor((lo + hi) / 2);
    const r = at(mid * step);
    if (fitsMoney(r.plan, r.goal, ctx, rules, combo)) { hi = mid; best = r; } else lo = mid;
  }
  return best.goal.constraints.budget && best.goal.constraints.budget > 0 ? best : null;
}

/** Keep what the customer already did: same capability + same provider keeps its status. */
function keepProgress(plan: Plan, original: Plan): Plan {
  const kept = new Map(original.steps.filter((s) => s.status !== "todo").map((s) => [`${s.capability}:${s.provider.sourceRow}`, s.status]));
  return { ...plan, steps: plan.steps.map((s) => ({ ...s, status: kept.get(`${s.capability}:${s.provider.sourceRow}`) ?? s.status })) };
}

function grantsFirst(plan: Plan, cap: CapabilityCode): Plan {
  const g = plan.steps.find((s) => s.capability === cap);
  if (!g) return plan;
  const deps = new Set<string>();
  const visit = (id: string) => plan.steps.find((s) => s.id === id)?.dependsOn.forEach((d) => { deps.add(d); visit(d); });
  visit(g.id);
  const firstOpen = Math.min(...plan.steps.filter((s) => !isFinished(s) && !deps.has(s.id) && s.id !== g.id).map((s) => s.order));
  const steps = plan.steps.map((s) => (s.id === g.id && s.order > firstOpen ? { ...s, order: firstOpen - 0.5 } : s));
  return { ...plan, steps: [...steps].sort((a, b) => a.order - b.order).map((s, i) => ({ ...s, order: i + 1 })) };
}

// ---------------------------------------------------------------- scoring

/** Safety of one check: ok with margin → up to 1; broken → falls fast to 0. */
export function checkSafety(c: ConstraintCheck): number {
  const { ratio, days } = overshoot(c);
  if (c.constraint === "ownFunds") return c.ok ? 1 : Math.max(0, 0.5 - ratio * 2.5);
  if (typeof c.actual === "number" && typeof c.limit === "number") {
    if (c.ok) return c.limit > 0 ? 0.8 + 0.2 * clamp((1 - c.actual / c.limit) / (1 - SAFE_PAYMENT_SHARE)) : 1;
    return Math.max(0, 0.5 - ratio * 2.5);
  }
  if (c.ok) {
    const slack = daysBetween(String(c.actual), String(c.limit));
    return 0.8 + 0.2 * clamp(slack / 30);
  }
  return Math.max(0, 0.5 - days / 120);
}

function totalRepaid(plan: Plan, goal: Goal): number {
  const months = (goal.constraints.termYears ?? 25) * 12;
  const oneOff = plan.steps.filter(isActive).reduce((s, x) => s + (x.estimates.monthlyPayment ? 0 : x.provider.costEur ?? 0), 0);
  return monthlyPayment(plan) * months + oneOff;
}

function toScenario(c: Candidate, goal: Goal, original: Plan, ctx: PersistentContext, base: Base, planId: string): Scenario {
  const checks = c.plan.checks;
  const safety = checks.length ? checks.reduce((s, x) => s + checkSafety(x), 0) / checks.length : 1;
  const protectedBonus = c.strategies.includes("ADD_PROTECTION") ? 0.05 : 0;
  const pSuccess = round2(c.paused ? PAUSE_SUCCESS : clamp(safety + protectedBonus));

  const budget0 = goal.constraints.budget ?? 0;
  const extra = Math.max(0, totalRepaid(c.plan, c.goal) - totalRepaid(original, goal));
  const cost = budget0 > 0 ? clamp(extra / (COST_PENALTY_SCALE * budget0)) : 0;

  const eta0 = lastEta(original);
  const eta1 = lastEta({ ...c.plan, steps: c.plan.steps.filter((s) => s.status !== "paused") });
  const pausedDays = c.paused && goal.constraints.deadline && c.goal.constraints.deadline
    ? daysBetween(goal.constraints.deadline, c.goal.constraints.deadline) : 0;
  const phase2 = c.plan.steps.some((s) => s.status === "paused") && !c.paused ? 30 : 0;
  const delayDays = Math.max(0, eta0 && eta1 ? daysBetween(eta0, eta1) : 0) + pausedDays + phase2;
  const delay = clamp(delayDays / DELAY_PENALTY_DAYS);

  const fit = priorityFit(c, goal, original, delay);
  const score = round2(SCORE_WEIGHTS.success * pSuccess + SCORE_WEIGHTS.cost * (1 - cost) + SCORE_WEIGHTS.delay * (1 - delay) + SCORE_WEIGHTS.fit * fit);

  const pay = monthlyPayment(c.plan);
  const scenario: Scenario = {
    id: `${planId}:${c.strategies.join("+").toLowerCase()}`,
    goalId: goal.id,
    label: labelOf(c, goal, base),
    strategies: c.strategies,
    plan: c.plan,
    goalPatch: patchOf(goal, c.goal),
    score,
    probabilityOfSuccess: pSuccess,
    tradeoffs: tradeoffsOf(c, goal, original, ctx, pay, extra),
    monthlyPayment: pay > 0 ? pay : null,
    deadline: c.goal.constraints.deadline ?? eta1,
  };
  if (c.paused) scenario.goalStatus = "paused";
  return scenario;
}

function priorityFit(c: Candidate, goal: Goal, original: Plan, delay: number): number {
  const b0 = goal.constraints.budget ?? 0;
  const parts = [b0 > 0 ? clamp((c.goal.constraints.budget ?? b0) / b0) : 1];
  const energy = (p: Plan) => p.steps.filter((s) => isActive(s) && s.status !== "paused" && ENERGY_CAPABILITIES.includes(s.capability)).length;
  const e0 = energy(original);
  const pay = c.plan.checks.find((x) => x.constraint === "maxMonthlyPayment");
  for (const pr of goal.priorities) {
    if (pr === "affordability") parts.push(pay ? checkSafety(pay) : 1);
    if (pr === "energy_efficiency") parts.push(e0 ? clamp(energy(c.plan) / e0) : 1);
    if (pr === "speed") parts.push(1 - delay);
    if (pr === "security") parts.push(c.strategies.includes("ADD_PROTECTION") ? 1 : 0.5);
  }
  return parts.reduce((a, b) => a + b, 0) / parts.length;
}

/** Feasible first, then score; the 2nd scenario must use a different main strategy and a different payment. */
function rank(list: Scenario[]): Scenario[] {
  const feasible = (s: Scenario) => (s.plan.atRisk ? 0 : 1);
  const sorted = [...list].sort((a, b) => feasible(b) - feasible(a) || b.score - a.score || a.id.localeCompare(b.id));
  if (sorted.length < 3) return sorted;
  const [first] = sorted;
  const distinct = (s: Scenario) =>
    s.strategies[0] !== first.strategies[0] && !s.strategies.every((x) => first.strategies.includes(x)) &&
    (first.monthlyPayment === null || s.monthlyPayment === null || Math.abs(s.monthlyPayment - first.monthlyPayment) >= 10);
  const second = sorted.slice(1).find(distinct) ?? sorted[1];
  return [first, second, ...sorted.filter((s) => s !== first && s !== second)];
}

// ---------------------------------------------------------------- wording

const CAP_LABEL: Partial<Record<CapabilityCode, string>> = {
  evaluate_solar: "solar panels", quote_windows: "new windows", quote_insulation: "the insulation quote", quote_heating: "the heating quote",
  identify_grants: "grants", insure_loan: "outstanding-balance insurance", insure_income: "income protection",
};
export const capLabel = (c: CapabilityCode) => CAP_LABEL[c] ?? c.replace(/_/g, " ");
const k = (n: number) => `€${Math.round(n / 1000)}k`;

function labelOf(c: Candidate, goal: Goal, base: Base): string {
  const parts: string[] = [];
  const b0 = goal.constraints.budget;
  const b1 = c.goal.constraints.budget;
  const cut = b0 && b1 && b1 < b0;
  for (const s of c.strategies) {
    if (s === "REDUCE_SCOPE") parts.push(cut ? `Smaller budget (${k(b1!)})${c.notes.some((n) => n.includes("2nd phase")) ? ", renovate in 2 phases" : ""}` : "Renovate in 2 phases");
    if (s === "EXTEND_TERM") {
      const years = c.goal.constraints.termYears;
      parts.push(cut ? `${years}-year loan (${k(b1!)})` : b0 && b1 && b1 > b0 ? `Spread the extra cost over ${years} years` : `Keep ${b0 ? k(b0) : "your budget"} over ${years} years`);
    }
    if (s === "ADD_PROTECTION") parts.push("outstanding-balance insurance");
    if (s === "SWAP_PROVIDER") {
      const step = c.plan.steps.find((x) => x.capability === base.delayed?.capability);
      parts.push(`Switch to ${step?.provider.provider ?? "another provider"}`);
    }
    if (s === "REORDER") parts.push(`Keep ${base.delayed?.provider.provider ?? "the partner"}, move the rest forward`);
    if (s === "MAXIMISE_GRANTS") parts.push("Claim grants first");
    if (s === "PAUSE") parts.push("Pause and keep your progress");
  }
  const text = parts.join(" + ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function tradeoffsOf(c: Candidate, goal: Goal, original: Plan, ctx: PersistentContext, pay: number, extra: number): string[] {
  const out: string[] = [];
  const b0 = goal.constraints.budget;
  const b1 = c.goal.constraints.budget;
  if (b0 && b1 && b1 < b0) out.push(`Budget goes from ${eur(b0)} to ${eur(b1)}`);
  const limit = c.plan.checks.find((x) => x.constraint === "maxMonthlyPayment");
  if (pay > 0) out.push(`New payment ${eur(pay)}/month${typeof limit?.limit === "number" ? ` (max ${eur(limit.limit)})` : ""}`);
  if (c.strategies.includes("EXTEND_TERM") && extra > 0) out.push(`About ${eur(extra)} more paid over the life of the loan`);
  if (c.strategies.includes("ADD_PROTECTION")) out.push("The loan is covered if your income drops again (small monthly premium)");
  if (c.strategies.includes("SWAP_PROVIDER")) {
    const before = original.steps.find((s) => s.provider.sourceRow === (c.plan.steps.find((x) => x.status !== "done" && !original.steps.some((o) => o.provider.sourceRow === x.provider.sourceRow))?.provider.sourceRow));
    const swapped = c.plan.steps.find((x) => !original.steps.some((o) => o.provider.sourceRow === x.provider.sourceRow));
    if (swapped) out.push(`${swapped.provider.provider} replaces the late partner (lead time ${swapped.provider.leadTimeDays} days${swapped.provider.costEur ? `, ${eur(swapped.provider.costEur)}` : ""})${before ? "" : ""}`);
  }
  if (c.strategies.includes("MAXIMISE_GRANTS")) {
    const g = c.plan.steps.find((s) => s.capability === "identify_grants");
    if (g?.estimates.customerEurOneOff) out.push(`${eur(g.estimates.customerEurOneOff)} of grants count against the extra cost`);
  }
  const eta = lastEta({ ...c.plan, steps: c.plan.steps.filter((s) => s.status !== "paused") });
  const eta0 = lastEta(original);
  if (eta && eta0 && eta > eta0) out.push(`Finishes about ${daysBetween(eta0, eta)} days later`);
  if (ctx.cashflowPressure === "high") out.push("Non-essential offers stay on hold while your finances settle");
  return [...c.notes.map((n) => n.charAt(0).toUpperCase() + n.slice(1)), ...out];
}

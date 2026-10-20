import type {
  CapabilityCode,
  ConstraintCheck,
  Goal,
  GoalConstraints,
  GoalTemplate,
  GoalType,
  PersistentContext,
  Plan,
  PlanStep,
  Priority,
  Provider,
  RuleSet,
  TemplateStep,
} from "../types";
import { evalCondition } from "./condition";
import { affordability, annuity, DEFAULT_RATE_PCT, DEFAULT_TERM_YEARS } from "./finance";

/** Illustrative energy-loan rate (KBC representative example 2025, docs/assumptions.md). */
export const ENERGY_RATE_PCT = 3.25;
/** A buyer without a chosen property: assume a typical pre-1981 Flemish house (66% of the stock). */
export const DEFAULT_TARGET_PROPERTY = { kind: "house" as const, buildYear: 1975, epc: "E" };
/** Default horizon for a goal without a deadline. */
const DEFAULT_DEADLINE_MONTHS = 6;

/** Capabilities whose provider cost is the price of the works (renovation budget). */
const WORKS: CapabilityCode[] = ["quote_insulation", "quote_heating", "quote_windows", "evaluate_solar"];
const HOME_GOALS: GoalType[] = ["BUY_AND_PREPARE_HOME"];
const PARTNER_DEFAULT_DATA = ["first_name", "email"];

export interface BuildPlanOptions {
  excludeProviders?: number[];
  forceProviders?: Partial<Record<CapabilityCode, number>>;
  dropCapabilities?: CapabilityCode[];
  /** Force a template step even if its condition is false. */
  includeCapabilities?: CapabilityCode[];
  /** Absolute provider cost (€) per capability, e.g. a cost overrun on a quote. */
  costOverrides?: Partial<Record<CapabilityCode, number>>;
  /** Extra lead time (days) per capability, e.g. a partner delay. */
  extraLeadDays?: Partial<Record<CapabilityCode, number>>;
  version?: number;
  reason?: Plan["reason"];
}

// ---------- small pure helpers ----------

const addDays = (iso: string, days: number): string => {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Math.round(days));
  return d.toISOString().slice(0, 10);
};
const addMonths = (iso: string, months: number): string => {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
};
const eur = (n: number): string => `€${Math.round(n).toLocaleString("en-US")}`;
const round = (n: number): number => Math.round(n);

export function getTemplate(goalType: GoalType, rules: RuleSet): GoalTemplate {
  const t = rules.templates.find((x) => x.goalType === goalType);
  if (!t) throw new Error(`Unknown goal type: ${goalType}`);
  return t;
}

function providersFor(code: CapabilityCode, rules: RuleSet): Provider[] {
  return rules.providers.filter((p) => p.capability === code).sort((a, b) => b.priority - a.priority || a.sourceRow - b.sourceRow);
}

/** Context as seen by template conditions: a buyer's target property comes first in `properties`. */
function planningContext(goal: Goal, ctx: PersistentContext): PersistentContext {
  const t = goal.constraints.targetProperty;
  if (!t) return ctx;
  const target = { kind: t.kind ?? "house", buildYear: t.buildYear ?? DEFAULT_TARGET_PROPERTY.buildYear, epc: t.epc ?? null, value: t.price ?? 0 };
  return { ...ctx, properties: [target, ...ctx.properties] };
}

/** Provider score: registry priority + fit with the customer's priorities. Higher is better. */
function scoreProvider(p: Provider, priorities: Priority[]): number {
  let s = p.priority;
  if (priorities.includes("affordability")) s -= (p.costEur ?? 0) / 1000;
  if (priorities.includes("speed")) s -= p.leadTimeDays / 7;
  if (priorities.includes("energy_efficiency")) s += (p.estimates.kwhPerYear ?? 0) / 2000;
  if (!p.isPartner && priorities.includes("security")) s += 1;
  return s;
}

// ---------- ⑥ goal ----------

export function createGoal(
  input: { customerId: number; type: GoalType; constraints: GoalConstraints; priorities: Priority[] },
  ctx: PersistentContext,
  rules: RuleSet,
  asOf: string,
): Goal {
  const template = getTemplate(input.type, rules);
  const termYears = input.constraints.termYears ?? template.defaultConstraints.termYears ?? DEFAULT_TERM_YEARS;
  const ratePct = input.constraints.ratePct ?? DEFAULT_RATE_PCT;
  const a = affordability(ctx, ratePct, termYears);
  const constraints: GoalConstraints = { ...template.defaultConstraints, ...input.constraints, termYears };
  constraints.maxMonthlyPayment ??= a.maxMonthlyPayment;
  constraints.ownFunds ??= a.ownFunds;
  constraints.deadline ??= addMonths(asOf, DEFAULT_DEADLINE_MONTHS);
  if (HOME_GOALS.includes(input.type)) {
    constraints.budget ??= Math.floor((a.maxPrincipal + constraints.ownFunds) / 5000) * 5000;
    constraints.targetProperty ??= { ...DEFAULT_TARGET_PROPERTY };
  }
  return {
    id: `goal-${input.customerId}-${input.type.toLowerCase()}`,
    customerId: input.customerId,
    type: input.type,
    status: "confirmed",
    constraints,
    priorities: input.priorities,
    dependsOn: [],
    createdAt: asOf,
  };
}

// ---------- ⑦ plan ----------

export function buildPlan(goal: Goal, ctx: PersistentContext, rules: RuleSet, asOf: string, opts: BuildPlanOptions = {}): Plan {
  const template = getTemplate(goal.type, rules);
  const pctx = planningContext(goal, ctx);
  const c = goal.constraints;
  const ratePct = c.ratePct ?? DEFAULT_RATE_PCT;
  const termYears = c.termYears ?? template.defaultConstraints.termYears ?? DEFAULT_TERM_YEARS;

  // 1–2. template steps whose condition holds
  const kept = template.steps.filter((s) => {
    if (opts.dropCapabilities?.includes(s.capability)) return false;
    if (opts.includeCapabilities?.includes(s.capability)) return true;
    return evalCondition(s.condition, { ctx: pctx, goal });
  });
  const keptCodes = new Set(kept.map((s) => s.capability));

  // 3. provider choice
  const chosen = new Map<CapabilityCode, { provider: Provider; alternatives: Provider[] }>();
  for (const s of kept) {
    let candidates = providersFor(s.capability, rules).filter((p) => !opts.excludeProviders?.includes(p.sourceRow));
    if (candidates.length === 0) candidates = providersFor(s.capability, rules); // never leave a step without a provider
    if (candidates.length === 0) continue;
    const cost = opts.costOverrides?.[s.capability];
    const extra = opts.extraLeadDays?.[s.capability] ?? 0;
    candidates = candidates.map((p) => ({
      ...p,
      costEur: cost !== undefined ? cost : p.costEur,
      leadTimeDays: p.leadTimeDays + extra,
    }));
    const forced = opts.forceProviders?.[s.capability];
    const ranked = [...candidates].sort(
      (a, b) =>
        Number(b.sourceRow === forced) - Number(a.sourceRow === forced) ||
        scoreProvider(b, goal.priorities) - scoreProvider(a, goal.priorities) ||
        a.sourceRow - b.sourceRow,
    );
    chosen.set(s.capability, { provider: ranked[0], alternatives: ranked.slice(1) });
  }
  const steps0 = kept.filter((s) => chosen.has(s.capability));

  // 4. topological sort (Kahn), tie-broken by template position; dependencies outside the plan are ignored
  const deps = (s: TemplateStep) => s.dependsOn.filter((d) => keptCodes.has(d) && chosen.has(d));
  const ordered: TemplateStep[] = [];
  const placed = new Set<CapabilityCode>();
  const pending = [...steps0].sort((a, b) => a.position - b.position);
  while (pending.length) {
    const i = pending.findIndex((s) => deps(s).every((d) => placed.has(d)));
    const next = pending.splice(i === -1 ? 0 : i, 1)[0]; // i === -1 only on a cycle: break it deterministically
    ordered.push(next);
    placed.add(next.capability);
  }

  // ETAs: asOf + longest lead-time chain
  const finish = new Map<CapabilityCode, string>();
  for (const s of ordered) {
    const start = deps(s).reduce((acc, d) => (finish.get(d)! > acc ? finish.get(d)! : acc), asOf.slice(0, 10));
    finish.set(s.capability, addDays(start, chosen.get(s.capability)!.provider.leadTimeDays));
  }

  // 6. money: renovation, grants, loans
  const renovationCost = ordered.filter((s) => WORKS.includes(s.capability)).reduce((sum, s) => sum + (chosen.get(s.capability)!.provider.costEur ?? 0), 0);
  const grantsRaw = ordered.filter((s) => s.capability === "identify_grants").reduce((sum, s) => sum + (chosen.get(s.capability)!.provider.estimates.customerEurOneOff ?? 0), 0);
  const grants = Math.min(grantsRaw, renovationCost);
  const ownFunds = c.ownFunds ?? 0;
  const budget = c.budget ?? 0;
  const purchasePrice = c.targetProperty?.price ?? Math.max(0, budget - renovationCost + grants);
  const hasHomeLoan = keptCodes.has("finance_property");
  const hasRenoLoan = keptCodes.has("finance_renovation");
  const homeLoan = hasHomeLoan ? Math.max(0, purchasePrice - ownFunds) : 0;
  const renovationLoan = hasRenoLoan ? Math.max(0, renovationCost - grants - Math.max(0, ownFunds - purchasePrice)) : 0;
  const homePayment = annuity(homeLoan, ratePct, termYears);
  const renoPayment = annuity(renovationLoan, ENERGY_RATE_PCT, termYears);

  const epc = pctx.properties[0]?.epc ?? "unknown";
  const buildYear = pctx.properties[0]?.buildYear ?? "unknown";
  const values: Record<string, string> = {
    firstName: ctx.firstName,
    budget: eur(budget),
    ownFunds: eur(ownFunds),
    maxMonthlyPayment: eur(c.maxMonthlyPayment ?? 0),
    purchasePrice: eur(purchasePrice),
    homeLoan: eur(homeLoan),
    renovationLoan: eur(renovationLoan),
    renovationCost: eur(renovationCost),
    grants: eur(grants),
    termYears: String(termYears),
    ratePct: `${ratePct}%`,
    monthlyPayment: eur(homePayment),
    epc: String(epc),
    buildYear: String(buildYear),
    region: ctx.region,
  };
  const fill = (text: string, provider: Provider) =>
    text
      .replace(/\{(\w+)\}/g, (_, k: string) => (k === "provider" ? provider.provider : (values[k] ?? ""))) // never leak a raw placeholder: Kate quotes `why` verbatim
      .replace(/\s{2,}/g, " ")
      .trim();

  const stepId = (code: CapabilityCode) => `${goal.id}:${code}`;
  const steps: PlanStep[] = ordered.map((s, i) => {
    const { provider, alternatives } = chosen.get(s.capability)!;
    const capDef = rules.capabilities.find((x) => x.code === s.capability);
    const estimates = { ...provider.estimates };
    if (s.capability === "finance_property") estimates.monthlyPayment = round(homePayment);
    if (s.capability === "finance_renovation") estimates.monthlyPayment = round(renoPayment);
    if (s.capability === "identify_grants") estimates.customerEurOneOff = grants;
    return {
      id: stepId(s.capability),
      capability: s.capability,
      chapter: s.chapter,
      order: i + 1,
      provider,
      alternatives,
      dependsOn: deps(s).map(stepId),
      status: "todo",
      display: "SHOW_STEP",
      why: fill(s.why, provider),
      // a partner always needs at least contact details, otherwise consent (and the lead) is impossible
      dataRequested: provider.isPartner ? (capDef?.requiredData.length ? [...capDef.requiredData] : [...PARTNER_DEFAULT_DATA]) : [],
      estimates,
      eta: finish.get(s.capability) ?? null,
      optional: s.optional,
    };
  });

  const version = opts.version ?? 1;
  const plan: Plan = {
    id: `${goal.id}:v${version}`,
    goalId: goal.id,
    version,
    reason: opts.reason ?? "initial",
    steps,
    checks: [],
    atRisk: false,
    createdAt: asOf,
    summary: {
      purchasePrice: round(purchasePrice),
      renovationCost: round(renovationCost),
      grants: round(grants),
      homeLoan: round(homeLoan),
      renovationLoan: round(renovationLoan),
      monthlyPayment: round(homePayment + renoPayment),
      ratePct,
    },
  };
  // 7. constraints
  plan.checks = checkConstraints(plan, goal, ctx);
  plan.atRisk = plan.checks.some((x) => !x.ok);
  return plan;
}

/** Steps that still count: not skipped, not hidden, not already covered. */
export function activeSteps(plan: Plan): PlanStep[] {
  return plan.steps.filter((s) => s.status !== "skipped" && s.display !== "HIDDEN" && s.display !== "ALREADY_COVERED");
}

export function checkConstraints(plan: Plan, goal: Goal, ctx: PersistentContext): ConstraintCheck[] {
  const c = goal.constraints;
  const checks: ConstraintCheck[] = [];
  const active = activeSteps(plan);
  const ids = new Set(active.map((s) => s.id));

  // monthly payments vs the goal limit and what the (possibly changed) context can afford
  const monthly = round(active.reduce((sum, s) => sum + (s.estimates.monthlyPayment ?? 0), 0));
  if (monthly > 0 || c.maxMonthlyPayment !== undefined) {
    const afford = affordability(ctx, c.ratePct ?? DEFAULT_RATE_PCT, c.termYears ?? DEFAULT_TERM_YEARS).maxMonthlyPayment;
    const limit = Math.min(c.maxMonthlyPayment ?? Infinity, afford);
    const byIncome = afford < (c.maxMonthlyPayment ?? Infinity);
    const ok = monthly <= limit;
    checks.push({
      constraint: "maxMonthlyPayment",
      ok,
      actual: monthly,
      limit,
      message: ok
        ? `New monthly payments of ${eur(monthly)} fit within your ${eur(limit)} limit.`
        : `New monthly payments of ${eur(monthly)} are ${eur(monthly - limit)} above ${byIncome ? "what your current income allows" : "your limit"} (${eur(limit)}).`,
    });
  }

  // all-in budget: purchase + renovation − grants
  if (c.budget !== undefined && plan.summary) {
    const s = plan.summary;
    const renovation = active.filter((x) => WORKS.includes(x.capability)).reduce((sum, x) => sum + (x.provider.costEur ?? 0), 0);
    const grants = Math.min(
      renovation,
      active.filter((x) => x.capability === "identify_grants").reduce((sum, x) => sum + (x.estimates.customerEurOneOff ?? 0), 0),
    );
    const total = round(s.purchasePrice + renovation - grants);
    const ok = total <= c.budget;
    checks.push({
      constraint: "budget",
      ok,
      actual: total,
      limit: c.budget,
      message: ok
        ? `Home ${eur(s.purchasePrice)} + works ${eur(renovation)} − grants ${eur(grants)} = ${eur(total)}, within your ${eur(c.budget)} budget.`
        : `Home ${eur(s.purchasePrice)} + works ${eur(renovation)} − grants ${eur(grants)} = ${eur(total)}, ${eur(total - c.budget)} over your ${eur(c.budget)} budget.`,
    });
  }

  // own funds must still be there
  if (c.ownFunds !== undefined && c.ownFunds > 0) {
    const ok = c.ownFunds <= ctx.savings;
    checks.push({
      constraint: "ownFunds",
      ok,
      actual: round(ctx.savings),
      limit: c.ownFunds,
      message: ok
        ? `Your savings (${eur(ctx.savings)}) cover the ${eur(c.ownFunds)} own contribution.`
        : `Your savings (${eur(ctx.savings)}) no longer cover the ${eur(c.ownFunds)} own contribution.`,
    });
  }

  // deadline
  if (c.deadline) {
    const last = active.filter((x) => ids.has(x.id) && x.eta).reduce<string | null>((m, x) => (m === null || x.eta! > m ? x.eta! : m), null);
    if (last) {
      const ok = last <= c.deadline.slice(0, 10);
      checks.push({
        constraint: "deadline",
        ok,
        actual: last,
        limit: c.deadline.slice(0, 10),
        message: ok ? `Everything can be done by ${last}, before your ${c.deadline.slice(0, 10)} deadline.` : `The last step ends on ${last}, after your ${c.deadline.slice(0, 10)} deadline.`,
      });
    }
  }
  return checks;
}

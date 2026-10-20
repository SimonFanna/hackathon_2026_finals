// UI ↔ backend adapter: calls the T7 API (/api/*, same origin) and maps its answers to the V0 UI types ("@/engine").
// Never throws: every function returns null on any failure, so the UI can fall back to its local engine.
import catalogue from "../backend/data/snapshot/catalogue.json";
import type {
  ConstraintCheck as ApiCheck,
  Decision as ApiDecision,
  Goal as ApiGoal,
  Impact as ApiImpact,
  Outcome as ApiOutcome,
  Plan as ApiPlan,
  PlanStep as ApiStep,
  Scenario as ApiScenario,
} from "../backend/types";
import type {
  ConstraintCheck,
  ConstraintDef,
  Customer,
  DetectedIntent,
  DisruptionKind,
  EvaluatedOption,
  Journey,
  JourneyState,
  JourneyStep,
  Metrics,
  OutcomePlan,
  PendingHit,
  Scoreboard,
  StepChange,
  StepDecision,
  Strategy,
} from "../engine";
import { checkPlan, health } from "../engine/outcome";

export type Slug = "sofie" | "lucas";
export const SLUG_FOR = { house: "sofie", business: "lucas" } as const;
export type Preset = "income_drop" | "cost_overrun" | "partner_delay";

const TIMEOUT_MS = 4000;

// ---------- transport ----------

let fetchImpl: typeof fetch = (...args) => fetch(...args);
let base = "/api";

/** Tests: route the calls in-process (or to another origin). */
export function configureBackend(opts: { fetch?: typeof fetch; base?: string }): void {
  if (opts.fetch) fetchImpl = opts.fetch;
  if (opts.base !== undefined) base = opts.base;
}

async function call<T>(path: string, init?: { method?: "GET" | "POST"; body?: unknown }): Promise<T | null> {
  try {
    const res = await fetchImpl(`${base}${path}`, {
      method: init?.method ?? "GET",
      headers: init?.body !== undefined ? { "content-type": "application/json" } : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

const post = <T>(path: string, body: unknown = {}) => call<T>(path, { method: "POST", body });
const enc = encodeURIComponent;

// ---------- static mappings ----------

const INTENT_FOR: Record<Slug, { code: string; intentId: string; label: string; city: string }> = {
  sofie: { code: "BUY_HOME", intentId: "buy_house", label: "Buying a home", city: "Gent" },
  lucas: { code: "START_BUSINESS", intentId: "start_business", label: "Starting a business", city: "Leuven" },
};
const SLUG_BY_CUSTOMER: Record<number, Slug> = { 1: "sofie", 2: "lucas" };
const GOAL_TITLE: Record<string, string> = { BUY_AND_PREPARE_HOME: "Buy and prepare a home", START_BUSINESS: "Start a business" };
const ECOSYSTEM_BY_ROW = new Map((catalogue as { sourceRow: number; ecosystem: string }[]).map((c) => [c.sourceRow, c.ecosystem]));

const STRATEGY: Record<string, Strategy> = {
  REDUCE_SCOPE: "defer",
  EXTEND_TERM: "refinance",
  SWAP_PROVIDER: "substitute",
  REORDER: "reorder",
  ADD_PROTECTION: "protect",
  MAXIMISE_GRANTS: "rebalance",
  PAUSE: "defer",
};
const KIND: Record<string, DisruptionKind> = {
  INCOME_DROP: "income",
  COST_OVERRUN: "cost",
  PARTNER_DELAY: "delay",
  RATE_CHANGE: "rate",
  UNEXPECTED_EXPENSE: "cashflow",
};
const PRESET_TITLE: Record<Preset, string> = {
  income_drop: "Income drop",
  cost_overrun: "Quote above the estimate",
  partner_delay: "Partner delay",
};

/** The 4 V0 gauges. Values / limits come from the backend plan checks (see toOutcomePlan). */
export const CONSTRAINT_DEFS: ConstraintDef[] = [
  { key: "cost", label: "All-in cost", kind: "max", unit: "eur" },
  { key: "monthly", label: "Monthly payment", kind: "max", unit: "eurMonth" },
  { key: "finish", label: "Finish month", kind: "max", unit: "month" },
  { key: "buffer", label: "Savings buffer", kind: "min", unit: "eur" },
];

// ---------- mappers (exported for the UI and tests) ----------

const monthsBetween = (from: string, to: string): number => {
  const a = new Date(from.slice(0, 10));
  const b = new Date(to.slice(0, 10));
  return Math.max(0, Math.round(((b.getTime() - a.getTime()) / 86_400_000 / 30.44) * 10) / 10);
};

const num = (v: number | string | undefined): number => (typeof v === "number" ? v : Number(v ?? 0));

/**
 * Backend plan → V0 OutcomePlan (the live gauges). `asOf` = the demo date (months are counted from it).
 * cost = all-in cost vs budget · monthly = payments vs max · finish = months to the last step vs to the deadline ·
 * buffer = savings left after own funds vs 0. A constraint the plan does not check is shown at rest (within its limit).
 */
export function toOutcomePlan(plan: Pick<ApiPlan, "checks" | "summary" | "steps">, asOf = "2026-10-01", override: ApiCheck[] = []): OutcomePlan {
  const checks = new Map(plan.checks.map((c) => [c.constraint, c]));
  for (const c of override) checks.set(c.constraint, c);
  const values: Metrics = { cost: 0, monthly: 0, finish: 0, buffer: 1 };
  const limits: Metrics = { cost: 1, monthly: 1, finish: 1, buffer: 0 };

  const budget = checks.get("budget");
  if (budget) [values.cost, limits.cost] = [num(budget.actual), num(budget.limit)];
  else {
    const cost = plan.steps.filter((s) => s.display !== "HIDDEN").reduce((n, s) => n + (s.provider.costEur ?? 0), 0);
    [values.cost, limits.cost] = [cost, Math.max(cost, 1)];
  }
  const monthly = checks.get("maxMonthlyPayment");
  if (monthly) [values.monthly, limits.monthly] = [num(monthly.actual), num(monthly.limit)];
  else if (plan.summary) [values.monthly, limits.monthly] = [plan.summary.monthlyPayment, Math.max(plan.summary.monthlyPayment, 1)];
  const deadline = checks.get("deadline");
  if (deadline) [values.finish, limits.finish] = [monthsBetween(asOf, String(deadline.actual)), monthsBetween(asOf, String(deadline.limit))];
  const own = checks.get("ownFunds");
  if (own) values.buffer = num(own.actual) - num(own.limit);
  return { values, limits };
}

function toChecks(plan: OutcomePlan): ConstraintCheck[] {
  return checkPlan(plan, CONSTRAINT_DEFS);
}

export function toScoreboard(o: ApiOutcome): Scoreboard {
  return {
    customer: { eurOneOff: o.customer.eurOneOff, eurPerYear: o.customer.eurPerYear, kwhPerYear: o.customer.kwhPerYear, co2KgPerYear: o.customer.co2KgPerYear },
    kbc: { productsActivated: o.kbc.productsActivated, revenueEur: o.kbc.revenueEur },
    partners: { leads: o.partners.leads, valueEur: o.partners.valueEur },
  };
}

const chapterId = (label: string) => label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function toStep(s: ApiStep): JourneyStep {
  const e = s.estimates;
  return {
    id: s.id,
    order: s.order,
    chapter: chapterId(s.chapter),
    title: s.provider.itemName,
    why: s.why,
    purpose: s.displayReason,
    ecosystem: ECOSYSTEM_BY_ROW.get(s.provider.sourceRow) ?? "",
    catalogueItem: s.provider.itemName,
    provider: s.provider.isPartner ? { kind: "partner", name: s.provider.provider } : { kind: "kbc" },
    dataShared: [...s.dataRequested],
    outcome: {
      customerEurOneOff: e.customerEurOneOff,
      customerEurPerYear: e.customerEurPerYear,
      kwhPerYear: e.kwhPerYear,
      co2KgPerYear: e.co2KgPerYear,
      kbcRevenueEur: e.kbcRevenueEur,
      partnerValueEur: e.partnerValueEur,
    },
  };
}

export function toJourney(plan: ApiPlan, goal: Pick<ApiGoal, "type" | "customerId">): Journey {
  const visible = plan.steps.filter((s) => s.display !== "HIDDEN").sort((a, b) => a.order - b.order);
  const chapters: { id: string; label: string }[] = [];
  for (const s of visible) if (!chapters.some((c) => c.label === s.chapter)) chapters.push({ id: chapterId(s.chapter), label: s.chapter });
  const slug = SLUG_BY_CUSTOMER[goal.customerId];
  return {
    intentId: slug ? INTENT_FOR[slug].intentId : goal.type.toLowerCase(),
    title: GOAL_TITLE[goal.type] ?? goal.type,
    chapters,
    steps: visible.map(toStep),
  };
}

export function toState(journey: Journey, plan: ApiPlan): JourneyState {
  const decisions: Record<string, StepDecision> = {};
  for (const s of plan.steps) {
    if (s.display === "HIDDEN") continue;
    decisions[s.id] =
      s.display === "ALREADY_COVERED" || ["accepted", "in_progress", "done"].includes(s.status) ? "accepted" : s.status === "skipped" ? "skipped" : "pending";
  }
  return { journey, decisions, consents: {} };
}

function toIntent(slug: Slug, r: PipelineLike): BackendIntent | null {
  const want = INTENT_FOR[slug];
  const d: ApiDecision | undefined = r.decisions.find((x) => x.intent === want.code);
  if (!d) return null;
  const moment = r.moments.find((m) => m.type === d.moment);
  const level = d.level === "SUGGEST" ? "suggest" : d.level === "ASK" ? "ask" : "none";
  const ctx = r.context;
  const household = `${ctx.household === "couple" ? "Couple" : "Single"}${ctx.children ? `, ${ctx.children} ${ctx.children === 1 ? "child" : "children"}` : ""}`;
  return {
    customer: { id: String(ctx.customerId), name: ctx.firstName, age: ctx.age, city: want.city, household },
    intent: {
      intentId: want.intentId,
      label: want.label,
      confidence: d.confidence ?? moment?.confidence ?? 0,
      level,
      needsConfirmation: level === "ask",
      reasons: [...new Set(d.explanation)],
    },
    kateText: r.kate?.kind === "proactive" ? r.kate.text : null,
    goalType: d.goalType ?? null,
    source: `${r.source.facts}/${r.source.state}`,
  };
}

// ---------- API ----------

type PipelineLike = {
  context: { customerId: number; firstName: string; age: number; household: string; children: number };
  decisions: ApiDecision[];
  moments: { type: string; confidence: number }[];
  kate: { kind: string; text: string } | null;
  plans: ApiPlan[];
  goals: ApiGoal[];
  impacts: ApiImpact[];
  disruptions: { code: string; at: string; evidence: string[] }[];
  scenarios: ApiScenario[];
  source: { facts: string; rules: string; state: string };
  asOf: string;
};
type GoalAnswer = { goal: ApiGoal; plan: ApiPlan; outcome: ApiOutcome };

export interface BackendIntent {
  customer: Customer;
  intent: DetectedIntent;
  kateText: string | null;
  goalType: string | null;
  source: string;
}

/** Wipe the persona's runtime state (goals, plans, injected events), so a new demo run starts from the detection. */
export async function resetPersona(slug: Slug): Promise<boolean> {
  return (await post(`/customers/${slug}/reset`)) !== null;
}

export async function fetchIntent(slug: Slug): Promise<BackendIntent | null> {
  const r = await call<PipelineLike>(`/customers/${slug}/pipeline`);
  return r ? safe(() => toIntent(slug, r)) : null;
}

export interface BackendJourney {
  goalId: string;
  journey: Journey;
  state: JourneyState;
  board: Scoreboard;
  plan: OutcomePlan;
}

/** Fresh start for the persona (reset), then the goal + its plan. */
export async function startJourney(slug: Slug, goalType: string): Promise<BackendJourney | null> {
  if (!(await post(`/customers/${slug}/reset`))) return null;
  const a = await post<GoalAnswer>("/goals", { slug, type: goalType });
  if (!a) return null;
  return safe(() => {
    const journey = toJourney(a.plan, a.goal);
    return { goalId: a.goal.id, journey, state: toState(journey, a.plan), board: toScoreboard(a.outcome), plan: toOutcomePlan(a.plan, a.goal.createdAt) };
  });
}

export async function sendStep(goalId: string, stepId: string, action: "accept" | "skip"): Promise<Scoreboard | null> {
  const a = await post<{ outcome: ApiOutcome }>(`/goals/${enc(goalId)}/steps/${enc(stepId)}`, { action });
  return a ? safe(() => toScoreboard(a.outcome)) : null;
}

export async function sendConsent(goalId: string, stepId: string, partner: string, field: string, granted: boolean): Promise<Scoreboard | null> {
  const a = await post<{ outcome: ApiOutcome }>(`/goals/${enc(goalId)}/consents`, { stepId, partner, field, granted });
  return a ? safe(() => toScoreboard(a.outcome)) : null;
}

export interface BackendHit {
  pending: PendingHit;
  scenarioIdByOption: Record<string, string>;
}

function stepChanges(before: ApiPlan, after: ApiPlan): StepChange[] {
  const old = new Map(before.steps.map((s) => [s.id, s]));
  const out: StepChange[] = [];
  for (const s of after.steps) {
    const o = old.get(s.id);
    if (!o) out.push({ stepId: s.id, note: "Added to the plan" });
    else if (o.display !== s.display || o.status !== s.status || o.provider.sourceRow !== s.provider.sourceRow) {
      const note =
        o.provider.sourceRow !== s.provider.sourceRow
          ? `Switched to ${s.provider.provider}`
          : s.display === "HIDDEN" || s.status === "paused" || s.display === "WAIT"
            ? "Postponed"
            : `Now ${s.display === "SHOW_STEP" ? "in the plan" : s.display.toLowerCase().replace(/_/g, " ")}`;
      out.push({ stepId: s.id, note });
    }
  }
  for (const s of before.steps) if (!after.steps.some((x) => x.id === s.id)) out.push({ stepId: s.id, note: "Dropped for now" });
  return out;
}

function toHit(preset: Preset, r: PipelineLike): BackendHit | null {
  const impact = r.impacts[0];
  const plan = r.plans.find((p) => p.goalId === impact?.goalId);
  if (!impact || !plan) return null;
  const d = r.disruptions.find((x) => x.code === impact.disruption);
  // Only the scenarios of the latest plan version (Kate's current choice, else the ids carrying ":v<version>:"):
  // a replayed surprise can leave older versions' scenarios in the pipeline, and choosing one of those is a 404.
  const current = new Set(r.kate?.kind === "scenario_choice" ? r.kate.refs.scenarioIds ?? [] : []);
  const scenarios = r.scenarios.filter(
    (s) => s.goalId === impact.goalId && (current.size > 0 ? current.has(s.id) : s.id.includes(`:v${plan.version}:`)),
  );
  const kate = r.kate?.kind === "scenario_choice" ? r.kate.text : "";
  const [title, ...rest] = kate.split(/(?<=[.!?])\s+/);

  const before = toOutcomePlan({ ...plan, checks: plan.checks }, r.asOf);
  const hit = toOutcomePlan(plan, r.asOf, impact.broken);
  const brokenKeys = new Set(impact.broken.map((c) => ({ budget: "cost", maxMonthlyPayment: "monthly", deadline: "finish", ownFunds: "buffer" })[c.constraint as string]));
  const hitChecks = toChecks(hit);

  const best = scenarios.reduce((m, s, i) => (s.score > scenarios[m].score ? i : m), 0);
  const scenarioIdByOption: Record<string, string> = {};
  const options: EvaluatedOption[] = scenarios.map((s, i) => {
    const id = `option-${i + 1}`;
    scenarioIdByOption[id] = s.id;
    const result = toOutcomePlan(s.plan, r.asOf);
    const checks = toChecks(result);
    return {
      id,
      label: s.label,
      strategy: STRATEGY[s.strategies[0]] ?? "keep",
      tradeoff: s.tradeoffs.join(" · "),
      delta: {},
      changes: stepChanges(plan, s.plan),
      result,
      checks,
      available: true,
      feasible: !s.plan.atRisk,
      health: health(checks),
      score: s.score,
      recommended: i === best,
    };
  });

  return {
    scenarioIdByOption,
    pending: {
      disruption: {
        id: preset,
        month: d ? monthsBetween(r.asOf, d.at) : 0,
        kind: KIND[impact.disruption] ?? "cashflow",
        title: title || PRESET_TITLE[preset],
        detail: rest.join(" ") || impact.broken.map((c) => c.message).join(" "),
        source: preset === "income_drop" ? "KBC" : "Impact us today",
        delta: {},
        affects: [...impact.affectedStepIds],
        options,
      },
      hit,
      broken: hitChecks.filter((c) => brokenKeys.has(c.key)),
      healthBefore: health(toChecks(before)),
      healthHit: health(hitChecks),
      options,
    },
  };
}

/** Inject a demo disruption, then read the impact and the scenarios for the goal. */
export async function injectDisruption(slug: Slug, preset: Preset): Promise<BackendHit | null> {
  if (!(await post(`/customers/${slug}/events`, { preset }))) return null;
  const r = await call<PipelineLike>(`/customers/${slug}/pipeline`);
  return r ? safe(() => toHit(preset, r)) : null;
}

export async function chooseScenario(goalId: string, scenarioId: string): Promise<{ journey: Journey; board: Scoreboard; plan: OutcomePlan } | null> {
  const a = await post<GoalAnswer>(`/goals/${enc(goalId)}/scenarios/${enc(scenarioId)}/choose`);
  return a ? safe(() => ({ journey: toJourney(a.plan, a.goal), board: toScoreboard(a.outcome), plan: toOutcomePlan(a.plan, a.goal.createdAt) })) : null;
}

function safe<T>(fn: () => T | null): T | null {
  try {
    return fn();
  } catch {
    return null;
  }
}

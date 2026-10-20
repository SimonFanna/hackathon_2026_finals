// T7 — the pluggable pipeline stages owned by other tasks. Each one is a TEMPORARY stand-in until the real
// module lands on main; swap the import, the signatures are the contract ones (backend/T1, T2, T8).
//   T1 toEvents / extractSignals / buildContext  → engine/events.ts, signals.ts, context.ts
//   T2 model                                     → engine/model.ts (momentModel); without it T3 uses moment_rules
//   T8 kateForDecision / kateForScenarios        → engine/kate/messages.ts
import type { MomentModel } from "./engine/moments";
import type {
  ActiveMoment,
  CustomerFacts,
  Decision,
  DisruptionType,
  Event,
  Impact,
  IntentDef,
  KateMessage,
  PersistentContext,
  Scenario,
  Signal,
  SignalRule,
} from "./types";

export interface Engine {
  toEvents(facts: CustomerFacts): Event[];
  extractSignals(events: Event[], rules: SignalRule[], asOf: string): Signal[];
  buildContext(facts: CustomerFacts, signals: Signal[]): PersistentContext;
  model?: MomentModel;
  kateForDecision(d: Decision, intent: IntentDef, ctx: PersistentContext, moment: ActiveMoment, asOf: string): KateMessage | null;
  kateForScenarios(impact: Impact, scenarios: Scenario[], ctx: PersistentContext, dt: DisruptionType): KateMessage;
}

// ---------- T1 stand-ins (spec: backend/T1-signals-context.md) ----------

function toEvents(facts: CustomerFacts): Event[] {
  const id = facts.customer.id;
  return [
    ...facts.appEvents.map((e): Event => ({ id: `app:${e.id}`, customerId: id, at: e.occurredAt, source: "app", kind: e.eventType, sourceRow: e.sourceRow ?? undefined, detail: e.detail })),
    ...facts.transactions.map((t): Event => ({ id: `tx:${t.id}`, customerId: id, at: t.bookedOn, source: "transaction", kind: `tx:${t.category}`, detail: { amount: t.amount, counterparty: t.counterparty } })),
    ...facts.injectedEvents,
  ];
}

const yearsBetween = (from: string, to: string) => {
  const a = new Date(from);
  const b = new Date(to);
  return b.getUTCFullYear() - a.getUTCFullYear() - (b.getUTCMonth() < a.getUTCMonth() || (b.getUTCMonth() === a.getUTCMonth() && b.getUTCDate() < a.getUTCDate()) ? 1 : 0);
};
const monthsBetween = (from: string, to: string) => {
  const a = new Date(from);
  const b = new Date(to);
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + b.getUTCMonth() - a.getUTCMonth();
};

function buildContext(facts: CustomerFacts, signals: Signal[]): PersistentContext {
  const income = facts.employment.monthlyNetIncome;
  const active = facts.loans.filter((l) => l.status === "active");
  const monthlyDebt = active.reduce((n, l) => n + l.monthlyPayment, 0);
  const debtRatio = income > 0 ? monthlyDebt / income : 0;
  const savings = facts.accounts.filter((a) => a.kind === "savings" || a.kind === "term_deposit").reduce((n, a) => n + a.balance, 0);
  const current = facts.accounts.filter((a) => a.kind === "current").reduce((n, a) => n + a.balance, 0);
  const youngest = [...facts.children].sort((a, b) => b.birthDate.localeCompare(a.birthDate))[0];
  const pressure =
    debtRatio > 0.45 || signals.some((s) => s.code === "INCOME_DROP") || current < 0.5 * income ? "high" : debtRatio > 0.33 ? "medium" : "low";
  return {
    customerId: facts.customer.id,
    firstName: facts.customer.firstName,
    age: yearsBetween(facts.customer.birthDate, facts.asOf),
    region: facts.customer.region,
    language: facts.customer.language,
    household: ["married", "cohabiting"].includes(facts.customer.maritalStatus) ? "couple" : "single",
    children: facts.children.length,
    youngestChildAgeMonths: youngest ? monthsBetween(youngest.birthDate, facts.asOf) : null,
    employment: facts.employment.status,
    monthlyIncome: income,
    housing: facts.housing.status,
    monthlyRent: facts.housing.monthlyRent ?? 0,
    savings,
    monthlyDebt,
    debtRatio,
    heldSourceRows: [
      ...new Set([
        ...facts.holdings.filter((h) => h.status === "active").map((h) => h.sourceRow),
        ...active.flatMap((l) => (l.sourceRow === null ? [] : [l.sourceRow])),
        ...facts.accounts.flatMap((a) => (a.sourceRow === null ? [] : [a.sourceRow])),
      ]),
    ].sort((a, b) => a - b),
    properties: facts.properties.map((p) => ({ kind: p.kind, buildYear: p.buildYear, epc: p.epcLabel, value: p.estimatedValue })),
    cashflowPressure: pressure,
  };
}

// ---------- T8 stand-ins (spec: backend/T8-kate.md) ----------

const REPLY_ACTIONS = [
  { id: "yes", label: "Yes, show me" },
  { id: "not_now", label: "Not now" },
  { id: "no", label: "No thanks" },
];

function kateForDecision(d: Decision, intent: IntentDef, ctx: PersistentContext, moment: ActiveMoment, asOf: string): KateMessage | null {
  if (d.level !== "ASK" && d.level !== "SUGGEST") return null;
  const evidence = moment.contributions.slice(0, 2).map((c) => c.label).join(" and ");
  const text = (d.level === "ASK" ? intent.kateAsk : intent.kateSuggest).replaceAll("{firstName}", ctx.firstName).replaceAll("{evidence}", evidence);
  return { id: `kate-${ctx.customerId}-${d.intent}-${asOf}`, customerId: ctx.customerId, at: asOf, kind: "proactive", text, actions: REPLY_ACTIONS, refs: { intent: d.intent } };
}

function kateForScenarios(impact: Impact, scenarios: Scenario[], ctx: PersistentContext, dt: DisruptionType): KateMessage {
  const options = scenarios.map((s, i) => `${String.fromCharCode(65 + i)}: ${s.label}`).join(" · ");
  return {
    id: `kate-${ctx.customerId}-${impact.goalId}-${impact.disruption}`,
    customerId: ctx.customerId,
    at: scenarios[0]?.plan.createdAt ?? "",
    kind: "scenario_choice",
    text: `${dt.kateTemplate.replaceAll("{firstName}", ctx.firstName)} ${options}`.trim(),
    actions: [...scenarios.map((s, i) => ({ id: `choose:${s.id}`, label: `Choose ${String.fromCharCode(65 + i)}` })), { id: "advisor", label: "Talk to an advisor" }],
    refs: { goalId: impact.goalId, scenarioIds: scenarios.map((s) => s.id) },
  };
}

export const engine: Engine = {
  toEvents,
  extractSignals: () => [], // T1 lands → extractSignals from engine/signals.ts
  buildContext,
  model: undefined, // T2 lands → momentModel from engine/model.ts
  kateForDecision,
  kateForScenarios,
};

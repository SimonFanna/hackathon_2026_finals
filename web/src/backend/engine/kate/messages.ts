// Kate's templated messages. Pure and offline: the engine decides, these functions only phrase.
import type {
  ActiveMoment, Decision, DisruptionType, Goal, GoalConstraints, Impact, IntentDef, KateMessage,
  PersistentContext, Plan, Priority, RuleSet, Scenario, Signal, SignalCode,
} from "../../types";
import type { KateDeps } from "./deps";
import { dependants, eur, fill, GOAL_NOUN, joinAnd, keyTradeoffs, stepLabel } from "./text";

/** Friendly words for a signal, used when a moment has no ML contributions to quote. */
const SIGNAL_WORDS: Partial<Record<SignalCode, string>> = {
  MORTGAGE_SIMULATION: "your home-loan simulations",
  HOUSING_BUDGET_VIEW: "your housing budget check",
  PROPERTY_VALUATION_VIEW: "the property valuations you looked at",
  HOME_SEARCH_IN_APP: "your home search in the app",
  RENOVATION_VIEW: "the renovation cost pages you opened",
  HOME_LOAN_KATE_QUESTION: "your question about home loans",
  HOME_LOAN_APPLICATION: "the home-loan application you started",
  SAVING_FOR_DOWN_PAYMENT: "your growing monthly savings",
  FREELANCE_INCOME: "your first freelance income",
  START_IT_VIEW: "the Start it @KBC pages you opened",
  BUSINESS_ACCOUNT_VIEW: "the business account you looked at",
  BUSINESS_KATE_QUESTION: "your question about starting a business",
  BABY_SPENDING: "your recent baby purchases",
  EV_PAGE_VIEW: "the electric car pages you opened",
  EV_LOAN_SIMULATION: "your car-loan simulation",
  PENSION_VIEW: "the pension pages you opened",
};

function lowerFirst(s: string): string {
  return /^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s;
}

/** The 2 strongest reasons, in friendly words (contribution labels, else signal words). */
export function evidenceWords(moment: ActiveMoment): string {
  const fromContributions = [...moment.contributions]
    .filter((c) => c.value * c.weight > 0)
    .sort((a, b) => b.value * b.weight - a.value * a.weight)
    .slice(0, 2)
    .map((c) => lowerFirst(c.label));
  if (fromContributions.length) return joinAnd(fromContributions);
  const fromSignals = moment.evidence.map((code) => SIGNAL_WORDS[code as SignalCode]).filter((w): w is string => !!w);
  return joinAnd(fromSignals.slice(0, 2)) || "your recent activity";
}

/** ⑤ → ⑥ Proactive notification. `null` unless the gate says ASK or SUGGEST. */
export function kateForDecision(
  d: Decision, intent: IntentDef, ctx: PersistentContext, moment: ActiveMoment, asOf: string,
): KateMessage | null {
  if (d.level !== "ASK" && d.level !== "SUGGEST") return null;
  const template = d.level === "ASK" ? intent.kateAsk : intent.kateSuggest;
  return {
    id: `kate:${ctx.customerId}:${intent.code}:${asOf}`,
    customerId: ctx.customerId,
    at: asOf,
    kind: "proactive",
    text: fill(template, { firstName: ctx.firstName, evidence: evidenceWords(moment) }),
    actions: [
      { id: "yes", label: d.level === "ASK" ? "Yes, help me plan" : "Show me the plan" },
      { id: "not_now", label: "Not now" },
      { id: "no", label: "No, thanks" },
    ],
    refs: { intent: intent.code },
  };
}

export type SetupQuestion = {
  id: keyof GoalConstraints | "priorities" | "property";
  text: string;
  kind: "number" | "date" | "choice";
  default: unknown;
  options?: string[];
};

const PRIORITY_OPTIONS: Priority[] = ["affordability", "energy_efficiency", "speed", "security"];

function addMonths(isoDate: string, months: number): string {
  const d = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

/**
 * ⑥ Goal set-up: 2–4 short questions, pre-filled so the customer mostly taps "OK".
 * Defaults come from T5 `affordability()` (injected) and the largest simulated loan amount.
 */
export function goalSetup(
  intent: IntentDef, ctx: PersistentContext, rules: RuleSet,
  opts: { signals?: Signal[]; asOf?: string; affordability?: KateDeps["affordability"] } = {},
): { goalType: IntentDef["goalType"]; questions: SetupQuestion[] } {
  const goalType = intent.goalType;
  const aff = opts.affordability?.(ctx);
  const questions: SetupQuestion[] = [];

  if (goalType === "BUY_AND_PREPARE_HOME") {
    const simulated = Math.max(0, ...(opts.signals ?? []).filter((s) => s.code === "MORTGAGE_SIMULATION").map((s) => s.value ?? 0));
    const capacity = aff ? aff.maxPrincipal + aff.ownFunds : null;
    const raw = capacity !== null && simulated > 0 ? Math.min(simulated, capacity) : simulated || capacity;
    // Round down to €5k so the suggestion never exceeds what she can afford.
    const budget = raw ? Math.floor(raw / 5000) * 5000 : null;
    questions.push({
      id: "budget",
      text: budget
        ? `What's your total budget, renovation included? Based on ${simulated ? "your simulations" : "your income and savings"}, I'd suggest about ${eur(budget)}.`
        : "What's your total budget, renovation included?",
      kind: "number",
      default: budget,
    });
    questions.push({
      id: "maxMonthlyPayment",
      text: aff
        ? `What's the most you'd like to repay each month? ${eur(aff.maxMonthlyPayment)} keeps you within a healthy share of your income.`
        : "What's the most you'd like to repay each month?",
      kind: "number",
      default: aff?.maxMonthlyPayment ?? null,
    });
    questions.push({
      id: "priorities",
      text: "What matters most to you?",
      kind: "choice",
      default: ctx.properties.some((p) => p.epc && "DEF".includes(p.epc)) ? "energy_efficiency" : "affordability",
      options: PRIORITY_OPTIONS.slice(0, 3),
    });
    questions.push({
      id: "property",
      text: "Do you already have a home in mind? If so, what's its EPC label?",
      kind: "choice",
      default: ctx.properties[0]?.epc ?? "Not yet",
      options: ["Not yet", "A", "B", "C", "D", "E", "F"],
    });
  } else {
    questions.push({
      id: "deadline",
      text: goalType === "START_BUSINESS" ? "When would you like to start your business?" : "When would you like to get there?",
      kind: "date",
      default: opts.asOf ? addMonths(opts.asOf, 3) : null,
    });
    if (aff) {
      questions.push({
        id: "ownFunds",
        text: `How much of your savings can go into this? Up to ${eur(aff.ownFunds)} looks available.`,
        kind: "number",
        default: aff.ownFunds,
      });
    }
    questions.push({
      id: "priorities",
      text: "What matters most to you?",
      kind: "choice",
      default: goalType === "START_BUSINESS" ? "security" : "affordability",
      options: goalType === "START_BUSINESS" ? ["security", "speed", "affordability"] : PRIORITY_OPTIONS.slice(0, 3),
    });
  }
  // termYears is not asked: it stays at the template default, and changing it is a what-if.
  return { goalType, questions };
}

/** Difference between the first broken check's actual value and its limit, e.g. "€6,000". */
function brokenDelta(impact: Impact): string | undefined {
  const c = impact.broken[0];
  if (!c || typeof c.actual !== "number" || typeof c.limit !== "number") return undefined;
  return eur(Math.abs(c.actual - c.limit));
}

/** ⑪ Scenario choice after a disruption: the T6 template + the 2 scenarios + choose / advisor actions. */
export function kateForScenarios(
  impact: Impact, scenarios: Scenario[], ctx: PersistentContext, dt: DisruptionType, goal?: Goal,
): KateMessage {
  const shown = scenarios.slice(0, 2);
  const letters = ["A", "B", "C"];
  const intro = fill(dt.kateTemplate, {
    firstName: ctx.firstName,
    goal: goal ? GOAL_NOUN[goal.type] : "current",
    delta: brokenDelta(impact) ?? "more",
  });
  const lines = shown.map((s, i) => {
    const parts = [
      s.monthlyPayment !== null ? `about ${eur(s.monthlyPayment)}/month` : null,
      s.deadline ? `ready by ${s.deadline}` : null,
    ].filter(Boolean);
    const key = keyTradeoffs(s);
    const trade = key.length ? ` Trade-off: ${key.join("; ")}.` : "";
    return `${letters[i]}. ${s.label}${parts.length ? `: ${parts.join(", ")}` : ""}.${trade}`;
  });
  const outro = "While you decide, I've paused the non-essential offers in your plan. Figures are estimates, not a loan offer.";
  return {
    id: `kate:${ctx.customerId}:${impact.disruption}:${impact.goalId}:${shown.map((s) => s.id).join("+")}`,
    customerId: ctx.customerId,
    at: shown[0]?.plan.createdAt ?? "",
    kind: "scenario_choice",
    text: [intro, ...lines, outro].join("\n"),
    actions: [
      ...shown.map((s, i) => ({ id: `choose:${s.id}`, label: `Choose ${letters[i]}` })),
      { id: "advisor", label: "Talk to an advisor" },
    ],
    refs: { goalId: impact.goalId, scenarioIds: shown.map((s) => s.id) },
  };
}

/** Deterministic "why this step / why this order", from the plan's own dependencies. */
export function kateWhy(plan: Plan, stepId: string, ctx: PersistentContext, rules?: Pick<RuleSet, "capabilities">): string {
  const step = plan.steps.find((s) => s.id === stepId);
  if (!step) return "I can't find that step in your plan.";
  const label = stepLabel(step, rules);
  const out: string[] = [];
  const why = fill(step.why, {
    firstName: ctx.firstName,
    epc: ctx.properties[0]?.epc ?? undefined,
    buildYear: ctx.properties[0]?.buildYear,
  });
  out.push(`${label}: ${why}`);
  if (step.display === "ALREADY_COVERED") out.push("You already have this with KBC, so there's nothing to do here.");
  if (step.display === "WAIT") out.push("It's on hold for now, so it doesn't add pressure on your budget.");
  const before = plan.steps.filter((s) => step.dependsOn.includes(s.id)).map((s) => stepLabel(s, rules));
  if (before.length) out.push(`It comes after ${joinAnd(before)}, because it needs their result.`);
  const after = dependants(plan, step.id).map((s) => stepLabel(s, rules));
  if (after.length) out.push(`${joinAnd(after)} can only start once it's done.`);
  if (step.provider.isPartner) {
    out.push(`${step.provider.provider} handles it, and only receives the data you approve.`);
  } else if (step.display !== "ALREADY_COVERED") {
    out.push("KBC handles it directly.");
  }
  return out.join(" ");
}

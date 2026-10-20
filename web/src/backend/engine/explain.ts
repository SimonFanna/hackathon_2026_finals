import type { ActiveMoment, Decision, Signal, SignalCode } from "../types";

// Plain-English "why" sentences. The engine decides; these only phrase what it saw.

export function formatEur(v: number): string {
  if (Math.abs(v) >= 10000) return `€${Math.round(v / 1000)}k`;
  return `€${String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

const times = (n: number) => (n > 1 ? ` (${n} times)` : "");
const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;
const upTo = (v?: number) => (v ? ` (up to ${formatEur(v)})` : "");

type Phrase = (count: number, value?: number) => string;

/** What we saw, in the customer's words. */
const SEEN: Partial<Record<SignalCode, Phrase>> = {
  MORTGAGE_SIMULATION: (n, v) => `You ran ${plural(n, "home-loan simulation")}${upTo(v)}`,
  HOUSING_BUDGET_VIEW: (n) => `You checked your housing budget${times(n)}`,
  PROPERTY_VALUATION_VIEW: (n) => `You looked up property values${times(n)}`,
  HOME_SEARCH_IN_APP: (n) => `You searched for a home in the KBC app${times(n)}`,
  RENOVATION_VIEW: (n) => `You checked renovation costs and grants${times(n)}`,
  HOME_LOAN_KATE_QUESTION: () => "You asked Kate about home loans",
  HOME_LOAN_APPLICATION: () => "You started a home-loan application",
  SAVING_FOR_DOWN_PAYMENT: () => "You've been putting more aside each month",
  NOTARY_PAYMENT: () => "You made a payment to a notary",
  HOME_LOAN_VIEW: (n) => `You looked at home loans${times(n)}`,
  FREELANCE_INCOME: (n, v) => `You received ${plural(n, "freelance payment")}${v ? ` (about ${formatEur(v)}/month)` : ""}`,
  SALARY_STOPPED: () => "Your salary payments stopped",
  START_IT_VIEW: (n) => `You explored Start it @KBC and start-up advice${times(n)}`,
  BUSINESS_ACCOUNT_VIEW: (n) => `You looked at business accounts${times(n)}`,
  BUSINESS_KATE_QUESTION: (n) => `You asked Kate ${plural(n, "business question")}`,
  ACCOUNTING_TOOL_PAYMENT: () => "You pay for accounting software",
  EQUIPMENT_PURCHASE: () => "You bought work equipment",
  BUSINESS_TOOLS_VIEW: (n) => `You looked at invoicing and payment tools${times(n)}`,
  BUSINESS_PROTECTION_VIEW: (n) => `You looked at cover for the self-employed${times(n)}`,
  BABY_SPENDING: () => "You've been buying baby items",
  CHILD_BORN: () => "Your family recently grew",
  CHILDCARE_PAYMENT: () => "You pay for childcare",
  FAMILY_PROTECTION_VIEW: (n) => `You looked at family insurance${times(n)}`,
  FAMILY_KATE_QUESTION: (n) => `You asked Kate ${plural(n, "question")} about your family's cover`,
  EV_PAGE_VIEW: (n) => `You looked at electric cars${times(n)}`,
  EV_LOAN_SIMULATION: (n, v) => `You ran ${plural(n, "electric-car loan simulation")}${upTo(v)}`,
  CAR_LOAN_ENDING: () => "Your car loan ends soon",
  EV_CHARGING: () => "You pay for EV charging",
  EV_KATE_QUESTION: () => "You asked Kate about electric cars",
  PENSION_VIEW: (n) => `You looked at pension savings${times(n)}`,
  RETIREMENT_KATE_QUESTION: () => "You asked Kate about your pension",
  ESTATE_PLANNING_VIEW: (n) => `You looked at estate planning${times(n)}`,
  LUMP_SUM_INVESTMENT: (_n, v) => `You made a large investment${v ? ` (${formatEur(v)})` : ""}`,
  INCOME_DROP: () => "Your income dropped",
  BENEFITS_INFLOW: () => "You started receiving benefit payments",
  LARGE_UNEXPECTED_EXPENSE: (_n, v) => `You had a large unexpected expense${v ? ` (${formatEur(v)})` : ""}`,
  COST_OVERRUN: () => "A quote came in above the estimate",
  PARTNER_DELAY: () => "A partner reported a delay",
  RATE_CHANGE: () => "Interest rates changed",
};

/** What is missing, for "what would change this". */
const MISSING: Partial<Record<SignalCode, string>> = {
  MORTGAGE_SIMULATION: "a home-loan simulation",
  HOME_LOAN_APPLICATION: "a home-loan application",
  NOTARY_PAYMENT: "a notary payment",
  HOME_LOAN_KATE_QUESTION: "a question to Kate about home loans",
  HOUSING_BUDGET_VIEW: "a housing-budget check",
  PROPERTY_VALUATION_VIEW: "a property valuation",
  FREELANCE_INCOME: "freelance income",
  START_IT_VIEW: "a visit to Start it @KBC",
  BUSINESS_KATE_QUESTION: "a business question to Kate",
  CHILD_BORN: "a birth in the family",
  EV_LOAN_SIMULATION: "an electric-car loan simulation",
  EV_PAGE_VIEW: "a look at electric cars",
  PENSION_VIEW: "a look at pension savings",
};

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** "You ran 4 home-loan simulations (up to €476k)". Falls back to the signal-rule label, then the code. */
export function describeSignal(s: Pick<Signal, "code" | "count" | "value">, fallbackLabel?: string): string {
  const phrase = SEEN[s.code];
  if (phrase) return phrase(Math.max(1, s.count), s.value);
  return fallbackLabel ?? s.code.toLowerCase().replace(/_/g, " ");
}

export function describeMissing(code: SignalCode): string {
  return MISSING[code] ?? lowerFirst(SEEN[code]?.(1) ?? code.toLowerCase().replace(/_/g, " "));
}

export const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Top reasons behind a moment, strongest first (from the model / rule contributions). */
export function explainMoment(m: ActiveMoment, max = 4): string[] {
  const lines = [...m.contributions]
    .filter((c) => c.value * c.weight > 0)
    .sort((a, b) => b.value * b.weight - a.value * a.weight)
    .map((c) => c.label);
  const unique = [...new Set(lines)].slice(0, max);
  if (unique.length > 0) return unique;
  return m.evidence.slice(0, max).map((code) => describeSignal({ code: code as SignalCode, count: 1 }));
}

const DEFAULT_WHY_NOT: Record<string, string> = {
  no_signal: "We haven't seen anything suggesting this right now.",
  below_threshold: "The signals are too weak to bother you.",
  goal_in_progress: "You're already working on this with Kate.",
  declined: "You told us this isn't for you.",
  not_relevant: "You told us this isn't relevant to you.",
  snoozed: "You asked us to come back to this later.",
  cashflow_pressure: "Your budget is under pressure, so we won't push anything new right now.",
  one_at_a_time: "Kate is already talking to you about something else. One thing at a time.",
};

/** "Why not?" for NO_ACTION / WAIT decisions. Empty for ASK / SUGGEST. */
export function explainNoAction(d: Decision): string[] {
  if (d.level === "ASK" || d.level === "SUGGEST") return [];
  if (d.explanation.length > 0) return d.explanation;
  return [DEFAULT_WHY_NOT[d.reason] ?? "Nothing to suggest right now."];
}

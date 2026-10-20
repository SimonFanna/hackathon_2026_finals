import type { CapabilityCode, GoalType, Plan, PlanStep, RuleSet, Scenario } from "../../types";

/** "€250,000". Kate always rounds: every figure she quotes is an estimate. */
export function eur(n: number): string {
  return `€${Math.round(n).toLocaleString("en-US")}`;
}

/** Replace `{key}` placeholders; unknown keys are left as-is so a missing value is visible, not silent. */
export function fill(template: string, values: Record<string, string | number | undefined>): string {
  return template.replace(/\{(\w+)\}/g, (all, key: string) => {
    const v = values[key];
    return v === undefined ? all : String(v);
  });
}

/** "a", "a and b", "a, b and c". */
export function joinAnd(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** Short noun for a goal, used in "your {goal} plan". */
export const GOAL_NOUN: Record<GoalType, string> = {
  BUY_AND_PREPARE_HOME: "home",
  START_BUSINESS: "business",
  WELCOME_BABY: "new baby",
  SWITCH_TO_EV: "electric car",
  PREPARE_RETIREMENT: "retirement",
};

/** Words a customer uses for each capability. Used to find the step a question is about. */
export const CAPABILITY_KEYWORDS: Partial<Record<CapabilityCode, string[]>> = {
  estimate_budget: ["budget"],
  find_property: ["search", "find a home", "find a house", "immoscoop"],
  value_property: ["valuation", "value", "asking price"],
  inspect_property: ["inspection", "inspect", "epc", "certificate"],
  finance_property: ["home loan", "mortgage", "loan"],
  bridge_finance: ["bridging", "bridge"],
  estimate_renovation: ["renovation cost", "estimate the works", "renovation estimate"],
  identify_grants: ["grant", "premium", "subsid"],
  quote_insulation: ["insulation", "insulate", "roof"],
  quote_heating: ["heat pump", "heating", "boiler"],
  quote_windows: ["window", "glazing"],
  evaluate_solar: ["solar", "panel", "battery"],
  finance_renovation: ["energy loan", "renovation loan"],
  insure_property: ["home insurance", "fire insurance"],
  insure_loan: ["outstanding balance", "life insurance", "loan insurance"],
  get_startup_support: ["start it", "coaching", "start-up support"],
  get_tax_legal_advice: ["legal", "tax", "legal form"],
  open_business_account: ["business account"],
  set_up_invoicing: ["invoic", "billit"],
  accept_payments: ["payment terminal", "bancontact", "accept payments"],
  connect_accountant: ["accountant"],
  insure_liability: ["liability"],
  insure_income: ["guaranteed income", "income insurance"],
  build_pension: ["pension"],
};

/** Human label of a step: the capability label from the registry, else the catalogue item name. */
export function stepLabel(step: PlanStep, rules?: Pick<RuleSet, "capabilities">): string {
  return rules?.capabilities.find((c) => c.code === step.capability)?.label ?? step.provider.itemName;
}

/** Steps (or providers) named in a question: by partner name first, then by keyword. Most specific match wins. */
export function findStepsInText(text: string, plan: Plan): PlanStep[] {
  const q = text.toLowerCase();
  const byProvider = plan.steps.filter((s) => s.provider.isPartner && q.includes(s.provider.provider.toLowerCase()));
  const byKeyword: { step: PlanStep; len: number; at: number }[] = [];
  for (const s of plan.steps) {
    for (const kw of CAPABILITY_KEYWORDS[s.capability] ?? []) {
      const at = q.indexOf(kw);
      if (at >= 0) byKeyword.push({ step: s, len: kw.length, at });
    }
  }
  // A longer keyword ("energy loan") beats a shorter one it contains ("loan").
  const kept = byKeyword.filter(
    (m) => !byKeyword.some((o) => o !== m && o.len > m.len && o.at <= m.at && o.at + o.len >= m.at + m.len),
  );
  kept.sort((a, b) => a.at - b.at);
  const out: PlanStep[] = [...byProvider];
  for (const m of kept) if (!out.includes(m.step)) out.push(m.step);
  return out;
}

/** All step ids `stepId` depends on, directly or transitively. */
export function ancestors(plan: Plan, stepId: string): Set<string> {
  const byId = new Map(plan.steps.map((s) => [s.id, s]));
  const seen = new Set<string>();
  const stack = [...(byId.get(stepId)?.dependsOn ?? [])];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...(byId.get(id)?.dependsOn ?? []));
  }
  return seen;
}

/** Steps that cannot start before `stepId` is done (direct dependants). */
export function dependants(plan: Plan, stepId: string): PlanStep[] {
  return plan.steps.filter((s) => s.dependsOn.includes(stepId));
}

/** Monthly payment the current plan implies: the payment check, else the sum of step estimates. */
export function planMonthlyPayment(plan: Plan): number | null {
  const check = plan.checks.find((c) => c.constraint === "maxMonthlyPayment");
  if (check && typeof check.actual === "number") return check.actual;
  const sum = plan.steps.reduce((acc, s) => acc + (s.estimates.monthlyPayment ?? 0), 0);
  return sum > 0 ? sum : null;
}

const noDot = (t: string) => t.trim().replace(/\.+$/, "");

/** The trade-offs worth saying: not a repeat of a check, of the payment already quoted, or of the "on hold" line. */
export function keyTradeoffs(s: Scenario, max = 2): string[] {
  const checks = new Set(s.plan.checks.map((c) => noDot(c.message)));
  const pay = s.monthlyPayment !== null ? eur(s.monthlyPayment) : null;
  return s.tradeoffs
    .map(noDot)
    .filter((t) => t && !checks.has(t) && !(pay && t.includes(pay)) && !/on hold|paused/i.test(t))
    .slice(0, max);
}

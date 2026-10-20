// T6 fixtures: disruption/strategy rules (same rows as supabase/migrations/20261020122500_disruptions.sql)
// plus disruption signals/events for Sofie. Her goal, plan and income-drop context come from T5.
import type { DisruptionType, Event, ReplanStrategy, RuleSet, Signal } from "../types";
import { ASOF, lucasCtx, sofieCtx, t5Rules } from "./t5-inputs";

export { ASOF, sofieCtx, lucasCtx };

export const disruptionTypes: DisruptionType[] = [
  { code: "INCOME_DROP", signals: ["INCOME_DROP", "BENEFITS_INFLOW"], affects: ["maxMonthlyPayment", "budget"],
    kateTemplate: "{firstName}, your income has changed, and your {goal} plan is now above what you can comfortably repay. I've prepared two options." },
  { code: "COST_OVERRUN", signals: ["COST_OVERRUN"], affects: ["budget"],
    kateTemplate: "{firstName}, a quote came in {delta} above the estimate, so your {goal} plan no longer fits the budget. Here are two ways to absorb it." },
  { code: "PARTNER_DELAY", signals: ["PARTNER_DELAY"], affects: ["deadline"],
    kateTemplate: "{firstName}, one of the partners in your {goal} plan is running late ({delta}). I've prepared two ways to keep you on schedule." },
  { code: "UNEXPECTED_EXPENSE", signals: ["LARGE_UNEXPECTED_EXPENSE"], affects: ["ownFunds"],
    kateTemplate: "{firstName}, a large expense reduced your savings by {delta}. Your {goal} plan needs a small adjustment. Here are two options." },
  { code: "RATE_CHANGE", signals: ["RATE_CHANGE"], affects: ["maxMonthlyPayment"],
    kateTemplate: "{firstName}, interest rates moved ({delta}), which changes your monthly payment. Here are two options to stay comfortable." },
];

export const replanStrategies: ReplanStrategy[] = [
  { code: "REDUCE_SCOPE", appliesTo: ["INCOME_DROP", "COST_OVERRUN", "UNEXPECTED_EXPENSE", "RATE_CHANGE"],
    params: { phaseLater: ["evaluate_solar", "quote_windows"], paymentMargin: 0.95, roundTo: 5000 } },
  { code: "EXTEND_TERM", appliesTo: ["INCOME_DROP", "RATE_CHANGE", "COST_OVERRUN"], params: { maxTermYears: 30 } },
  { code: "SWAP_PROVIDER", appliesTo: ["PARTNER_DELAY", "COST_OVERRUN"], params: {} },
  { code: "REORDER", appliesTo: ["PARTNER_DELAY"], params: {} },
  { code: "ADD_PROTECTION", appliesTo: ["INCOME_DROP"],
    params: { always: ["insure_loan"], selfEmployed: ["insure_income"], combineWith: ["EXTEND_TERM"] } },
  { code: "MAXIMISE_GRANTS", appliesTo: ["COST_OVERRUN", "UNEXPECTED_EXPENSE"], params: { capability: "identify_grants" } },
  { code: "PAUSE", appliesTo: ["INCOME_DROP", "COST_OVERRUN", "PARTNER_DELAY", "UNEXPECTED_EXPENSE", "RATE_CHANGE"], params: { followUpDays: 30 } },
];

export const t6Rules: RuleSet = { ...t5Rules, disruptionTypes, replanStrategies };

/** Sofie's confirmed goal and plan (after decision rules) come from T5, so they always match the planner. */
export { sofieGoal, sofiePlan, sofieCtxIncomeDrop } from "./t5-sofie-plan";

export const AT = "2026-11-15";

export const incomeDropSignals: Signal[] = [
  { code: "BENEFITS_INFLOW", customerId: 1, strength: 0.9, at: AT, count: 1, value: 1800, evidence: ["tx-benefits-1"], isDisruption: true },
];

export const partnerDelayEvent: Event = {
  id: "partner-1", customerId: 1, at: AT, source: "partner", kind: "partner:delayed", sourceRow: 131,
  detail: { capability: "quote_insulation", delayDays: 120 },
};
export const partnerDelaySignals: Signal[] = [
  { code: "PARTNER_DELAY", customerId: 1, strength: 1, at: AT, count: 1, value: 120, evidence: ["partner-1"], isDisruption: true },
];

export const costOverrunEvent: Event = {
  id: "partner-2", customerId: 1, at: AT, source: "partner", kind: "partner:quote", sourceRow: 132,
  detail: { capability: "quote_heating", overrunEur: 9000 },
};
export const costOverrunSignals: Signal[] = [
  { code: "COST_OVERRUN", customerId: 1, strength: 1, at: AT, count: 1, value: 9000, evidence: ["partner-2"], isDisruption: true },
];

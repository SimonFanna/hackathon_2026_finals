/**
 * T3 hand-written inputs, used until T1's `t1-sofie.ts` / `t1-personas.json` land.
 * Signals follow T1's formula (rule strength × (1 − 0.5^count) × decay, half-life ≈ 60 days)
 * on the real Supabase rows of the demo personas, asOf 2026-10-01. Estimates, not T1 output.
 */
import type { PersistentContext, RuleSet, Signal, SignalCode } from "../types";
import { t3IntentRules, t3Intents, t3MomentRules } from "./t3-rules";

export const ASOF = "2026-10-01";

export const t3Rules: RuleSet = {
  signalRules: [], modelWeights: [], momentRules: t3MomentRules, intents: t3Intents, intentRules: t3IntentRules,
  capabilities: [], providers: [], templates: [], decisionRules: [], disruptionTypes: [], replanStrategies: [],
};

const sig = (customerId: number, code: SignalCode, strength: number, at: string, count: number, value?: number, isDisruption = false): Signal =>
  ({ code, customerId, strength, at, count, value, evidence: [`${code.toLowerCase()}-${customerId}`], isDisruption });

const ctx = (c: Partial<PersistentContext> & Pick<PersistentContext, "customerId" | "firstName" | "age">): PersistentContext => ({
  region: "Gent", language: "nl", household: "single", children: 0, youngestChildAgeMonths: null, employment: "employee",
  monthlyIncome: 2500, housing: "tenant", monthlyRent: 1000, savings: 10000, monthlyDebt: 0, debtRatio: 0,
  heldSourceRows: [], properties: [], cashflowPressure: "low", ...c,
});

// Sofie (1): 4 home-loan simulations €243k–€476k, valuations ×3, renovation ×2, budget ×1, Kate home-loan question.
export const sofieCtx = ctx({ customerId: 1, firstName: "Sofie", age: 32, household: "couple", children: 1, youngestChildAgeMonths: 20,
  monthlyIncome: 2619, monthlyRent: 1351, savings: 30935, heldSourceRows: [8, 168] });
export const sofieSignals: Signal[] = [
  sig(1, "MORTGAGE_SIMULATION", 0.33, "2026-09-11", 4, 476000),
  sig(1, "PROPERTY_VALUATION_VIEW", 0.2, "2026-09-25", 3),
  sig(1, "RENOVATION_VIEW", 0.1, "2026-09-26", 2),
  sig(1, "HOUSING_BUDGET_VIEW", 0.1, "2026-09-09", 1),
  sig(1, "HOME_LOAN_KATE_QUESTION", 0.14, "2026-09-24", 1),
  sig(1, "BABY_SPENDING", 0.35, "2026-09-20", 10),
];

// Lucas (2): Start it @KBC + tax advice ×12, Business PRO ×2, 3 business Kate questions, 5 freelance payments, accounting software.
export const lucasCtx = ctx({ customerId: 2, firstName: "Lucas", age: 29, region: "Leuven", monthlyIncome: 2733, monthlyRent: 1159, savings: 11658 });
export const lucasSignals: Signal[] = [
  sig(2, "START_IT_VIEW", 0.26, "2026-09-17", 12),
  sig(2, "BUSINESS_KATE_QUESTION", 0.24, "2026-09-29", 3),
  sig(2, "FREELANCE_INCOME", 0.35, "2026-09-25", 5, 1200),
  sig(2, "BUSINESS_ACCOUNT_VIEW", 0.11, "2026-07-31", 2),
  sig(2, "ACCOUNTING_TOOL_PAYMENT", 0.24, "2026-09-05", 2),
  sig(2, "EQUIPMENT_PURCHASE", 0.1, "2026-08-14", 3),
];

// Els (5): owner, EPC E, debt ratio 0.55 → cashflow pressure high. Already drives an EV (charging), 2 pension views.
export const elsCtx = ctx({ customerId: 5, firstName: "Els", age: 44, region: "Brugge", household: "couple", children: 2,
  monthlyIncome: 3829, housing: "owner", monthlyRent: 0, savings: 36310, monthlyDebt: 2116, debtRatio: 0.55,
  properties: [{ kind: "house", buildYear: 1917, epc: "E", value: 420000 }], cashflowPressure: "high" });
export const elsSignals: Signal[] = [
  sig(5, "EV_CHARGING", 0.2, "2026-09-28", 25),
  sig(5, "PENSION_VIEW", 0.12, "2026-08-29", 2),
];

// Thomas (6): hard negative — tenant, 27, €58k savings, home searches ×3 + budget ×1 + home-loan pages, but no simulation.
export const thomasCtx = ctx({ customerId: 6, firstName: "Thomas", age: 27, region: "Kortrijk", monthlyIncome: 2361, monthlyRent: 1006,
  savings: 58177, monthlyDebt: 537, debtRatio: 0.23 });
export const thomasSignals: Signal[] = [
  sig(6, "HOME_SEARCH_IN_APP", 0.17, "2026-09-27", 3),
  sig(6, "HOUSING_BUDGET_VIEW", 0.08, "2026-08-24", 1),
];

// Nadia (3): new parent — 11 baby purchases, child born. Pieter (4): EV loan simulations up to €38k, 49 y/o, pension ×9.
export const nadiaCtx = ctx({ customerId: 3, firstName: "Nadia", age: 31, household: "couple", children: 1, youngestChildAgeMonths: 3,
  monthlyIncome: 2688, housing: "owner", monthlyRent: 0, savings: 51530, monthlyDebt: 1678, debtRatio: 0.62,
  properties: [{ kind: "house", buildYear: 1962, epc: "D", value: 300000 }], cashflowPressure: "high" });
export const nadiaSignals: Signal[] = [
  sig(3, "CHILD_BORN", 0.6, "2026-07-01", 1),
  sig(3, "BABY_SPENDING", 0.38, "2026-09-22", 11),
];
export const pieterCtx = ctx({ customerId: 4, firstName: "Pieter", age: 49, household: "couple", children: 2, monthlyIncome: 2887,
  housing: "owner", monthlyRent: 0, savings: 50018, monthlyDebt: 698, debtRatio: 0.24,
  properties: [{ kind: "house", buildYear: 1946, epc: "E", value: 350000 }] });
export const pieterSignals: Signal[] = [
  sig(4, "EV_LOAN_SIMULATION", 0.3, "2026-09-24", 2, 38000),
  sig(4, "EV_PAGE_VIEW", 0.21, "2026-09-23", 4),
  sig(4, "PENSION_VIEW", 0.24, "2026-09-24", 9),
];

/** Sofie after the injected income drop (salary missing + benefits). */
export const sofieIncomeDropSignals: Signal[] = [
  ...sofieSignals,
  sig(1, "INCOME_DROP", 0.9, "2026-09-30", 1, undefined, true),
  sig(1, "BENEFITS_INFLOW", 0.5, "2026-09-30", 1, undefined, true),
];
export const sofieIncomeDropCtx: PersistentContext = { ...sofieCtx, monthlyIncome: 1650, cashflowPressure: "high" };

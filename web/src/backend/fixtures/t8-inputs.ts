/**
 * T8 hand-written inputs (Sofie), used until the T3 / T5 / T6 fixtures land.
 * Same catalogue rows and wording as fixtures/t5-inputs.ts. Figures are illustrative estimates, not KBC data.
 */
import type {
  ActiveMoment, CapabilityCode, Consent, Decision, DisruptionType, Estimates, Goal, Impact, IntentDef,
  PersistentContext, Plan, PlanStep, Provider, RuleSet, Scenario, Signal,
} from "../types";
import type { KateDeps, WhatIf } from "../engine/kate/deps";

export const ASOF = "2026-10-01";

export const sofieCtx: PersistentContext = {
  customerId: 1, firstName: "Sofie", age: 32, region: "Gent", language: "nl",
  household: "couple", children: 1, youngestChildAgeMonths: 20,
  employment: "employee", monthlyIncome: 2619, housing: "tenant", monthlyRent: 1351,
  savings: 31_000, monthlyDebt: 0, debtRatio: 0, heldSourceRows: [8, 168],
  properties: [{ kind: "house", buildYear: 1975, epc: "E", value: 250_000 }],
  cashflowPressure: "low",
};

export const sofieMoment: ActiveMoment = {
  type: "HOME_BUYING", confidence: 0.86, source: "ml",
  evidence: ["MORTGAGE_SIMULATION", "HOUSING_BUDGET_VIEW", "RENOVATION_VIEW"],
  contributions: [
    { feature: "mortgage_sim_count", value: 4, weight: 0.5, label: "4 home-loan simulations" },
    { feature: "renovation_views", value: 2, weight: 0.3, label: "Renovation cost checks" },
    { feature: "housing_budget_views", value: 1, weight: 0.4, label: "Your housing budget check" },
  ],
  since: "2026-08-25", expiresAt: "2026-11-23",
};

export const sofieSignals: Signal[] = [
  { code: "MORTGAGE_SIMULATION", customerId: 1, strength: 0.4, at: "2026-09-11", count: 4, value: 476_000, evidence: ["e1", "e2", "e3", "e4"], isDisruption: false },
];

export const buyHomeIntent: IntentDef = {
  code: "BUY_HOME", label: "Buy a home", goalType: "BUY_AND_PREPARE_HOME", askThreshold: 0.5, suggestThreshold: 0.8,
  kateAsk: "Hi {firstName} 👋 I noticed {evidence} lately. Are you planning to buy a home? I can put together your complete plan, from budget to keys.",
  kateSuggest: "Hi {firstName} 👋 Based on {evidence}, I've prepared a complete plan to buy and prepare your home. Want to see it?",
};

export const sofieDecision: Decision = {
  intent: "BUY_HOME", level: "ASK", reason: "confidence_between_thresholds",
  explanation: ["4 home-loan simulations in 3 weeks", "Renovation cost pages viewed twice"],
};

export const sofieGoal: Goal = {
  id: "goal-sofie-home", customerId: 1, type: "BUY_AND_PREPARE_HOME", status: "confirmed",
  constraints: { budget: 250_000, ownFunds: 30_000, maxMonthlyPayment: 1100, termYears: 25 },
  priorities: ["affordability", "energy_efficiency"], dependsOn: [], createdAt: ASOF,
};

const prov = (capability: CapabilityCode, sourceRow: number, itemName: string, provider: string, leadTimeDays: number, estimates: Estimates = {}): Provider =>
  ({ capability, sourceRow, itemName, provider, isPartner: provider !== "KBC", leadTimeDays, costEur: null, priority: 10, estimates });

const st = (order: number, chapter: string, p: Provider, dependsOn: CapabilityCode[], why: string, extra: Partial<PlanStep> = {}): PlanStep => ({
  id: `step-${p.capability}`, capability: p.capability, chapter, order, provider: p, alternatives: [],
  dependsOn: dependsOn.map((c) => `step-${c}`), status: "todo",
  display: p.isPartner ? "SHOW_PARTNER" : "SHOW_STEP", why, dataRequested: [], estimates: p.estimates, eta: null, ...extra,
});

export const sofiePlan: Plan = {
  id: "plan-sofie-v1", goalId: sofieGoal.id, version: 1, reason: "initial", atRisk: false, createdAt: ASOF,
  checks: [
    { constraint: "budget", ok: true, actual: 248_000, limit: 250_000, message: "Total cost €248,000 fits your €250,000 budget." },
    { constraint: "maxMonthlyPayment", ok: true, actual: 1066, limit: 1100, message: "€1,066/month fits your €1,100 limit." },
  ],
  steps: [
    st(1, "Find", prov("estimate_budget", 18, "Calculate housing budget", "KBC", 0), [], "Your all-in budget is €250,000, with €30,000 of your own funds.", { display: "SHOW_GUIDANCE", status: "done" }),
    st(2, "Find", prov("find_property", 15, "Search for a home", "Immoscoop", 45), ["estimate_budget"], "Search homes up to €220,000 so the renovation still fits your budget.", { dataRequested: ["search_criteria", "budget"] }),
    st(3, "Find", prov("value_property", 17, "Indicative online property valuation", "KBC", 1), ["find_property"], "Check the asking price before you bid."),
    st(4, "Find", prov("inspect_property", 14, "Certificates and inspections", "De Immowinkel", 10), ["find_property"], "Know the EPC before you buy: an EPC E home needs work.", { dataRequested: ["property_address", "property_type"] }),
    st(5, "Finance", prov("finance_property", 2, "Home loan", "KBC", 21, { monthlyPayment: 1066 }), ["value_property", "estimate_budget"], "A €220,000 home loan over 25 years: about €1,066/month."),
    st(6, "Renovate", prov("estimate_renovation", 12, "Estimate renovation costs and grants", "Setle", 7), ["inspect_property"], "A home built in 1975 with EPC E: estimate the works first.", { dataRequested: ["property_type", "postal_code", "build_year", "epc"] }),
    st(7, "Renovate", prov("identify_grants", 12, "Estimate renovation costs and grants", "Setle", 7, { customerEurOneOff: 8000 }), ["estimate_renovation"], "Grants of up to €8,000 lower what you need to borrow.", { dataRequested: ["postal_code", "income_bracket"] }),
    st(8, "Renovate", prov("quote_insulation", 131, "Insulation", "Impact us today", 21, { customerEurPerYear: 900, kwhPerYear: 6000 }), ["estimate_renovation"], "Insulation has the biggest impact on an EPC E home.", { dataRequested: ["property_address", "renovation_budget"] }),
    st(9, "Renovate", prov("quote_heating", 132, "Heat pump", "Impact us today", 21, { customerEurPerYear: 700, kwhPerYear: 8000 }), ["estimate_renovation"], "A heat pump cuts your energy bill.", { dataRequested: ["property_address", "renovation_budget"] }),
    st(10, "Renovate", prov("evaluate_solar", 129, "Calculate solar panels and request a quote", "KBC", 14, { customerEurPerYear: 600, kwhPerYear: 3500 }), ["inspect_property"], "Solar panels lower your bill once the roof is checked."),
    st(11, "Finance", prov("finance_renovation", 128, "Energy loan", "KBC", 14), ["quote_insulation", "quote_heating", "identify_grants"], "A €20,000 energy loan covers the works after grants."),
    st(12, "Protect", prov("insure_property", 8, "Home insurance", "KBC", 2), ["finance_property"], "Your new home must be insured from the deed.", { display: "ALREADY_COVERED" }),
    st(13, "Protect", prov("insure_loan", 10, "Outstanding balance insurance", "KBC", 2), ["finance_property"], "Protect your family if something happens to you."),
  ],
};

export const sofieConsents: Consent[] = [
  { goalId: sofieGoal.id, stepId: "step-estimate_renovation", partner: "Setle", field: "property_type", granted: true, at: ASOF },
  { goalId: sofieGoal.id, stepId: "step-estimate_renovation", partner: "Setle", field: "postal_code", granted: true, at: ASOF },
  { goalId: sofieGoal.id, stepId: "step-estimate_renovation", partner: "Setle", field: "build_year", granted: false, at: ASOF },
];

/** Only the labels matter to Kate. */
export const t8Rules: RuleSet = {
  signalRules: [], modelWeights: [], momentRules: [], intents: [buyHomeIntent], intentRules: [],
  capabilities: [
    ["estimate_budget", "Calculate your housing budget"], ["find_property", "Search for a home"], ["value_property", "Value the property"],
    ["inspect_property", "Certificates and inspections (EPC)"], ["finance_property", "Home loan"], ["estimate_renovation", "Estimate renovation costs"],
    ["identify_grants", "Identify renovation grants"], ["quote_insulation", "Insulation quote"], ["quote_heating", "Heat pump quote"],
    ["evaluate_solar", "Solar panels quote"], ["finance_renovation", "Energy loan"], ["insure_property", "Home insurance"],
    ["insure_loan", "Outstanding balance insurance"],
  ].map(([code, label]) => ({ code: code as CapabilityCode, label, ecosystem: "Home", whatItSolves: label, requiredData: [], output: "" })),
  providers: [], templates: [], decisionRules: [],
  disruptionTypes: [
    { code: "INCOME_DROP", signals: ["INCOME_DROP", "BENEFITS_INFLOW"], affects: ["maxMonthlyPayment", "budget"],
      kateTemplate: "{firstName}, your income has changed, and your {goal} plan is now above what you can comfortably repay. I've prepared two options." },
  ],
  replanStrategies: [],
};

export const incomeDropType: DisruptionType = t8Rules.disruptionTypes[0];

export const incomeDropImpact: Impact = {
  goalId: sofieGoal.id, disruption: "INCOME_DROP", severity: "high", affectedStepIds: ["step-finance_property"],
  broken: [{ constraint: "maxMonthlyPayment", ok: false, actual: 1066, limit: 700, message: "€1,066/month is above your new €700 limit." }],
};

const scenario = (id: string, label: string, monthlyPayment: number, strategies: Scenario["strategies"], tradeoffs: string[], okPayment = true): Scenario => ({
  id, goalId: sofieGoal.id, label, strategies, goalPatch: {}, score: 0.8, probabilityOfSuccess: okPayment ? 0.85 : 0.4,
  tradeoffs, monthlyPayment, deadline: "2027-06-30",
  plan: { ...sofiePlan, id: `plan-${id}`, version: 2, reason: "scenario",
    checks: [{ constraint: "maxMonthlyPayment", ok: okPayment, actual: monthlyPayment, limit: 1100,
      message: okPayment ? `€${monthlyPayment.toLocaleString("en-US")}/month fits your €1,100 limit.` : `€${monthlyPayment.toLocaleString("en-US")}/month is above your €1,100 limit.` }] },
});

export const incomeDropScenarios: Scenario[] = [
  scenario("sc-a", "Smaller home, renovate in 2 phases", 690, ["REDUCE_SCOPE"], ["home budget €220,000", "solar panels and windows later"]),
  scenario("sc-b", "Same home over 30 years, with loan protection", 695, ["EXTEND_TERM", "ADD_PROTECTION"], ["5 more years of repayments", "outstanding balance insurance"]),
];

/** Stand-in for T6 `simulate()` until it lands: canned results for the demo questions only. */
export const stubDeps: KateDeps = {
  simulate: (_goal, _plan, _ctx, change: WhatIf) => {
    if (change.budget === 280_000) {
      return [
        scenario("sim-280k", "Home at €280,000 over 25 years", 1212, [], ["€30,000 more to borrow"], false),
        scenario("sim-280k-30y", "Home at €280,000 over 30 years", 1081, ["EXTEND_TERM"], ["5 more years of repayments"]),
      ];
    }
    if (change.dropCapabilities?.includes("evaluate_solar")) {
      return [scenario("sim-no-solar", "Solar panels later", 1066, ["REORDER"], ["about €600/year of savings later"])];
    }
    return [];
  },
};

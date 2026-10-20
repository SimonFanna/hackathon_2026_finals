/**
 * T5 hand-written inputs, used until T1 (context) and T4 (registry) fixtures land.
 * Figures are illustrative estimates (docs/assumptions.md), not KBC data.
 */
import type {
  Capability,
  CapabilityCode,
  DecisionRule,
  Estimates,
  GoalTemplate,
  PersistentContext,
  Provider,
  RuleSet,
  TemplateStep,
} from "../types";

export const ASOF = "2026-10-01";

export const sofieCtx: PersistentContext = {
  customerId: 1,
  firstName: "Sofie",
  age: 32,
  region: "Gent",
  language: "nl",
  household: "couple",
  children: 1,
  youngestChildAgeMonths: 20,
  employment: "employee",
  monthlyIncome: 2619,
  housing: "tenant",
  monthlyRent: 1351,
  savings: 31_000,
  monthlyDebt: 0,
  debtRatio: 0,
  heldSourceRows: [8, 168], // Home insurance (row 8) already held, current account
  properties: [],
  cashflowPressure: "low",
};

export const lucasCtx: PersistentContext = {
  customerId: 2,
  firstName: "Lucas",
  age: 29,
  region: "Antwerpen",
  language: "nl",
  household: "single",
  children: 0,
  youngestChildAgeMonths: null,
  employment: "self_employed",
  monthlyIncome: 2400,
  housing: "tenant",
  monthlyRent: 950,
  savings: 12_000,
  monthlyDebt: 0,
  debtRatio: 0,
  heldSourceRows: [],
  properties: [],
  cashflowPressure: "medium",
};

const cap = (code: CapabilityCode, label: string, ecosystem: string, requiredData: string[] = [], output = ""): Capability => ({
  code,
  label,
  ecosystem,
  whatItSolves: label,
  requiredData,
  output,
});

const prov = (
  capability: CapabilityCode,
  sourceRow: number,
  itemName: string,
  provider: string,
  leadTimeDays: number,
  priority: number,
  estimates: Estimates = {},
  costEur: number | null = null,
): Provider => ({ capability, sourceRow, itemName, provider, isPartner: provider !== "KBC", leadTimeDays, costEur, priority, estimates });

const step = (
  goalType: GoalTemplate["goalType"],
  position: number,
  chapter: string,
  capability: CapabilityCode,
  dependsOn: CapabilityCode[],
  why: string,
  extra: Partial<TemplateStep> = {},
): TemplateStep => ({ goalType, capability, chapter, position, dependsOn, condition: null, why, optional: false, ...extra });

const needsRenovation: TemplateStep["condition"] = {
  any: [
    { field: "ctx.properties.0.epc", op: "in", value: ["D", "E", "F"] },
    { field: "ctx.properties.0.buildYear", op: "lt", value: 1990 },
  ],
};

export const capabilities: Capability[] = [
  cap("estimate_budget", "Calculate your housing budget", "Home"),
  cap("find_property", "Search for a home", "Home", ["search_criteria", "budget"]),
  cap("value_property", "Value the property", "Home", ["property_address"]),
  cap("inspect_property", "Certificates and inspections (EPC)", "Home", ["property_address", "property_type"]),
  cap("finance_property", "Home loan", "Home"),
  cap("bridge_finance", "Bridging loan", "Home"),
  cap("estimate_renovation", "Estimate renovation costs", "Home", ["property_type", "postal_code", "build_year", "epc"]),
  cap("identify_grants", "Identify renovation grants", "Home", ["postal_code", "income_bracket"]),
  cap("quote_insulation", "Insulation quote", "Home", ["property_address", "renovation_budget"]),
  cap("quote_heating", "Heat pump quote", "Home", ["property_address", "renovation_budget"]),
  cap("quote_windows", "Window replacement quote", "Home", ["property_address"]),
  cap("evaluate_solar", "Solar panels quote", "Home"),
  cap("finance_renovation", "Energy loan", "Home"),
  cap("insure_property", "Home insurance", "Home"),
  cap("insure_loan", "Outstanding balance insurance", "Home"),
  cap("get_startup_support", "Start-up support", "Business"),
  cap("get_tax_legal_advice", "Tax and legal advice", "Business"),
  cap("open_business_account", "Business account", "Business"),
  cap("set_up_invoicing", "Invoicing", "Business", ["company_name", "vat_number", "email"]),
  cap("accept_payments", "Accept payments", "Business", ["company_name", "vat_number", "iban"]),
  cap("connect_accountant", "Connect your accountant", "Business"),
  cap("insure_liability", "Professional liability insurance", "Business"),
  cap("insure_income", "Guaranteed income insurance", "Business"),
  cap("build_pension", "Supplementary pension", "Business"),
];

export const providers: Provider[] = [
  prov("estimate_budget", 18, "Calculate housing budget", "KBC", 0, 10),
  prov("find_property", 15, "Search for a home", "Immoscoop", 45, 10, { partnerValueEur: 40 }),
  prov("value_property", 17, "Indicative online property valuation", "KBC", 1, 10, {}, 0),
  prov("value_property", 16, "Property valuation by an estate agent", "Immoscoop", 7, 6, { partnerValueEur: 150 }, 350),
  prov("inspect_property", 14, "Certificates and inspections", "De Immowinkel", 10, 10, { partnerValueEur: 120 }, 300),
  prov("finance_property", 2, "Home loan", "KBC", 21, 10, { kbcRevenueEur: 0 }),
  prov("bridge_finance", 3, "Bridging loan", "KBC", 14, 10),
  prov("estimate_renovation", 12, "Estimate renovation costs and grants", "Setle", 7, 10, { partnerValueEur: 100 }, 0),
  prov("identify_grants", 12, "Estimate renovation costs and grants", "Setle", 7, 10, { customerEurOneOff: 8000 }, 0),
  prov("quote_insulation", 131, "Insulation", "Impact us today", 21, 10, { customerEurPerYear: 900, kwhPerYear: 6000, co2KgPerYear: 1200, partnerValueEur: 300 }, 15_000),
  prov("quote_heating", 132, "Heat pump", "Impact us today", 21, 10, { customerEurPerYear: 700, kwhPerYear: 8000, co2KgPerYear: 1600, partnerValueEur: 300 }, 14_000),
  prov("quote_windows", 13, "Windows", "Impact us today", 21, 10, { customerEurPerYear: 300, kwhPerYear: 2500, co2KgPerYear: 500, partnerValueEur: 200 }, 12_000),
  prov("evaluate_solar", 129, "Calculate solar panels and request a quote", "KBC", 14, 10, { customerEurPerYear: 600, kwhPerYear: 3500, co2KgPerYear: 350, kbcRevenueEur: 150 }, 7000),
  prov("evaluate_solar", 130, "Home battery", "KBC", 14, 5, { customerEurPerYear: 250, kwhPerYear: 1200, kbcRevenueEur: 100 }, 6000),
  prov("finance_renovation", 128, "Energy loan", "KBC", 14, 10, { kbcRevenueEur: 1500 }),
  prov("finance_renovation", 4, "Renovation loan", "KBC", 14, 6, { kbcRevenueEur: 1500 }),
  prov("insure_property", 8, "Home insurance", "KBC", 2, 10, { kbcRevenueEur: 400 }),
  prov("insure_property", 9, "Home assistance insurance", "KBC", 2, 5, { kbcRevenueEur: 120 }),
  prov("insure_loan", 10, "Outstanding balance insurance", "KBC", 2, 10, { kbcRevenueEur: 300 }),
  prov("get_startup_support", 107, "Start it @KBC", "KBC", 7, 10),
  prov("get_startup_support", 109, "Boostpack", "KBC", 3, 6),
  prov("get_tax_legal_advice", 110, "Tax and legal advice for SMEs", "KBC", 7, 10),
  prov("open_business_account", 79, "KBC Business PRO Account", "KBC", 1, 10, { kbcRevenueEur: 120 }),
  prov("open_business_account", 121, "Business Account - Partner Hub", "KBC", 1, 5),
  prov("set_up_invoicing", 86, "Billit", "Billit", 2, 10, { partnerValueEur: 80 }, 0),
  prov("set_up_invoicing", 92, "Soluz.io", "Soluz.io", 2, 8, { partnerValueEur: 80 }, 0),
  prov("set_up_invoicing", 93, "KBC Invoicing Services", "KBC", 1, 7),
  prov("accept_payments", 123, "Bancontact Pro Online", "Bancontact Pro", 3, 10, { partnerValueEur: 60 }),
  prov("accept_payments", 122, "Bancontact Pro In Store", "Bancontact Pro", 5, 8, { partnerValueEur: 60 }),
  prov("accept_payments", 89, "Payment terminals", "KBC", 7, 6, { kbcRevenueEur: 200 }),
  prov("connect_accountant", 88, "Send an expense claim to your accountant", "KBC", 1, 10),
  prov("insure_liability", 188, "Professional liability", "KBC", 3, 10, { kbcRevenueEur: 250 }),
  prov("insure_liability", 187, "Business liability", "KBC", 3, 8, { kbcRevenueEur: 250 }),
  prov("insure_income", 195, "Guaranteed income insurance for the self-employed", "KBC", 7, 10, { kbcRevenueEur: 300 }),
  prov("build_pension", 58, "Supplementary pension for the self-employed", "KBC", 7, 10, { customerEurPerYear: 400, kbcRevenueEur: 200 }),
  prov("build_pension", 61, "Pension agreement for the self-employed", "KBC", 7, 8, { kbcRevenueEur: 200 }),
];

const H = "BUY_AND_PREPARE_HOME" as const;
const B = "START_BUSINESS" as const;

export const templates: GoalTemplate[] = [
  {
    goalType: H,
    label: "Buy and prepare a home",
    defaultConstraints: { termYears: 25 },
    outcome: "Home bought and renovation plan financed",
    steps: [
      step(H, 1, "Find", "estimate_budget", [], "Your all-in budget is {budget}, with {ownFunds} of your own funds."),
      step(H, 2, "Find", "find_property", ["estimate_budget"], "Search homes up to {purchasePrice} so the renovation still fits your budget."),
      step(H, 3, "Find", "value_property", ["find_property"], "Check the asking price before you bid."),
      step(H, 4, "Find", "inspect_property", ["find_property"], "Know the EPC before you buy: an EPC {epc} home needs work."),
      step(H, 5, "Finance", "finance_property", ["value_property", "estimate_budget", "identify_grants"], "A {homeLoan} home loan over {termYears} years: about {monthlyPayment}/month, sized once the works and grants are known."),
      step(H, 6, "Finance", "bridge_finance", ["finance_property"], "Bridge the sale of your current home.", {
        condition: { field: "ctx.housing", op: "eq", value: "owner" },
        optional: true,
      }),
      step(H, 7, "Renovate", "estimate_renovation", ["inspect_property"], "A home built in {buildYear} with EPC {epc}: estimate the works first.", { condition: needsRenovation }),
      step(H, 8, "Renovate", "identify_grants", ["estimate_renovation"], "Grants of up to {grants} lower what you need to borrow.", { condition: needsRenovation }),
      step(H, 9, "Renovate", "quote_insulation", ["estimate_renovation"], "Insulation has the biggest impact on an EPC {epc} home.", { condition: needsRenovation }),
      step(H, 10, "Renovate", "quote_heating", ["estimate_renovation"], "A heat pump cuts your energy bill.", { condition: needsRenovation }),
      step(H, 11, "Renovate", "quote_windows", ["estimate_renovation"], "New windows finish the envelope.", { condition: needsRenovation, optional: true }),
      step(H, 12, "Renovate", "evaluate_solar", ["inspect_property"], "Solar panels lower your bill once the roof is checked."),
      step(H, 13, "Finance", "finance_renovation", ["quote_insulation", "quote_heating", "identify_grants"], "A {renovationLoan} energy loan covers the works after grants."),
      step(H, 14, "Protect", "insure_property", ["finance_property"], "Your new home must be insured from the deed."),
      step(H, 15, "Protect", "insure_loan", ["finance_property"], "Protect your family if something happens to you."),
    ],
  },
  {
    goalType: B,
    label: "Start a business",
    defaultConstraints: {},
    outcome: "Business set up, getting paid and protected",
    steps: [
      step(B, 1, "Start", "get_startup_support", [], "Free coaching to validate your plan, {firstName}."),
      step(B, 2, "Start", "get_tax_legal_advice", ["get_startup_support"], "Pick the right legal form before you register."),
      step(B, 3, "Set up", "open_business_account", ["get_tax_legal_advice"], "Keep business and private money apart."),
      step(B, 4, "Get paid", "set_up_invoicing", ["open_business_account"], "Send compliant invoices from day one."),
      step(B, 5, "Get paid", "accept_payments", ["open_business_account"], "Let customers pay you on the spot."),
      step(B, 6, "Get paid", "connect_accountant", ["open_business_account"], "Your accountant sees expenses as they happen."),
      step(B, 7, "Protect", "insure_liability", ["open_business_account"], "Cover mistakes made for a client."),
      step(B, 8, "Protect", "insure_income", ["open_business_account"], "As self-employed, you have no salary if you fall ill."),
      step(B, 9, "Future", "build_pension", ["open_business_account"], "The self-employed state pension is low: start early.", { optional: true }),
    ],
  },
];

/** Same rows as the `decision_rules` seed (supabase/migrations/20261020122000_decision_rules.sql). */
export const decisionRules: DecisionRule[] = [
  { id: "already_held", priority: 100, effect: "ALREADY_COVERED", reason: "You already have this with KBC.", condition: { field: "step.held", op: "eq", value: true } },
  { id: "not_relevant_90d", priority: 90, effect: "HIDDEN", reason: "You told us this wasn't relevant.", condition: { field: "fb.notRelevantDaysAgo", op: "lte", value: 90 } },
  {
    id: "cashflow_wait",
    priority: 80,
    effect: "WAIT",
    reason: "Paused while your finances settle.",
    condition: {
      all: [
        { field: "ctx.cashflowPressure", op: "eq", value: "high" },
        { field: "step.commercial", op: "eq", value: true },
        { any: [{ field: "step.optional", op: "eq", value: true }, { field: "step.capability", op: "in", value: ["evaluate_solar", "quote_windows", "build_pension", "accept_payments"] }] },
      ],
    },
  },
  { id: "not_now_30d", priority: 70, effect: "LOWER_PRIORITY", reason: "You asked us to come back to this later.", condition: { field: "fb.notNowDaysAgo", op: "lte", value: 30 } },
  { id: "partner_consent", priority: 50, effect: "SHOW_PARTNER", reason: "Shared only with your consent.", condition: { field: "step.provider.isPartner", op: "eq", value: true } },
  {
    id: "advice_only",
    priority: 40,
    effect: "SHOW_GUIDANCE",
    reason: "Free guidance, no product to buy.",
    condition: { field: "step.capability", op: "in", value: ["estimate_budget", "get_startup_support", "get_tax_legal_advice", "connect_accountant"] },
  },
];

export const t5Rules: RuleSet = {
  signalRules: [],
  modelWeights: [],
  momentRules: [],
  intents: [],
  intentRules: [],
  capabilities,
  providers,
  templates,
  decisionRules,
  disruptionTypes: [],
  replanStrategies: [],
};

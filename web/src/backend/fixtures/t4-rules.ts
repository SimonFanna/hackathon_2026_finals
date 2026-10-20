/**
 * T4 registry data: capabilities, providers and goal templates.
 *
 * Single source of truth. `node scripts/registry/seed.ts` turns it into
 * `supabase/seed/capabilities.sql`, and T7's snapshot reads it back from Supabase.
 * Item names and partners are copied from the KBC catalogue (`ecosystem_items`);
 * registry.test.ts checks them against `data/snapshot/catalogue.json`.
 * Estimates are illustrative orders of magnitude (docs/assumptions.md), not KBC data.
 *
 * Type-only imports: this file must stay runnable by plain `node` (type stripping).
 */
import type { Capability, CapabilityCode, Condition, Estimates, GoalTemplate, GoalType, Provider, RuleSet, TemplateStep } from "../types";

const cap = (
  code: CapabilityCode,
  label: string,
  ecosystem: string,
  whatItSolves: string,
  requiredData: string[],
  output: string,
): Capability => ({ code, label, ecosystem, whatItSolves, requiredData, output });

/** `partner` is the catalogue partner of the item, or null for a KBC item. */
const prov = (
  capability: CapabilityCode,
  sourceRow: number,
  itemName: string,
  partner: string | null,
  leadTimeDays: number,
  priority: number,
  estimates: Estimates = {},
  costEur: number | null = null,
): Provider => ({ capability, sourceRow, itemName, provider: partner ?? "KBC", isPartner: partner !== null, leadTimeDays, costEur, priority, estimates });

const step = (
  goalType: GoalType,
  position: number,
  chapter: string,
  capability: CapabilityCode,
  dependsOn: CapabilityCode[],
  why: string,
  extra: Partial<Pick<TemplateStep, "condition" | "optional">> = {},
): TemplateStep => ({ goalType, capability, chapter, position, dependsOn, condition: null, why, optional: false, ...extra });

/** Renovation steps only make sense for an energy-poor or old home (target property first, see T5 planningContext). */
const needsRenovation: Condition = {
  any: [
    { field: "ctx.properties.0.epc", op: "in", value: ["D", "E", "F"] },
    { field: "ctx.properties.0.buildYear", op: "lt", value: 1990 },
  ],
};

export const capabilities: Capability[] = [
  // home
  cap("estimate_budget", "Calculate your housing budget", "Housing", "How much home can I afford, all costs included?", ["monthly_income", "own_funds"], "All-in purchase budget"),
  cap("find_property", "Search for a home", "Housing", "Find homes that fit the budget, renovation included.", ["search_criteria", "budget"], "Shortlist of homes"),
  cap("value_property", "Value the property", "Housing", "Is the asking price fair?", ["property_address"], "Estimated market value"),
  cap("inspect_property", "Certificates and inspections (EPC)", "Housing", "What state is the home really in?", ["property_address", "property_type"], "EPC certificate and inspection report"),
  cap("finance_property", "Home loan", "Housing", "Finance the purchase.", ["monthly_income", "own_funds", "purchase_price"], "Home loan offer"),
  cap("bridge_finance", "Bridging loan", "Housing", "Buy the new home before the current one is sold.", ["current_home_value", "outstanding_mortgage"], "Bridging loan offer"),
  cap("estimate_renovation", "Estimate renovation costs", "Housing", "What will the works cost?", ["property_type", "postal_code", "build_year", "epc"], "Renovation cost estimate"),
  cap("identify_grants", "Identify renovation grants", "Housing", "Which grants lower the bill?", ["postal_code", "income_bracket"], "Grants and amounts the customer can claim"),
  cap("quote_insulation", "Insulation quote", "Energy and sustainability", "Cut heat loss, the biggest saving on an old home.", ["property_address", "renovation_budget"], "Insulation quote"),
  cap("quote_heating", "Heat pump quote", "Energy and sustainability", "Replace fossil heating.", ["property_address", "renovation_budget"], "Heating quote"),
  cap("quote_windows", "Window replacement quote", "Housing", "Finish the building envelope.", ["property_address"], "Window quote"),
  cap("evaluate_solar", "Solar panels and battery", "Energy and sustainability", "Produce and store own electricity.", ["property_address"], "Solar or battery quote"),
  cap("finance_renovation", "Energy or renovation loan", "Energy and sustainability", "Finance the works left after grants.", ["renovation_quotes", "grants"], "Energy or renovation loan offer"),
  cap("insure_property", "Home insurance", "Housing", "Protect the home from the day of the deed.", ["property_address", "property_value"], "Home insurance policy"),
  cap("insure_loan", "Outstanding balance insurance", "Housing", "Protect the family if the borrower dies.", ["loan_amount", "date_of_birth"], "Outstanding balance cover"),
  // business
  cap("get_startup_support", "Start-up support", "Business", "Validate the business plan with coaching and a network.", ["business_idea"], "Coaching and start-up network"),
  cap("get_tax_legal_advice", "Tax and legal advice", "Business", "Pick the right legal form and tax set-up.", ["business_plan"], "Legal form and tax set-up"),
  cap("open_business_account", "Business account", "Business", "Keep business and private money apart.", ["company_name", "vat_number"], "Business account"),
  cap("set_up_invoicing", "Invoicing", "Business", "Send compliant invoices from day one.", ["company_name", "vat_number", "email"], "Invoicing tool linked to the account"),
  cap("accept_payments", "Accept payments", "Business", "Let customers pay online or on the spot.", ["company_name", "vat_number"], "Payment acceptance"),
  cap("connect_accountant", "Connect your accountant", "Business", "Share expenses with the accountant as they happen.", ["accountant_email"], "Expenses shared with the accountant"),
  cap("insure_liability", "Liability insurance", "Business protection", "Cover mistakes made for a client.", ["activity", "turnover_estimate"], "Liability cover"),
  cap("insure_income", "Guaranteed income insurance", "Business protection", "Keep an income when ill.", ["monthly_income", "date_of_birth"], "Income cover"),
  cap("build_pension", "Supplementary pension", "Pensions", "Top up the low self-employed state pension.", ["monthly_income", "date_of_birth"], "Supplementary pension plan"),
];

// prov(capability, sourceRow, catalogue name, catalogue partner, leadTimeDays, priority, estimates, costEur)
export const providers: Provider[] = [
  // home
  prov("estimate_budget", 18, "Calculate housing budget", null, 0, 10),
  prov("find_property", 15, "Search for a home", "Immoscoop", 45, 10, { partnerValueEur: 40 }),
  prov("value_property", 17, "Indicative online property valuation", null, 1, 10, {}, 0),
  prov("value_property", 16, "Property valuation by an estate agent", "Immoscoop", 7, 6, { partnerValueEur: 150 }, 350),
  prov("inspect_property", 14, "Certificates and inspections", "De Immowinkel", 10, 10, { partnerValueEur: 120 }, 300),
  prov("finance_property", 2, "Home loan", null, 21, 10, { kbcRevenueEur: 0 }),
  prov("bridge_finance", 3, "Bridging loan", null, 14, 10),
  prov("estimate_renovation", 12, "Estimate renovation costs and grants", "Setle", 7, 10, { partnerValueEur: 100 }, 0),
  prov("identify_grants", 12, "Estimate renovation costs and grants", "Setle", 7, 10, { customerEurOneOff: 8000 }, 0),
  prov("quote_insulation", 131, "Insulation quote", "Impact us today", 21, 10, { customerEurPerYear: 900, kwhPerYear: 6000, co2KgPerYear: 1200, partnerValueEur: 300 }, 15_000),
  prov("quote_heating", 132, "Heating quote", "Impact us today", 21, 10, { customerEurPerYear: 700, kwhPerYear: 8000, co2KgPerYear: 1600, partnerValueEur: 300 }, 14_000),
  prov("quote_windows", 13, "Quote for new windows", "Impact us today", 21, 10, { customerEurPerYear: 300, kwhPerYear: 2500, co2KgPerYear: 500, partnerValueEur: 200 }, 12_000),
  prov("evaluate_solar", 129, "Calculate solar panels and request a quote", null, 14, 10, { customerEurPerYear: 600, kwhPerYear: 3500, co2KgPerYear: 350, kbcRevenueEur: 150 }, 7000),
  prov("evaluate_solar", 130, "Calculate a home battery and request a quote", null, 14, 5, { customerEurPerYear: 250, kwhPerYear: 1200, kbcRevenueEur: 100 }, 6000),
  prov("finance_renovation", 128, "Energy loan", null, 14, 10, { kbcRevenueEur: 1500 }),
  prov("finance_renovation", 4, "Renovation loan", null, 14, 6, { kbcRevenueEur: 1500 }),
  prov("insure_property", 8, "Home insurance", null, 2, 10, { kbcRevenueEur: 400 }),
  prov("insure_property", 9, "Home assistance insurance", null, 2, 5, { kbcRevenueEur: 120 }),
  prov("insure_loan", 10, "Outstanding balance insurance", null, 2, 10, { kbcRevenueEur: 300 }),
  // business
  prov("get_startup_support", 107, "Start it @KBC", null, 7, 10),
  prov("get_startup_support", 109, "Boostpack", null, 3, 6),
  prov("get_tax_legal_advice", 110, "Tax and legal advice for SMEs", null, 7, 10),
  prov("open_business_account", 79, "KBC Business PRO Account", null, 1, 10, { kbcRevenueEur: 120 }),
  prov("open_business_account", 121, "Business Account", null, 1, 5), // via KBC Partner Hub
  prov("set_up_invoicing", 86, "E-invoicing", "Billit", 2, 10, { partnerValueEur: 80 }, 0),
  prov("set_up_invoicing", 92, "Electronic invoicing", "Soluz.io", 2, 8, { partnerValueEur: 80 }, 0),
  prov("set_up_invoicing", 93, "KBC Invoicing Services", null, 1, 7),
  prov("accept_payments", 123, "Bancontact Pro Online", null, 3, 10, { kbcRevenueEur: 60 }),
  prov("accept_payments", 122, "Bancontact Pro In Store", null, 5, 8, { kbcRevenueEur: 60 }),
  prov("accept_payments", 89, "Payment terminals", null, 7, 6, { kbcRevenueEur: 200 }),
  prov("connect_accountant", 88, "Send an expense claim to your accountant", null, 1, 10),
  prov("insure_liability", 188, "Professional liability insurance", null, 3, 10, { kbcRevenueEur: 250 }),
  prov("insure_liability", 187, "Business liability insurance", null, 3, 8, { kbcRevenueEur: 250 }),
  prov("insure_income", 195, "Guaranteed income insurance for the self-employed", null, 7, 10, { kbcRevenueEur: 300 }),
  prov("build_pension", 58, "Supplementary pension for the self-employed", null, 7, 10, { customerEurPerYear: 400, kbcRevenueEur: 200 }),
  prov("build_pension", 61, "Pension agreement for the self-employed", null, 7, 8, { kbcRevenueEur: 200 }),
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
      step(H, 5, "Finance", "finance_property", ["value_property", "estimate_budget"], "A {homeLoan} home loan over {termYears} years: about {monthlyPayment}/month."),
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

/** The T4 slice of the RuleSet. Merge it with the other tasks' fixtures. */
export const t4Rules: Pick<RuleSet, "capabilities" | "providers" | "templates"> = { capabilities, providers, templates };

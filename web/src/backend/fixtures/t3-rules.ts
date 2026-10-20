import type { IntentDef, IntentRule, MomentRule } from "../types";

// T3 config rows — the same data as the seed in supabase/migrations/20261020121000_intents.sql.
// Keep both in sync. T7's snapshot replaces this at runtime; tests use it directly.

export const t3MomentRules: MomentRule[] = [
  {
    moment: "HOME_BUYING", label: "buying a home", bias: -2.1, expiryDays: 180, context: null, requiresSignal: true,
    weights: {
      MORTGAGE_SIMULATION: 6, HOME_LOAN_APPLICATION: 6, NOTARY_PAYMENT: 6, HOME_LOAN_KATE_QUESTION: 4,
      HOUSING_BUDGET_VIEW: 3, PROPERTY_VALUATION_VIEW: 3, HOME_SEARCH_IN_APP: 3, SAVING_FOR_DOWN_PAYMENT: 2, HOME_LOAN_VIEW: 2, RENOVATION_VIEW: 1.5,
    },
    contextScores: [{ condition: { field: "ctx.housing", op: "neq", value: "owner" }, score: 0.2, label: "You don't own a home yet" }],
  },
  {
    moment: "STARTING_BUSINESS", label: "starting your own business", bias: -2, expiryDays: 180, requiresSignal: true,
    context: { field: "ctx.employment", op: "neq", value: "retired" },
    weights: {
      FREELANCE_INCOME: 4, START_IT_VIEW: 4, BUSINESS_KATE_QUESTION: 4, BUSINESS_ACCOUNT_VIEW: 3,
      ACCOUNTING_TOOL_PAYMENT: 3, BUSINESS_TOOLS_VIEW: 2, SALARY_STOPPED: 2, BUSINESS_PROTECTION_VIEW: 1.5, EQUIPMENT_PURCHASE: 1.5,
    },
  },
  {
    moment: "NEW_PARENT", label: "welcoming a baby", bias: -2, expiryDays: 365, context: null, requiresSignal: true,
    weights: { CHILD_BORN: 5, FAMILY_KATE_QUESTION: 3, BABY_SPENDING: 2.5, CHILDCARE_PAYMENT: 2, FAMILY_PROTECTION_VIEW: 2 },
  },
  {
    moment: "EV_PURCHASE", label: "switching to an electric car", bias: -2, expiryDays: 120, context: null, requiresSignal: true,
    weights: { EV_LOAN_SIMULATION: 5, EV_KATE_QUESTION: 3, EV_PAGE_VIEW: 3, CAR_LOAN_ENDING: 2, EV_CHARGING: 1 },
  },
  {
    moment: "RETIREMENT_PREP", label: "preparing for retirement", bias: -2, expiryDays: 365, requiresSignal: true,
    context: { field: "ctx.age", op: "gte", value: 45 },
    weights: { RETIREMENT_KATE_QUESTION: 3, PENSION_VIEW: 3, LUMP_SUM_INVESTMENT: 2, ESTATE_PLANNING_VIEW: 1.5 },
  },
  {
    moment: "CASHFLOW_PRESSURE", label: "a tighter budget", bias: -2, expiryDays: 90, context: null, requiresSignal: false,
    weights: { INCOME_DROP: 5, SALARY_STOPPED: 1.5, LARGE_UNEXPECTED_EXPENSE: 3, BENEFITS_INFLOW: 0.5 },
    contextScores: [
      { condition: { field: "ctx.cashflowPressure", value: "high" }, score: 3.5, label: "Your fixed costs take a large share of your income" },
      { condition: { field: "ctx.cashflowPressure", value: "medium" }, score: 1.5, label: "Your fixed costs are rising compared to your income" },
    ],
  },
];

const T = "{firstName}";
export const t3Intents: IntentDef[] = [
  {
    code: "BUY_HOME", label: "Buy a home", goalType: "BUY_AND_PREPARE_HOME", askThreshold: 0.5, suggestThreshold: 0.85, commercial: true,
    kateAsk: `Hi ${T} 👋 I noticed you've been looking at home loans lately. Are you planning to buy a home? I can put together your complete plan, from budget to keys.`,
    kateSuggest: `Hi ${T} 👋 It looks like you're getting ready to buy a home ({evidence}). Shall I build your complete plan, from budget and loan to inspection, renovation and insurance?`,
  },
  {
    code: "RENOVATE_HOME", label: "Renovate a home", goalType: null, askThreshold: 0.5, suggestThreshold: 0.85, commercial: true,
    kateAsk: `Hi ${T} 👋 You've been checking renovation costs and grants. Are you planning to renovate? I can tell you which grants apply and who can quote.`,
    kateSuggest: `Hi ${T} 👋 Want me to line up the renovation: costs, grants, quotes and financing in one plan?`,
  },
  {
    code: "REDUCE_ENERGY_COST", label: "Lower energy costs", goalType: null, askThreshold: 0.5, suggestThreshold: 0.85, commercial: false,
    kateAsk: `Hi ${T} 👋 Would you like to see how much you could save on energy with insulation, a heat pump or solar panels?`,
    kateSuggest: `Hi ${T} 👋 I can show you the energy upgrades with the best payback for your home, including grants.`,
  },
  {
    code: "START_BUSINESS", label: "Start a business", goalType: "START_BUSINESS", askThreshold: 0.5, suggestThreshold: 0.85, commercial: true,
    kateAsk: `Hi ${T} 👋 I see you've been exploring Start it @KBC and business topics. Are you thinking of starting your own business? I can set up everything you need, step by step.`,
    kateSuggest: `Hi ${T} 👋 It looks like you're launching as a freelancer ({evidence}). Shall I prepare your start-up plan: business account, invoicing, payments, accountant and protection?`,
  },
  {
    code: "PREPARE_FOR_BABY", label: "Prepare for a baby", goalType: "WELCOME_BABY", askThreshold: 0.5, suggestThreshold: 0.85, commercial: false,
    kateAsk: `Hi ${T} 👋 Congratulations if there's a little one on the way or just arrived! Would you like a checklist for insurance, savings and child benefits?`,
    kateSuggest: `Hi ${T} 👋 I can make sure your little one is covered: insurance, child benefits and a savings plan, in one go.`,
  },
  {
    code: "SWITCH_TO_EV", label: "Switch to an electric car", goalType: "SWITCH_TO_EV", askThreshold: 0.5, suggestThreshold: 0.85, commercial: true,
    kateAsk: `Hi ${T} 👋 You've been looking at electric cars. Are you thinking of switching? I can plan the loan, insurance and a home charger together.`,
    kateSuggest: `Hi ${T} 👋 Shall I put your EV switch in one plan: loan, insurance, charger and energy contract?`,
  },
  {
    code: "PREPARE_RETIREMENT", label: "Prepare for retirement", goalType: "PREPARE_RETIREMENT", askThreshold: 0.5, suggestThreshold: 0.85, commercial: true,
    kateAsk: `Hi ${T} 👋 You've been looking at pension savings. Would you like to see where you stand for your retirement?`,
    kateSuggest: `Hi ${T} 👋 I can build your retirement plan: pension savings, tax benefits and investments, at your pace.`,
  },
];

export const t3IntentRules: IntentRule[] = [
  { moment: "HOME_BUYING", intent: "BUY_HOME", weight: 1, condition: null },
  { moment: "HOME_BUYING", intent: "RENOVATE_HOME", weight: 0.5, condition: null },
  { moment: "HOME_BUYING", intent: "RENOVATE_HOME", weight: 0.7, condition: { field: "moment.evidence", op: "contains", value: "RENOVATION_VIEW" } },
  { moment: "HOME_BUYING", intent: "REDUCE_ENERGY_COST", weight: 0.4, condition: null },
  { moment: "STARTING_BUSINESS", intent: "START_BUSINESS", weight: 1, condition: null },
  { moment: "NEW_PARENT", intent: "PREPARE_FOR_BABY", weight: 1, condition: null },
  { moment: "EV_PURCHASE", intent: "SWITCH_TO_EV", weight: 1, condition: null },
  { moment: "RETIREMENT_PREP", intent: "PREPARE_RETIREMENT", weight: 1, condition: null },
];

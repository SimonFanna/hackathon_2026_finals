// SHARED vocabulary — backend/TASKS.md §5. Owners may ADD codes; renaming needs everyone's agreement.

export const MOMENT_CODES = [
  "HOME_BUYING", "STARTING_BUSINESS", "NEW_PARENT", "EV_PURCHASE", "RETIREMENT_PREP", "CASHFLOW_PRESSURE",
] as const;
export type MomentCode = (typeof MOMENT_CODES)[number];

/** ML ground truth (`ml.customer_truth.life_moment`) → MomentCode. */
export const ML_LIFE_MOMENT_TO_MOMENT: Record<string, MomentCode> = {
  buy_house: "HOME_BUYING",
  start_business: "STARTING_BUSINESS",
  new_parent: "NEW_PARENT",
  buy_ev: "EV_PURCHASE",
  prepare_retirement: "RETIREMENT_PREP",
};

export const INTENT_CODES = [
  "BUY_HOME", "RENOVATE_HOME", "REDUCE_ENERGY_COST", "START_BUSINESS", "PREPARE_FOR_BABY", "SWITCH_TO_EV", "PREPARE_RETIREMENT",
] as const;
export type IntentCode = (typeof INTENT_CODES)[number];

export const GOAL_TYPES = [
  "BUY_AND_PREPARE_HOME", "START_BUSINESS", "WELCOME_BABY", "SWITCH_TO_EV", "PREPARE_RETIREMENT",
] as const;
export type GoalType = (typeof GOAL_TYPES)[number];

export const SIGNAL_CODES = [
  // home
  "MORTGAGE_SIMULATION", "HOUSING_BUDGET_VIEW", "PROPERTY_VALUATION_VIEW", "HOME_SEARCH_IN_APP", "RENOVATION_VIEW",
  "HOME_LOAN_KATE_QUESTION", "HOME_LOAN_APPLICATION", "SAVING_FOR_DOWN_PAYMENT", "NOTARY_PAYMENT",
  // business
  "FREELANCE_INCOME", "SALARY_STOPPED", "START_IT_VIEW", "BUSINESS_ACCOUNT_VIEW", "BUSINESS_KATE_QUESTION",
  "ACCOUNTING_TOOL_PAYMENT", "EQUIPMENT_PURCHASE",
  // other moments
  "BABY_SPENDING", "CHILD_BORN", "CHILDCARE_PAYMENT", "EV_PAGE_VIEW", "EV_LOAN_SIMULATION", "CAR_LOAN_ENDING",
  "EV_CHARGING", "PENSION_VIEW", "LUMP_SUM_INVESTMENT",
  // disruptions
  "INCOME_DROP", "BENEFITS_INFLOW", "LARGE_UNEXPECTED_EXPENSE", "COST_OVERRUN", "PARTNER_DELAY", "RATE_CHANGE",
] as const;
export type SignalCode = (typeof SIGNAL_CODES)[number];

export const CAPABILITY_CODES = [
  // home
  "estimate_budget", "find_property", "value_property", "inspect_property", "finance_property", "bridge_finance",
  "estimate_renovation", "identify_grants", "quote_insulation", "quote_heating", "quote_windows", "evaluate_solar",
  "finance_renovation", "insure_property", "insure_loan",
  // business
  "get_startup_support", "get_tax_legal_advice", "open_business_account", "set_up_invoicing", "accept_payments",
  "connect_accountant", "insure_liability", "insure_income", "build_pension",
] as const;
export type CapabilityCode = (typeof CAPABILITY_CODES)[number];

export const DISRUPTION_CODES = ["INCOME_DROP", "COST_OVERRUN", "PARTNER_DELAY", "UNEXPECTED_EXPENSE", "RATE_CHANGE"] as const;
export type DisruptionCode = (typeof DISRUPTION_CODES)[number];

export const REPLAN_STRATEGY_CODES = [
  "REDUCE_SCOPE", "EXTEND_TERM", "SWAP_PROVIDER", "REORDER", "ADD_PROTECTION", "MAXIMISE_GRANTS", "PAUSE",
] as const;
export type ReplanStrategyCode = (typeof REPLAN_STRATEGY_CODES)[number];

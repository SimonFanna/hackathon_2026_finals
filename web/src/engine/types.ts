export type Party = { kind: "kbc" } | { kind: "partner"; name: string };

export interface Customer { id: string; name: string; age: number; city: string; household: string }

export type SignalType =
  // Home
  | "property_search"
  | "mortgage_simulation"
  | "savings_transfer"
  | "epc_lookup"
  | "notary_contact"
  // Business
  | "start_it_visit"
  | "investment_loan_simulation"
  | "company_registration"
  | "first_customer_invoices";

export interface Signal { id: string; customerId: string; type: SignalType; label: string; source: string; observedAt: string }

/** How one goal is recognised from signals. Data, not code: a new goal is a new model. */
export interface IntentModel {
  intentId: string;
  label: string;
  weights: Partial<Record<SignalType, number>>;
  askThreshold: number;     // below: the engine deliberately does nothing
  suggestThreshold: number; // above: suggest proactively; between: ask first
}

export interface DetectedIntent {
  intentId: string;
  label: string;
  confidence: number;
  level: "none" | "ask" | "suggest"; // "none" = the engine deliberately does nothing
  needsConfirmation: boolean;
  reasons: string[];
}

export interface Outcome {
  customerEurOneOff?: number;   // one-off gain (grants, avoided overpay, recovered invoices)
  customerEurPerYear?: number;  // recurring yearly saving
  kwhPerYear?: number;
  co2KgPerYear?: number;
  kbcRevenueEur?: number;
  partnerValueEur?: number;
}

/** Chapter id, scoped to a journey (e.g. "find", "finance" for a home; "launch", "run" for a business). */
export type Chapter = string;

export interface JourneyStep {
  id: string;
  order: number;
  chapter: Chapter;
  title: string;
  why: string;
  /** Purpose line shown in the consent block ("So Setle can…"). */
  purpose?: string;
  ecosystem: string;
  catalogueItem: string;
  provider: Party;
  dataShared: string[];
  outcome: Outcome;
}

export interface Journey {
  intentId: string;
  title: string;
  chapters: { id: Chapter; label: string }[];
  steps: JourneyStep[];
}

export type StepDecision = "pending" | "accepted" | "skipped";

export interface JourneyState {
  journey: Journey;
  decisions: Record<string, StepDecision>;
  consents: Record<string, Record<string, boolean>>;
}

export interface Scoreboard {
  customer: { eurOneOff: number; eurPerYear: number; kwhPerYear: number; co2KgPerYear: number };
  kbc: { productsActivated: number; revenueEur: number };
  partners: { leads: number; valueEur: number };
}

// ─── Adaptive Outcome Engine ────────────────────────────────────────────────

/** The four constraints every goal is held to. Labels are per goal ("Move-in month", "Opening month"…). */
export type ConstraintKey = "cost" | "monthly" | "finish" | "buffer";

export interface ConstraintDef {
  key: ConstraintKey;
  label: string;
  /** "max": value must stay at or under the limit. "min": value must stay at or above it. */
  kind: "max" | "min";
  unit: "eur" | "eurMonth" | "month";
}

export type Metrics = Record<ConstraintKey, number>;

/** Where the plan stands (values) and what the customer can afford or accept (limits). */
export interface OutcomePlan { values: Metrics; limits: Metrics }

export interface Delta { values?: Partial<Metrics>; limits?: Partial<Metrics> }

export interface StepChange { stepId: string; note: string; shiftMonths?: number }

/** Generic re-planning moves. The same strategies serve every goal. */
export type Strategy = "keep" | "defer" | "substitute" | "refinance" | "rebalance" | "reorder" | "protect" | "bridge";

export interface PlanOption {
  id: string;
  label: string;
  strategy: Strategy;
  tradeoff: string;
  delta: Delta;
  /** Long-term cost the constraints don't show (extra interest, lost savings), in €. Lowers the score. */
  extraCostEur?: number;
  /** Only possible if the customer accepted this step earlier (e.g. an insurance). */
  requiresStep?: string;
  provider?: Party;
  catalogueItem?: string;
  changes?: StepChange[];
}

export type DisruptionKind = "cost" | "delay" | "income" | "rate" | "cashflow" | "health";

export interface Disruption {
  id: string;
  month: number;
  kind: DisruptionKind;
  title: string;
  detail: string;
  source: string;
  delta: Delta;
  affects: string[];
  options: PlanOption[];
}

export interface OutcomeModel {
  goal: string;
  goalReached: string;
  /** The month the story ends ("Move-in day", "End of the first season"). */
  horizon: number;
  horizonLabel: string;
  constraints: ConstraintDef[];
  baseline: OutcomePlan;
  /** Planned start month and duration of each step, from month 0. */
  schedule: Record<string, { start: number; months: number }>;
  disruptions: Disruption[];
}

export interface ConstraintCheck {
  key: ConstraintKey;
  value: number;
  limit: number;
  ok: boolean;
  /** How close to the edge: 1 = exactly at the limit, above 1 = broken. */
  usage: number;
}

export interface EvaluatedOption extends PlanOption {
  result: OutcomePlan;
  checks: ConstraintCheck[];
  available: boolean;
  feasible: boolean;
  health: number;
  score: number;
  recommended: boolean;
}

export interface Resolution {
  disruptionId: string;
  optionId: string;
  recommendedId: string;
  healthBefore: number;
  healthHit: number;
  healthAfter: number;
}

export interface Run {
  plan: OutcomePlan;
  month: number;
  /** Index of the next disruption to hit. */
  next: number;
  history: Resolution[];
  changes: Record<string, StepChange>;
}

export interface PendingHit {
  disruption: Disruption;
  hit: OutcomePlan;
  broken: ConstraintCheck[];
  healthBefore: number;
  healthHit: number;
  options: EvaluatedOption[];
}

export type StepStatus = "done" | "active" | "upcoming";

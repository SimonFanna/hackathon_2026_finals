// SHARED contract — copied verbatim from backend/TASKS.md §4. Add, don't break: new fields are optional.
import type { SignalCode, MomentCode, IntentCode, GoalType, CapabilityCode, DisruptionCode, ReplanStrategyCode } from "./vocabulary";
export type { SignalCode, MomentCode, IntentCode, GoalType, CapabilityCode, DisruptionCode, ReplanStrategyCode } from "./vocabulary";

// ===== Facts (T7 loads them; shape is fixed) =====
export interface CustomerFacts {
  asOf: string;                                   // ISO date the pipeline runs at (demo: "2026-10-01")
  customer: { id: number; slug: string | null; firstName: string; birthDate: string; region: string;
              maritalStatus: string; segment: string; language: "nl" | "fr" | "en" };
  employment: { status: string; monthlyNetIncome: number; since: string };
  housing: { status: "owner" | "tenant" | "with_parents"; monthlyRent: number | null };
  children: { birthDate: string }[];
  properties: { kind: "house" | "apartment"; buildYear: number; epcLabel: string | null; estimatedValue: number }[];
  accounts: { kind: string; balance: number; sourceRow: number | null }[];
  loans: { kind: string; monthlyPayment: number; outstanding: number; status: "active" | "repaid"; sourceRow: number | null }[];
  holdings: { sourceRow: number; status: "active" | "cancelled" }[];
  transactions: { id: string; bookedOn: string; amount: number; category: string; counterparty: string }[];
  appEvents: { id: string; occurredAt: string; channel: string; eventType: string; sourceRow: number | null; detail: Record<string, unknown> }[];
  injectedEvents: Event[];                        // demo / partner events (T7), already normalised
}

// ===== ① Events · ② Signals (T1) =====
export interface Event { id: string; customerId: number; at: string;
  source: "app" | "transaction" | "profile" | "partner";
  kind: string;                                   // "page_view" | "simulation" | "kate_question" | "tx:<category>" | "partner:<status>" | …
  sourceRow?: number; detail: Record<string, unknown> }
export interface Signal { code: SignalCode; customerId: number; strength: number; at: string;
  count: number; value?: number; evidence: string[] /* event ids */; isDisruption: boolean }

// ===== ③ Context (T1) =====
export interface PersistentContext {
  customerId: number; firstName: string; age: number; region: string; language: "nl" | "fr" | "en";
  household: "single" | "couple"; children: number; youngestChildAgeMonths: number | null;
  employment: string; monthlyIncome: number; housing: "owner" | "tenant" | "with_parents"; monthlyRent: number;
  savings: number; monthlyDebt: number; debtRatio: number;   // monthlyDebt / monthlyIncome
  heldSourceRows: number[];                                  // products, loans, accounts held
  properties: { kind: string; buildYear: number; epc: string | null; value: number }[];
  cashflowPressure: "low" | "medium" | "high";
}

// ===== ③ Moments · ④ Intents · ⑤ Decision (T2 + T3) =====
export interface Contribution { feature: string; value: number; weight: number; label: string }
export interface Prediction { confidence: number; contributions: Contribution[]; modelVersion: string }
export interface ActiveMoment { type: MomentCode; confidence: number; evidence: string[] /* signal codes */;
  contributions: Contribution[]; since: string; expiresAt: string; source: "ml" | "rules" }
export interface Intent { code: IntentCode; moment: MomentCode; confidence: number; goalType: GoalType | null }
export type DecisionLevel = "NO_ACTION" | "WAIT" | "ASK" | "SUGGEST";
export interface Decision { intent: IntentCode; level: DecisionLevel; reason: string; explanation: string[];
  confidence?: number; moment?: MomentCode; goalType?: GoalType | null }   // T3: so T8/UI can rank and route without re-joining
export interface Feedback { customerId: number; target: string /* intent or capability code */;
  kind: "yes" | "not_now" | "no" | "not_relevant"; at: string }

// ===== ⑥ Goal (T5 creates it from T8's confirmed answers) =====
export interface GoalConstraints { budget?: number; ownFunds?: number; maxMonthlyPayment?: number; deadline?: string; termYears?: number;
  ratePct?: number;                                                         // T6: loan rate used for financing (T5 defaults it)
  targetProperty?: { kind?: "house" | "apartment"; buildYear?: number; epc?: string | null; price?: number } }  // T5: a buyer has no property yet
export interface Goal { id: string; customerId: number; type: GoalType; status: "proposed" | "confirmed" | "at_risk" | "replanned" | "achieved" | "paused" | "abandoned";
  constraints: GoalConstraints; priorities: Priority[]; dependsOn: string[]; createdAt: string }
export type Priority = "affordability" | "energy_efficiency" | "speed" | "security";

// ===== ⑦ Registry (T4) =====
export interface Capability { code: CapabilityCode; label: string; ecosystem: string; whatItSolves: string;
  requiredData: string[]; output: string }
export interface Provider { capability: CapabilityCode; sourceRow: number; itemName: string;
  provider: string /* "KBC" or partner name */; isPartner: boolean; leadTimeDays: number;
  costEur: number | null; priority: number; estimates: Estimates }
export interface TemplateStep { goalType: GoalType; capability: CapabilityCode; chapter: string; position: number;
  dependsOn: CapabilityCode[]; condition: Condition | null; why: string /* may contain {placeholders} */; optional: boolean }
export interface GoalTemplate { goalType: GoalType; label: string; defaultConstraints: GoalConstraints;
  outcome: string; steps: TemplateStep[] }
export interface Estimates { customerEurOneOff?: number; customerEurPerYear?: number; kwhPerYear?: number;
  co2KgPerYear?: number; kbcRevenueEur?: number; partnerValueEur?: number; monthlyPayment?: number }
// Condition: tiny JSON logic evaluated against { ctx, goal } — e.g. {"any":[{"field":"ctx.properties.0.epc","op":"in","value":["D","E","F"]}, …]}
export type Condition = { all?: Condition[]; any?: Condition[]; not?: Condition;
  field?: string; op?: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "contains" | "exists"; value?: unknown };

// ===== ⑦–⑩ Plan, consent, outcome (T5) =====
export type StepStatus = "todo" | "accepted" | "skipped" | "in_progress" | "done" | "blocked" | "paused";
export type StepDisplay = "SHOW_STEP" | "SHOW_GUIDANCE" | "SHOW_PARTNER" | "ALREADY_COVERED" | "WAIT" | "HIDDEN";
export interface PlanStep { id: string; capability: CapabilityCode; chapter: string; order: number; provider: Provider;
  alternatives: Provider[]; dependsOn: string[]; status: StepStatus; display: StepDisplay; why: string;
  dataRequested: string[]; estimates: Estimates; eta: string | null;
  optional?: boolean; displayReason?: string }                              // T5: template flag + decision-rule reason
export interface ConstraintCheck { constraint: keyof GoalConstraints; ok: boolean; actual: number | string; limit: number | string; message: string }
export interface Plan { id: string; goalId: string; version: number; reason: "initial" | "replan" | "scenario";
  steps: PlanStep[]; checks: ConstraintCheck[]; atRisk: boolean; createdAt: string;
  summary?: { purchasePrice: number; renovationCost: number; grants: number; homeLoan: number; renovationLoan: number; monthlyPayment: number; ratePct: number } }  // T5
export interface Consent { goalId: string; stepId: string; partner: string; field: string; granted: boolean; at: string }
export interface Outcome { goalId: string; progressPct: number; stepsDone: number; stepsTotal: number;
  customer: { eurOneOff: number; eurPerYear: number; kwhPerYear: number; co2KgPerYear: number; handoffsAvoided: number };
  kbc: { productsActivated: number; revenueEur: number };
  partners: { leads: number; valueEur: number; providersCoordinated: number }; estimated: true }

// ===== ⑪ Disruption & scenarios (T6) =====
export interface Disruption { code: DisruptionCode; customerId: number; at: string; evidence: string[];
  delta: Partial<PersistentContext> & { costOverrunEur?: number; delayDays?: number; capability?: CapabilityCode;
    rateDeltaPct?: number; sourceRow?: number /* provider hit by COST_OVERRUN / PARTNER_DELAY */ } }  // T6
export interface Impact { goalId: string; disruption: DisruptionCode; broken: ConstraintCheck[]; affectedStepIds: string[]; severity: "low" | "medium" | "high" }
export interface Scenario { id: string; goalId: string; label: string; strategies: ReplanStrategyCode[];
  plan: Plan; goalPatch: Partial<GoalConstraints>; score: number; probabilityOfSuccess: number;
  tradeoffs: string[]; monthlyPayment: number | null; deadline: string | null;
  goalStatus?: Goal["status"] }                                             // T6: PAUSE sets the goal to "paused" on choose

// ===== Kate (T8) =====
export interface KateMessage { id: string; customerId: number; at: string; kind: "proactive" | "goal_setup" | "answer" | "scenario_choice" | "info";
  text: string; actions: { id: string; label: string }[]; refs: { intent?: IntentCode; goalId?: string; scenarioIds?: string[] } }

// ===== Rules bundle (T7 loads from Supabase or snapshot) =====
export interface RuleSet {
  signalRules: SignalRule[];            // T1
  modelWeights: ModelWeight[];          // T2
  momentRules: MomentRule[];            // T3
  intents: IntentDef[];                 // T3
  intentRules: IntentRule[];            // T3
  capabilities: Capability[];           // T4
  providers: Provider[];                // T4
  templates: GoalTemplate[];            // T4
  decisionRules: DecisionRule[];        // T5
  disruptionTypes: DisruptionType[];    // T6
  replanStrategies: ReplanStrategy[];   // T6
}
// Row types (each owner defines the exact fields in their task file and adds them here in ONE commit):
export interface SignalRule { code: SignalCode; match: { kind: string; sourceRows?: number[]; detail?: Condition; textAny?: string[] };
  strength: number; windowDays: number; halfLifeDays: number; isDisruption: boolean; label: string }
export interface ModelWeight { modelVersion: string; moment: MomentCode; feature: string; weight: number }
export interface MomentRule { moment: MomentCode; weights: Partial<Record<SignalCode, number>>; context: Condition | null; bias: number; expiryDays: number;
  label?: string;                                                           // T3: "buying a home" — for explanations
  contextScores?: { condition: Condition; score: number; label: string }[]; // T3: context facts added to the logit (rules fallback)
  requiresSignal?: boolean }                                                // T3: default true; false = context alone can open the moment
export interface IntentDef { code: IntentCode; label: string; goalType: GoalType | null; askThreshold: number; suggestThreshold: number;
  kateAsk: string; kateSuggest: string;
  commercial?: boolean }                                                    // T3: commercial intents WAIT under cashflow pressure
export interface IntentRule { moment: MomentCode; intent: IntentCode; weight: number; condition: Condition | null }
export interface DecisionRule { id: string; condition: Condition; effect: StepDisplay | "LOWER_PRIORITY"; priority: number; reason: string }
export interface DisruptionType { code: DisruptionCode; signals: SignalCode[]; affects: (keyof GoalConstraints)[]; kateTemplate: string }
export interface ReplanStrategy { code: ReplanStrategyCode; appliesTo: DisruptionCode[]; params: Record<string, unknown> }


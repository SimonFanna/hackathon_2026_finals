# Backend — Work split (8 independent tasks)

> Owner: Mathias · Last update: 11:00 · Design reference: `backend/backend.md`
>
> 8 tasks: **4 for Mathias, 4 for Simon**. Each task has its own file `backend/T<n>-*.md`.
> They can be built **in parallel** because every task:
> 1. codes against the **shared contract** below (types + vocabulary), never against another task's internals;
> 2. owns **its own files and its own migration**, so there are no merge conflicts;
> 3. **mocks its inputs** with its own fixtures until integration.

## 1. The split

| # | Task | Owner | Pipeline stages | Depends on (contract only) |
|---|---|---|---|---|
| **T1** | [Signals & context](T1-signals-context.md) | **Simon** | ① ② ③ (persistent context) | facts tables |
| **T2** | [ML confidence model](T2-ml-model.md) | **Simon** | ③ (moment confidence) | T1 signals + context |
| **T3** | [Moments, intents & decision gate](T3-moments-intents-decision.md) | **Mathias** | ③ (active moments) ④ ⑤ | T1 output, T2 `predict()` |
| **T4** | [Capability registry & goal templates](T4-capability-registry.md) | **Simon** | ⑦ (data + lookup) | catalogue tables |
| **T5** | [Orchestrator, rules, consent & tracker](T5-orchestrator-plan.md) | **Mathias** | ⑦ (planning) ⑧ ⑨ ⑩ | T4 registry |
| **T6** | [Disruption, replanning & scenarios](T6-disruption-replan.md) | **Mathias** | ⑪ + multi-goal + what-if | T1 signals, T5 planner |
| **T7** | [Data layer, persistence, pipeline & API](T7-data-pipeline-api.md) | **Simon** | everything wired + Supabase runtime + offline snapshot | all modules (by contract) |
| **T8** | [Kate](T8-kate.md) | **Mathias** | ⑤ → ⑥ messages, goal set-up, plan Q&A, scenario choice | T3 decision, T5 plan, T6 scenarios |

Simon gets the data side (facts → signals → ML → catalogue → storage/API), because he built the bank schema and the generator. Mathias gets the decision side (moments → plan → replanning → Kate).

## 2. Timeline (hard freeze 16:00)

| Time | Milestone |
|---|---|
| **11:15** | Mathias commits `web/src/backend/types.ts` = section 4 copied verbatim. Everyone pulls. |
| **11:30** | Each task: migration file created (empty tables OK), first module stub exporting its functions + 1 test. |
| **13:00** | Each task: module green on **its own fixtures**, seed data in Supabase. |
| **13:30** | T7 `npm run snapshot`: rules + demo facts exported to JSON. Fixtures can now be replaced by the real snapshot. |
| **14:00** | **Integration:** `runPipeline("sofie")` end-to-end (T7 leads, everyone fixes their module). |
| **14:45** | Demo scenarios pass (section 6). API stable for the UI. |
| **15:00** | **Backend feature freeze.** Only bug fixes, docs and Aikido fixes after this. |

## 3. Where the code lives (file ownership)

```text
web/src/backend/
  types.ts                      ← SHARED contract (Mathias commits; changes announced to everyone)
  vocabulary.ts                 ← SHARED codes (section 5) as TS string unions
  engine/
    events.ts  signals.ts  context.ts                         T1
    features.ts  model.ts  weights.json                       T2
    moments.ts  intents.ts  decision.ts  explain.ts           T3
    registry.ts                                               T4
    finance.ts  orchestrator.ts  rules.ts  consent.ts  tracker.ts   T5
    disruption.ts  replan.ts  scenarios.ts  arbitration.ts    T6
    kate/                                                     T8
  data/   (supabase client, loaders, repositories, snapshot/) T7
  pipeline.ts                                                 T7
  fixtures/<task>-*.ts          ← each task owns its own fixtures
web/src/app/api/**              T7 (except app/api/kate/** → T8)
scripts/ml/                     T2
supabase/migrations/            one file per task, timestamps below
```

- **Pure engine:** everything in `engine/` is a pure function `(inputs, rules) → output`. No network, no `Date.now()` (use `asOf`), no randomness. Tests use Vitest, next to the module (`*.test.ts`).
- **No imports between task modules except through `types.ts`**, plus these allowed calls: T3 → `T2 predict()`, T5 → `T4 registry`, T6 → `T5 buildPlan / checkConstraints / finance`, T8 → `T6 simulate()`. Until a dependency exists, stub it in your fixtures.
- The V0 engine (`web/src/engine/`) and the UI belong to kepa. Do not modify them. The UI will switch to our API.

**Migrations.** Each task gets a fixed timestamp, so files never collide:

| Task | Migration file | Tables |
|---|---|---|
| T1 | `20261020120000_signal_rules.sql` | `signal_rules` |
| T2 | `20261020120500_model_weights.sql` | `model_weights` |
| T3 | `20261020121000_intents.sql` | `moment_rules`, `intents`, `intent_rules` |
| T4 | `20261020121500_capabilities.sql` | `capabilities`, `capability_providers`, `goal_templates`, `template_steps` |
| T5 | `20261020122000_decision_rules.sql` | `decision_rules` |
| T6 | `20261020122500_disruptions.sql` | `disruption_types`, `replan_strategies` |
| T7 | `20261020123000_runtime.sql` | `injected_events`, `signals`, `customer_intents`, `goals`, `plans`, `plan_steps`, `scenarios`, `consents`, `kate_messages`, `feedback`, `outcomes` |

**Conventions:**
- Config tables: RLS on, `select` for `anon, authenticated`, writes revoked (same pattern as `20261020100000_catalog.sql`).
- Runtime tables: RLS on, **no policy**, so they are written only server-side with the secret key.
- Catalogue items are referenced by `source_row` (stable), never by assumed ids.
- Load the `supabase-postgres-best-practices` skill before writing a migration. Apply with the Supabase MCP or CLI, then run the advisors.

**Git:** work on your branch (`mathias`, `simon`) and merge into `main` at every green step. Before pushing: `npm run lint && npm test && npm run build` in `web/`.

## 4. Shared contract: `web/src/backend/types.ts`

```ts
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
export interface Decision { intent: IntentCode; level: DecisionLevel; reason: string; explanation: string[] }
export interface Feedback { customerId: number; target: string /* intent or capability code */;
  kind: "yes" | "not_now" | "no" | "not_relevant"; at: string }

// ===== ⑥ Goal (T5 creates it from T8's confirmed answers) =====
export interface GoalConstraints { budget?: number; ownFunds?: number; maxMonthlyPayment?: number; deadline?: string; termYears?: number }
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
  field?: string; op?: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "exists"; value?: unknown };

// ===== ⑦–⑩ Plan, consent, outcome (T5) =====
export type StepStatus = "todo" | "accepted" | "skipped" | "in_progress" | "done" | "blocked" | "paused";
export type StepDisplay = "SHOW_STEP" | "SHOW_GUIDANCE" | "SHOW_PARTNER" | "ALREADY_COVERED" | "WAIT" | "HIDDEN";
export interface PlanStep { id: string; capability: CapabilityCode; chapter: string; order: number; provider: Provider;
  alternatives: Provider[]; dependsOn: string[]; status: StepStatus; display: StepDisplay; why: string;
  dataRequested: string[]; estimates: Estimates; eta: string | null }
export interface ConstraintCheck { constraint: keyof GoalConstraints; ok: boolean; actual: number | string; limit: number | string; message: string }
export interface Plan { id: string; goalId: string; version: number; reason: "initial" | "replan" | "scenario";
  steps: PlanStep[]; checks: ConstraintCheck[]; atRisk: boolean; createdAt: string }
export interface Consent { goalId: string; stepId: string; partner: string; field: string; granted: boolean; at: string }
export interface Outcome { goalId: string; progressPct: number; stepsDone: number; stepsTotal: number;
  customer: { eurOneOff: number; eurPerYear: number; kwhPerYear: number; co2KgPerYear: number; handoffsAvoided: number };
  kbc: { productsActivated: number; revenueEur: number };
  partners: { leads: number; valueEur: number; providersCoordinated: number }; estimated: true }

// ===== ⑪ Disruption & scenarios (T6) =====
export interface Disruption { code: DisruptionCode; customerId: number; at: string; evidence: string[];
  delta: Partial<PersistentContext> & { costOverrunEur?: number; delayDays?: number; capability?: CapabilityCode } }
export interface Impact { goalId: string; disruption: DisruptionCode; broken: ConstraintCheck[]; affectedStepIds: string[]; severity: "low" | "medium" | "high" }
export interface Scenario { id: string; goalId: string; label: string; strategies: ReplanStrategyCode[];
  plan: Plan; goalPatch: Partial<GoalConstraints>; score: number; probabilityOfSuccess: number;
  tradeoffs: string[]; monthlyPayment: number | null; deadline: string | null }

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
export interface MomentRule { moment: MomentCode; weights: Partial<Record<SignalCode, number>>; context: Condition | null; bias: number; expiryDays: number }
export interface IntentDef { code: IntentCode; label: string; goalType: GoalType | null; askThreshold: number; suggestThreshold: number;
  kateAsk: string; kateSuggest: string }
export interface IntentRule { moment: MomentCode; intent: IntentCode; weight: number; condition: Condition | null }
export interface DecisionRule { id: string; condition: Condition; effect: StepDisplay | "LOWER_PRIORITY"; priority: number; reason: string }
export interface DisruptionType { code: DisruptionCode; signals: SignalCode[]; affects: (keyof GoalConstraints)[]; kateTemplate: string }
export interface ReplanStrategy { code: ReplanStrategyCode; appliesTo: DisruptionCode[]; params: Record<string, unknown> }

// vocabulary.ts exports: SignalCode, MomentCode, IntentCode, GoalType, CapabilityCode, DisruptionCode, ReplanStrategyCode
```

**Rule for changing the contract:** add, don't break. If you need a new field, add it as **optional** and post it in the team chat. Only Mathias edits `types.ts` itself; send him the diff.

## 5. Shared vocabulary (`vocabulary.ts`)

Owners may **add** codes. Renaming one needs everyone's agreement.

| Kind | Codes | Owner |
|---|---|---|
| **MomentCode** | `HOME_BUYING`, `STARTING_BUSINESS`, `NEW_PARENT`, `EV_PURCHASE`, `RETIREMENT_PREP`, `CASHFLOW_PRESSURE` | T3 |
| ↳ ML ground truth (`ml.customer_truth.life_moment`) | `buy_house`→`HOME_BUYING`, `start_business`→`STARTING_BUSINESS`, `new_parent`→`NEW_PARENT`, `buy_ev`→`EV_PURCHASE`, `prepare_retirement`→`RETIREMENT_PREP` | T2 |
| **IntentCode** | `BUY_HOME`, `RENOVATE_HOME`, `REDUCE_ENERGY_COST`, `START_BUSINESS`, `PREPARE_FOR_BABY`, `SWITCH_TO_EV`, `PREPARE_RETIREMENT` | T3 |
| **GoalType** | `BUY_AND_PREPARE_HOME` (hero), `START_BUSINESS` (generalisation); stretch: `WELCOME_BABY`, `SWITCH_TO_EV`, `PREPARE_RETIREMENT` | T4 |
| **SignalCode** (home) | `MORTGAGE_SIMULATION`, `HOUSING_BUDGET_VIEW`, `PROPERTY_VALUATION_VIEW`, `HOME_SEARCH_IN_APP`, `RENOVATION_VIEW`, `HOME_LOAN_KATE_QUESTION`, `HOME_LOAN_APPLICATION`, `SAVING_FOR_DOWN_PAYMENT`, `NOTARY_PAYMENT` | T1 |
| **SignalCode** (business) | `FREELANCE_INCOME`, `SALARY_STOPPED`, `START_IT_VIEW`, `BUSINESS_ACCOUNT_VIEW`, `BUSINESS_KATE_QUESTION`, `ACCOUNTING_TOOL_PAYMENT`, `EQUIPMENT_PURCHASE` | T1 |
| **SignalCode** (other moments) | `BABY_SPENDING`, `CHILD_BORN`, `CHILDCARE_PAYMENT`, `EV_PAGE_VIEW`, `EV_LOAN_SIMULATION`, `CAR_LOAN_ENDING`, `EV_CHARGING`, `PENSION_VIEW`, `LUMP_SUM_INVESTMENT` | T1 |
| **SignalCode** (disruptions) | `INCOME_DROP`, `BENEFITS_INFLOW`, `LARGE_UNEXPECTED_EXPENSE`, `COST_OVERRUN`, `PARTNER_DELAY`, `RATE_CHANGE` | T1 (detection), T6 (meaning) |
| **CapabilityCode** (home) | `estimate_budget`, `find_property`, `value_property`, `inspect_property`, `finance_property`, `bridge_finance`, `estimate_renovation`, `identify_grants`, `quote_insulation`, `quote_heating`, `quote_windows`, `evaluate_solar`, `finance_renovation`, `insure_property`, `insure_loan` | T4 |
| **CapabilityCode** (business) | `get_startup_support`, `get_tax_legal_advice`, `open_business_account`, `set_up_invoicing`, `accept_payments`, `connect_accountant`, `insure_liability`, `insure_income`, `build_pension` | T4 |
| **DisruptionCode** | `INCOME_DROP`, `COST_OVERRUN`, `PARTNER_DELAY`, `UNEXPECTED_EXPENSE`, `RATE_CHANGE` | T6 |
| **ReplanStrategyCode** | `REDUCE_SCOPE`, `EXTEND_TERM`, `SWAP_PROVIDER`, `REORDER`, `ADD_PROTECTION`, `MAXIMISE_GRANTS`, `PAUSE` | T6 |

## 6. Definition of done (whole backend): the demo checks

These run as `web/src/backend/pipeline.test.ts` (T7), on the snapshot, offline:

1. **Sofie** (`sofie`): `HOME_BUYING` detected with evidence, `BUY_HOME` at `ASK` or `SUGGEST`, and a Kate proactive message. After "yes" + constraints, a `BUY_AND_PREPARE_HOME` plan is built:
   - ≥ 10 steps, ≥ 3 partners, ordered by dependencies;
   - steps covering products she already holds are `ALREADY_COVERED`;
   - partner steps need consent.
2. **Sofie, income drop** (injected): `INCOME_DROP` disruption → plan `atRisk` → **2 scenarios** with different monthly payments, commercial non-urgent steps `WAIT`. Choosing one gives a new plan version, and the outcome is recomputed.
3. **Lucas** (`lucas`): `STARTING_BUSINESS` → `START_BUSINESS` plan, built by the **same code**.
4. **Els** (`els`) and **Thomas** (`thomas`): `NO_ACTION` (or `WAIT`) with a "why not" explanation.
5. **Kate:** answers "Why Setle before the loan?" and "What if the house costs €280k?" (the second goes through `simulate()`), with an offline fallback.
6. **Offline:** all of the above pass with Supabase unreachable (snapshot).

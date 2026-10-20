# Backend — KBC Outcome Engine

> Owner: Mathias · Status: design agreed, build starting · Last update: 11:20
>
> Read with `SOLUTION.md`, `docs/features/bank-data.md` (the facts in Supabase) and `docs/features/prediction-model.md` (the ML confidence model).
> The V0 engine in `web/src/engine/` was a brainstorming prototype. **This backend does not reuse its structure.**

## 1. Vision

**KBC Outcome Engine** is one universal pipeline. It turns any customer goal (buying a home, starting a business, preparing retirement…) into a concrete, personalised action plan, coordinated across KBC and its partners.

**Key innovation: the plan survives reality.** When something unexpected happens (job loss, exploding costs, a partner running late), the engine:
1. detects the event;
2. works out which goal constraints are now broken;
3. reorganises the journey to save the project;
4. lets the customer choose between scenarios.

The same engine:
- runs in every KBC ecosystem;
- handles several interdependent goals at once;
- simulates scenarios and arbitrates between solutions;
- tracks execution up to a measurable outcome.

The customer validates every decision, through **Kate**.

> We don't build an assistant that tells you what to do. We build a system that gets you to your goal, even when things don't go as planned.

The question the backend answers is not *"which product should we sell?"* but:

> **"What is the customer trying to achieve, which capabilities are required, who provides them, in what order, under which constraints, and how do we know the outcome was reached? And when reality changes, how do we still get there?"**

---

## 2. Global view

```text
              FACTS (Supabase, read-only)
  customers · employment · housing · properties · accounts
  loans · product_holdings · transactions · app_events
                        │
                        ▼
  ① EVENTS ──► ② SIGNALS ──► ③ CONTEXT ENGINE ──► ④ INTENT ENGINE
                                (persistent ctx       (intents with
                                 + active moments)     confidence)
                                                          │
                                                          ▼
                                                  ⑤ DECISION GATE
                                           NO_ACTION · WAIT · ASK · SUGGEST
                                                          │
                                                          ▼
                                       ⑥ GOAL CONFIRMATION ◄──── KATE
                                       (goal + constraints)      "Are you planning
                                                          │        to buy a home?"
                                                          ▼
                    ⑦ CAPABILITY ORCHESTRATOR ◄── Capability Registry
                       goal template → required capabilities → best provider
                                                          │
                                                          ▼
                    ⑧ DECISION & SUPPRESSION RULES (duplicates, cashflow…)
                                                          │
                                                          ▼
                    ⑨ CUSTOMER CONTROL & CONSENT ◄──── KATE (plan Q&A)
                                                          │
                                                          ▼
                    ⑩ EXECUTION + OUTCOME TRACKER
                                                          │
                     disruption detected (new facts)      │
                    ┌─────────────────────────────────────┘
                    ▼
                    ⑪ DISRUPTION → IMPACT → REPLAN → SCENARIOS A/B ──► KATE ──► customer picks
                    └──────────────────────────────► back to ⑦ with new constraints
```

---

## 3. Data sources: what we are allowed to use

**Rule:** we only use what KBC can observe itself, or what the customer gives us.
- **Allowed:**
  - customer master data;
  - products held, loans and accounts;
  - transactions;
  - behaviour **inside the KBC app or website** (page views, simulations, searches, Kate questions, applications started);
  - data the customer declares (e.g. the EPC label in a loan simulation);
  - partner status events through the Partner Hub, **after consent**.
- **Never used:** Google searches, external browsing, or third-party sites assumed to be visible to KBC.

Immoscoop counts only as a page **inside KBC Mobile**, i.e. a catalogue item the customer opened in our app. We never assume KBC sees what happens on immoscoop.be.

### Facts already in Supabase (built by Simon, see `bank-data.md`)

| Table | What the engine reads |
|---|---|
| `customers` | age (from `birth_date`), region, `marital_status`, `segment`, `language`, `is_demo` / `demo_slug` |
| `customer_employment` | `status`, `monthly_net_income_eur`, `since` |
| `customer_housing` | owner / tenant / with_parents, `monthly_rent_eur` |
| `customer_children` | number of children, ages |
| `properties` | `build_year`, **`epc_label`**, `estimated_value_eur` |
| `accounts` | balances (current, savings) → savings level |
| `loans` | active loans, `monthly_payment_eur` → debt ratio |
| `product_holdings` | products already held → **suppression of duplicates** |
| `transactions` | 34 categories: salary, rent, `savings_transfer`, `notary`, `freelance_income`, `benefits`… |
| `app_events` | `page_view` / `simulation` (`detail.amount`) / `search` / `kate_question` (`detail.question`) / `application_*`, each linked to an `ecosystem_item_id` |
| `ecosystems`, `partners`, `ecosystem_items` | the 229-item KBC catalogue (21 ecosystems, 28 partners) |

Demo personas (`is_demo`, ids 1–6): `sofie` (buy_house, hero), `lucas` (start_business), `nadia` (new_parent), `pieter` (buy_ev), `els` (nothing to suggest), `thomas` (hard negative).

---

## 4. The pipeline, stage by stage

All stages are **generic** and read their **rules from the database**. A new goal means new rows, not new code.

### ① Events: what happened?

Raw, immutable facts. They come from `app_events`, `transactions` and changes in the master data (new product, loan, employment status).

```ts
type Event = {
  id: string; customerId: number; at: string;
  source: "app" | "transaction" | "profile" | "partner";
  kind: string;                 // "page_view", "simulation", "tx:salary", "tx:benefits", …
  itemId?: number;              // ecosystem_items.id when the event concerns a catalogue item
  detail: Record<string, unknown>;
};
```

Sofie (real data):
- 4 home-loan simulations (€243k–€476k), 25 Aug–11 Sep;
- views of *Indicative online property valuation* ×3, *Estimate renovation costs and grants* ×2, *Calculate housing budget*;
- Kate question: *"Can I combine a home loan with a renovation loan?"*.

### ② Signals: what does it mean?

**An event is a fact. A signal is its interpretation.** Each signal has a strength, a time window and a decay rate.

Rules live in `signal_rules`. Each rule matches events (by kind, item and conditions on `detail`) and emits a signal:

```ts
type Signal = { code: string; customerId: number; strength: number; at: string; evidence: string[] /* event ids */ };
```

| Event | Signal | Strength |
|---|---|---|
| `simulation` on *Home loan* | `MORTGAGE_SIMULATION` (`amount`) | 0.40 |
| `page_view` on *Calculate housing budget* | `HOUSING_BUDGET_INTEREST` | 0.25 |
| `page_view` on *Estimate renovation costs and grants* | `RENOVATION_INTEREST` | 0.20 |
| `kate_question` mentioning a home loan | `HOME_LOAN_QUESTION` | 0.30 |
| `tx:savings_transfer` growing month over month | `SAVING_FOR_DOWN_PAYMENT` | 0.20 |
| `tx:notary` | `NOTARY_PAYMENT` | 0.50 |
| salary missing for 1 month, then `tx:benefits` appears | `INCOME_DROP` (disruption) | 0.90 |

Repeated signals saturate (diminishing returns) and decay with age.

### ③ Context engine: what is happening in their life?

There are two parts.

**Persistent context.** Combinable attributes computed from the facts. No giant categories.

```ts
type PersistentContext = {
  age: number; region: string; household: "single" | "couple"; children: number;
  employment: "employee" | "self_employed" | "business_owner" | "job_seeker" | "student" | "retired";
  monthlyIncome: number; housing: "owner" | "tenant" | "with_parents"; monthlyRent?: number;
  savings: number; monthlyDebt: number; debtRatio: number;
  heldItemIds: number[];        // product_holdings + loans + accounts → suppression
  properties: { buildYear: number; epc?: string; value: number }[];
  cashflowPressure: "low" | "medium" | "high";
};
```

**Active moments.** These come from signals and persistent context (`moment_rules`). Each moment has a confidence, evidence and an **expiry**.

```ts
type ActiveMoment = { type: "HOME_BUYING" | "STARTING_BUSINESS" | "NEW_PARENT" | "CAR_PROJECT" | "RETIREMENT_PREP" | "CASHFLOW_PRESSURE" | …;
  confidence: number; evidence: string[]; since: string; expiresAt: string };
```

**Confidence comes from the ML model** (`prediction-model.md`): a logistic regression per moment, with weights in `model_weights`. Rule-based scoring is the offline fallback. Both expose the same contract, and the per-feature weights feed **"Why am I seeing this?"**.

Sofie: `HOME_BUYING`, confidence 0.82 (evidence: 4 simulations, budget page, Kate question, €31k savings, tenant).

### ④ Intent engine: what does the customer probably want?

One moment produces several intents (`intent_rules`: moment → intent, with a weight and conditions on context).

```text
HOME_BUYING 0.82
  ├─ BUY_HOME              0.85
  ├─ RENOVATE_HOME         0.55   (renovation pages + old-property price range)
  └─ REDUCE_ENERGY_COST    0.35
```

Several intents stay active in parallel.

### ⑤ Decision gate: should we speak?

| Confidence / context | Decision |
|---|---|
| below the `ask` threshold | `NO_ACTION`: say nothing |
| strong but recent "not now" feedback | `WAIT` |
| between `ask` and `suggest` | `ASK`: Kate asks an open question |
| above `suggest` | `SUGGEST`: Kate proposes the goal directly |
| `CASHFLOW_PRESSURE` high | non-urgent commercial goals → `WAIT` |

The thresholds are per intent (`intents.ask_threshold`, `intents.suggest_threshold`).

> **The best recommendation is sometimes no recommendation.** `NO_ACTION` must always be possible. Els and Thomas prove it in the demo.

### ⑥ Goal confirmation through Kate

A detected intent never becomes an action by itself.

1. **Kate proactive notification.** The wording comes from the intent and the evidence:
   > *"Hi Sofie 👋 I noticed you've been looking at home loans lately. Are you planning to buy a home? I can put together your complete plan, from budget to keys (and renovation)."*
   > `[Yes, help me]` `[Not now]` `[No, not for me]`
2. **"Yes"** → Kate asks 2 or 3 short questions to fix the **goal constraints**. Values are pre-filled from the context, and the customer edits them.
3. **"Not now"** → feedback signal → `WAIT` for N weeks.
4. **"No"** → the moment is suppressed for 6 months. The feedback is stored, and it is ML training data.

```ts
type Goal = {
  id: string; customerId: number; type: "BUY_AND_PREPARE_HOME" | "START_BUSINESS" | …;
  status: "proposed" | "confirmed" | "at_risk" | "replanned" | "achieved" | "abandoned";
  constraints: { budget?: number; maxMonthlyPayment?: number; ownFunds?: number; deadline?: string };
  priorities: ("affordability" | "energy_efficiency" | "speed" | "security")[];
  dependsOnGoalIds?: string[];
};
```

Sofie: `BUY_AND_PREPARE_HOME`, budget €250k, own funds €30k, max €1,100/month, deadline in 6 months, priorities affordability + energy efficiency.

### ⑦ Capability Registry + Orchestrator: what is needed, and who provides it?

**Capability Registry.** The 229 catalogue items become **capabilities**: what can be done, not what is sold.

```ts
type Capability = {
  code: string;                  // "estimate_renovation_cost"
  label: string; ecosystem: string;
  whatItSolves: string;
  preconditions: Condition[];    // e.g. property identified
  requiredData: string[];        // data that would be shared with the provider
  output: string;                // "renovation budget + grants"
};
type Provision = { capabilityCode: string; itemId: number; provider: "KBC" | string /* partner */; leadTimeDays: number; costEur?: number; priority: number };
```

| Capability | Providers (catalogue items) |
|---|---|
| `estimate_budget` | KBC *Calculate housing budget* |
| `find_property` | Immoscoop *Search for a home* (in KBC Mobile) |
| `value_property` | KBC *Indicative online property valuation*, Immoscoop *Property valuation by an estate agent* |
| `finance_property` | KBC *Home loan* |
| `bridge_finance` | KBC *Bridging loan* (only if the customer owns a home) |
| `inspect_property` | De Immowinkel *Certificates and inspections* |
| `estimate_renovation` / `identify_grants` | Setle *Estimate renovation costs and grants* |
| `quote_insulation` / `quote_heating` / `quote_windows` | Impact us today |
| `evaluate_solar` | KBC *Calculate solar panels and request a quote* |
| `finance_renovation` | KBC *Renovation loan*, *Energy loan* |
| `insure_property` / `insure_loan` | KBC *Home insurance*, *Outstanding balance insurance* |

One capability can have **several providers**. That is what lets the orchestrator arbitrate and replan (for example, swap a provider when one is late).

**Goal templates** are ordered capabilities with **dependencies**, not a fixed list of products:

```text
BUY_AND_PREPARE_HOME
  estimate_budget
  find_property            ← estimate_budget
  value_property           ← find_property
  inspect_property (EPC)   ← find_property
  finance_property         ← value_property, estimate_budget
  estimate_renovation      ← inspect_property          [if EPC ≥ D or build_year < 1990]
  identify_grants          ← estimate_renovation
  quote_insulation         ← estimate_renovation
  quote_heating            ← estimate_renovation
  evaluate_solar           ← inspect_property
  finance_renovation       ← quotes, identify_grants
  insure_property          ← finance_property
  insure_loan              ← finance_property
OUTCOME: home bought + renovation plan financed
```

**Orchestrator algorithm:**
1. Load the template for the goal type.
2. Evaluate each step's conditions against context and goal (skip a step that does not apply).
3. For each capability, pick the best provider from the registry. Scoring uses: the customer's priorities, lead time, cost, whether the item is already held, and the provider's availability.
4. Topological sort on dependencies → ordered **Action Plan**, grouped in chapters (Find / Finance / Renovate / Protect).
5. Check plan-level constraints: total monthly payments ≤ `maxMonthlyPayment`, total cost ≤ budget + grants, end date ≤ deadline. If they fail, the plan is flagged `at_risk` with the reason.

```ts
type PlanStep = {
  id: string; capabilityCode: string; itemId: number; provider: string; chapter: string;
  dependsOn: string[]; status: "todo" | "suggested" | "accepted" | "skipped" | "in_progress" | "done" | "blocked";
  display: "SHOW_STEP" | "SHOW_GUIDANCE" | "SHOW_PARTNER" | "ALREADY_COVERED" | "WAIT" | "HIDDEN";
  why: string; dataRequested: string[]; estimates: Estimates; eta?: string;
};
```

### ⑧ Decision & suppression rules

`decision_rules` are applied after planning. Each rule has a condition and an effect on `display`:

| Condition | Effect |
|---|---|
| item (or equivalent) already held | `ALREADY_COVERED` (e.g. home insurance already held) |
| `CASHFLOW_PRESSURE` high | non-urgent commercial steps → `WAIT` |
| "not relevant" feedback on this capability in the last 90 days | lower priority / `HIDDEN` |
| step confidence low | `SHOW_GUIDANCE` (information only, no product) |
| partner step | `SHOW_PARTNER` → consent is required before anything is shared |

### ⑨ Customer control & consent

Every step: **Accept · Skip · Why am I seeing this? · What data will be shared, and with whom?**

- Every partner data field is **off by default**. No consent means no data shared and no lead.
- Consents are stored **per goal, per step, per partner, per field**, timestamped and revocable. This is an auditable ledger.

```ts
type Consent = { goalId: string; stepId: string; partner: string; field: string; granted: boolean; at: string };
```

Example: Setle receives `property_type`, `postal_code`, `renovation_budget` only if Sofie ticks them.

### ⑩ Execution + Outcome tracker

The journey does not stop at a recommendation. It follows the goal to the result.

```text
GOAL  Buy + prepare home        ███████████░░░ 72%
✓ Budget   ✓ Financing   ✓ Inspection   → Renovation estimate   ○ Grants   ○ Quotes   ○ Energy loan   ○ Insurance
```

KPIs, computed from the plan state:
- **Customer:** journey completion, time to outcome, identified grants (€), estimated savings (€/year, kWh, CO₂), hand-offs avoided.
- **KBC:** products activated, loan volume, retention / engagement.
- **Partners:** qualified leads (only with consent), conversion.

All €/kWh/CO₂ figures are **estimates** and are labelled as such in the UI.

### ⑪ Disruption → Impact → Replan → Scenarios (the innovation)

The tracker keeps listening to new facts. Some signals are tagged **disruptions** (`disruption_types`):

| Disruption | How KBC observes it | Broken constraint |
|---|---|---|
| `INCOME_DROP` (job loss) | salary transactions stop, `benefits` inflow appears, `customer_employment.status` changes | `maxMonthlyPayment`, borrowing capacity |
| `COST_OVERRUN` | renovation quote > estimate + X% (partner status event, after consent) | total budget |
| `PARTNER_DELAY` | partner status webhook: lead time exceeded | deadline, dependent steps |
| `UNEXPECTED_EXPENSE` | large one-off outflow (health, car) | own funds |
| `RATE_CHANGE` | new rate on simulation | monthly payment |

**Steps:**
1. **Impact analysis.** Recompute the persistent context and re-check the goal constraints. List the steps and constraints that are now broken, and how badly.
2. **Replan.** Generate candidate plans with **replanning strategies** (data in `replan_strategies`):
   - `REDUCE_SCOPE`: lower the budget, or phase the renovation (insulation now, solar later);
   - `EXTEND_TERM`: a longer loan to keep the monthly payment under the new cap;
   - `SWAP_PROVIDER`: another provider for the same capability (registry);
   - `REORDER`: un-block what can move forward, park what depends on the problem;
   - `ADD_PROTECTION`: add income-protection or outstanding-balance insurance;
   - `MAXIMISE_GRANTS`: identify grants first to absorb the overrun;
   - `PAUSE`: put the goal on hold without losing progress.
3. **Arbitrate.** Score each candidate on: probability of reaching the goal, cost, delay, customer priorities, and risk. Keep the 2 best as **scenarios A / B**, each with its trade-offs explained.
4. **Scenario simulation.** The same machinery runs *what-if* on a copy of the state ("what if I take a €280k house?", "what if my income drops 30%?"). Nothing is committed.
5. **Kate → customer validates.** Example:
   > *"Sofie, your income has changed, and your home plan is now above what you can comfortably repay. I've prepared two options."*
   > - **A**: a €220k home, renovation in 2 phases. Payment €890/month.
   > - **B**: keep €250k over 30 years and add outstanding-balance insurance. Payment €1,010/month.
   >
   > I've also paused the non-essential offers. Which one do you prefer?
6. The chosen scenario becomes the active plan: goal status `replanned`, with full history kept.

**Multiple interdependent goals.** Goals share constraints (monthly capacity, own funds). Example: `BUY_HOME` + `NEW_PARENT` + `BUY_EV`. The arbitration allocates a shared budget and orders goals by priority and deadline. One goal can `dependsOn` another (renovation after purchase). A disruption on one goal re-checks all goals that share a constraint.

---

## 5. Kate: where the engine talks to the customer

Kate is already in the catalogue (8 items), so this is native to KBC. Every interaction goes through her:

| Moment | Kate does |
|---|---|
| ⑤ → ⑥ `ASK` / `SUGGEST` | proactive notification + Yes / Not now / No |
| ⑥ goal set-up | 2–3 questions to confirm constraints (pre-filled) |
| ⑨ plan | answers questions **about the proposed plan**: "Why Setle before the loan?", "What if the house costs €280k?" (→ scenario simulation), "What do you share with Setle?" |
| ⑪ disruption | explains the impact, presents scenarios A/B, records the choice |
| always | "Why am I seeing this?" → evidence + model weights in plain language |

**Rule:** decisions stay **deterministic**, made by the engine. Kate's LLM only **phrases** and **answers questions grounded in the plan JSON**, the evidence and the rules. Kate never invents a product, price or rule, and never executes without explicit approval (KBC's own Kate principle). If a question needs a computation (what-if), Kate calls the engine's simulation, she does not guess.

Every Kate exchange is stored (`kate_messages`), and the replies become feedback signals.

**Offline fallback:** templated sentences for every notification, plus canned answers for the demo questions.

---

## 6. EPC (energy label)

The EPC (Energieprestatiecertificaat) is a home's energy label, from A+ to F. It is mandatory when a home is sold in Flanders.

- **Source:** `properties.epc_label` for owners, or the label the customer **declares** in a simulation or loan application. Never scraped.
- **Use:** condition for the renovation steps (`EPC ≥ D` or `build_year < 1990` → `estimate_renovation`, insulation/heating quotes, energy loan), and for estimating savings.
- **Wording:** "renovation needs identified via the EPC". We **do not** assert a legal renovation obligation (to be verified with KBC staff before any mention).

---

## 7. Data model

### Facts: exist (Simon), read-only
`customers`, `customer_children`, `customer_employment`, `customer_housing`, `properties`, `accounts`, `loans`, `product_holdings`, `transactions`, `app_events`, `ecosystems`, `partners`, `ecosystem_items`.

### Rules and config: to create (backend-owned, read-only for the API, seeded by migration)

| Table | Content |
|---|---|
| `signal_rules` | `code`, matching event kind / item / detail condition (jsonb), `strength`, `window_days`, `half_life_days`, `is_disruption` |
| `moment_rules` | `moment`, signal weights + context conditions, `expiry_days` (fallback if no ML weights) |
| `model_weights` | ML output (`prediction-model.md`): `model_version`, `moment`, `feature`, `weight`, `auc` |
| `intents` | `code`, `label`, `ask_threshold`, `suggest_threshold`, `goal_type`, `kate_ask_template`, `kate_suggest_template` |
| `intent_rules` | `moment` → `intent`, `weight`, context conditions |
| `capabilities` | `code`, `label`, `ecosystem`, `what_it_solves`, `preconditions`, `required_data`, `output` |
| `capability_providers` | `capability_code`, `ecosystem_item_id`, `lead_time_days`, `cost_eur`, `priority`, `estimates` (jsonb) |
| `goal_templates` | `goal_type`, `label`, `default_constraints`, `outcome_definition` |
| `template_steps` | `goal_type`, `capability_code`, `chapter`, `position`, `depends_on text[]`, `condition` (jsonb), `why_template` |
| `decision_rules` | `condition` (jsonb), `effect`, `priority` |
| `disruption_types` | `code`, `detection` (signal codes), `affected_constraints`, `kate_template` |
| `replan_strategies` | `code`, `applies_to` (disruption codes), `params` (jsonb) |

### Runtime state: to create (written server-side only)

| Table | Content |
|---|---|
| `signals` | computed signals with evidence (event ids) |
| `active_moments` / `customer_intents` | snapshot per customer: confidence, evidence, decision |
| `goals` | goal + constraints + priorities + status + `depends_on` |
| `plans` / `plan_steps` | versioned plans (`version`, `reason`: initial / replan / scenario), steps with status and display |
| `scenarios` | candidate plans after a disruption or what-if, with their scores |
| `consents` | ledger (goal, step, partner, field, granted, at) |
| `kate_messages` | notifications, questions and answers, customer replies |
| `feedback` | yes / not now / no / not relevant → suppression + ML labels |
| `outcomes` | KPI snapshots per goal |

**Security:**
- RLS is on everywhere.
- Config tables are readable by `anon` (non-sensitive). Runtime tables have no anon access; they are written only by Next.js route handlers using the secret key (never shipped to the browser).
- No secrets in git.

---

## 8. Code architecture (proposal)

- **Pure TypeScript engine, one module per stage:** `events`, `signals`, `context`, `intents`, `decision`, `goals`, `registry`, `orchestrator`, `rules`, `consent`, `tracker`, `disruption`, `replan`. Each is a pure function of `(facts, rules) → output`, tested with Vitest.
- **Data access layer:** loads facts and rules from Supabase server-side, with a **static JSON snapshot** of the rules and demo personas as the offline fallback.
- **API (Next.js route handlers):**

| Route | Does |
|---|---|
| `GET /api/customers/:slug/context` | stages ①–④: context, moments, intents, evidence |
| `GET /api/customers/:slug/decision` | stage ⑤ + the Kate message to show |
| `POST /api/goals` | Kate reply "yes" + constraints → goal → plan (⑥–⑧) |
| `POST /api/goals/:id/steps/:step` | accept / skip / status change |
| `POST /api/goals/:id/consents` | consent ledger |
| `POST /api/goals/:id/simulate` | what-if → scenarios (nothing committed) |
| `POST /api/customers/:slug/events` | demo: inject a new event (e.g. income drop) → disruption → scenarios |
| `POST /api/goals/:id/scenarios/:sid/choose` | apply the chosen scenario |
| `POST /api/kate/ask` | plan Q&A, grounded on the plan JSON |
| `GET /api/goals/:id/outcome` | tracker + triple-win KPIs |

- **Pipeline entry point:** `runPipeline(customerId, newEvents?)` → `{ context, moments, intents, decision, goals, plans, disruptions }`. The run is incremental: only the customers touched by new events are recomputed, which is the "millions of customers" story.

---

## 9. Demo scenarios

1. **Hero: Sofie buys a home.**
   - Her real signals produce a `HOME_BUYING` moment.
   - Kate asks; Sofie says yes and sets her constraints.
   - The orchestrator builds a 13-step plan across 5 providers. Home insurance is not held, so it is proposed.
   - Sofie consents to Setle, then asks Kate *"why Setle before the loan?"*.
2. **Disruption: Sofie's income drops.**
   - We inject a salary stop plus a `benefits` inflow.
   - The plan is flagged `at_risk` and the commercial steps are paused.
   - Scenarios A/B appear, Sofie picks one, and the plan and progress update.
3. **Generalisation: Lucas starts a business.**
   - Same engine, another template: Start it @KBC → Business PRO → Billit → Bancontact Pro → liability → guaranteed income → pension.
4. **Restraint: Els / Thomas.** `NO_ACTION`, and the "why not" is explained.

---

## 10. Design rules

1. Events are facts.
2. Signals are interpretations.
3. Context explains what is happening.
4. Intent estimates what the customer wants.
5. A goal is customer-confirmed and carries its constraints.
6. Capabilities describe what KBC and partners can do, and a capability can have several providers.
7. The orchestrator composes the journey from data.
8. The customer controls execution and data sharing, through Kate.
9. The journey ends in a measurable outcome.
10. When reality changes, the engine replans. It does not abandon.
11. `NO_ACTION` must always be possible.
12. The LLM phrases; the engine decides.

---

## 11. Open questions

- **Kate's LLM provider:** Gemini (Google Cloud credits) or Claude? It needs a server-side key in env only, plus a template fallback.
- Who builds the Kate UI (notification + chat + scenario cards) in `web/`? Align with the existing UX V1 (`ux-redesign.md`).
- **ML confidence:** agree the contract with the ML team (`model_weights` format + the features list, which must use the same signal codes as `signal_rules`).
- Can we name partners in the pitch? Can the EPC legal obligation be mentioned at all?

## 12. Status checklist

- [x] Pipeline + Kate + disruption design agreed (this doc)
- [x] Facts schema verified in Supabase (13 tables, 6 demo personas)
- [ ] Migration: rules/config tables + seed (signal rules, capabilities ↔ 229 items, 2 goal templates, decision rules, disruptions, strategies)
- [ ] Migration: runtime tables + RLS
- [ ] Engine stages ①–⑤ + tests
- [ ] Registry + orchestrator ⑦ + rules ⑧ + tests
- [ ] Consent ⑨ + tracker ⑩
- [ ] Disruption + replan + scenarios ⑪ + tests
- [ ] Multi-goal arbitration
- [ ] API route handlers
- [ ] Kate: notification, plan Q&A (LLM + fallback)
- [ ] Offline snapshot fallback
- [ ] Second goal template (start business) running end-to-end

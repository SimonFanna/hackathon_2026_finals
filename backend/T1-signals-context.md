# T1 — Signals & context

> Owner: **Simon** · Status: **done** (on main, b22aee3) · Last update: 11:44 · Pipeline stages ① ② ③ (persistent context)
> Read first: `backend/TASKS.md` (contract + vocabulary), `backend/backend.md` §3–4.

## Goal

Turn one customer's raw facts into:
1. normalised **events** (facts);
2. **signals** (interpretations, with strength, decay and evidence), driven by rules in the database;
3. the **persistent context** (stable, combinable attributes).

The rest of the pipeline only sees your output, never the raw tables. **Disruption signals** (income drop…) are detected here too.

## Interface (in `web/src/backend/engine/`)

```ts
// events.ts
export function toEvents(facts: CustomerFacts): Event[];
// signals.ts
export function extractSignals(events: Event[], rules: SignalRule[], asOf: string): Signal[];
// context.ts
export function buildContext(facts: CustomerFacts, signals: Signal[]): PersistentContext;
```

- **`toEvents`:**
  - `app_events` → `source:"app"`, `kind = event_type` (`page_view`, `simulation`, `search`, `kate_question`, `application_started`, `application_completed`), with `sourceRow` and `detail`;
  - `transactions` → `source:"transaction"`, `kind = "tx:" + category`, `detail = { amount, counterparty }`;
  - `facts.injectedEvents` are appended as is.
- **`extractSignals`:** for each rule, match the events inside the rule's window (`kind` + optional `sourceRows`, an optional `detail` condition, and `textAny` keywords on `detail.question` for Kate questions).
  - One signal per code. `count` = number of matching events; `value` = a relevant number (max simulation amount, monthly freelance income…); `evidence` = event ids.
  - **Strength:** `strength = rule.strength × saturation(count) × decay(age of the most recent event, halfLifeDays)`, with `saturation(n) = 1 − 0.5^n` (diminishing returns). Use `asOf`, never `Date.now()`.
- **Aggregate signals** that need a pattern rather than a single event:

  | Signal | Pattern |
  |---|---|
  | `SAVING_FOR_DOWN_PAYMENT` | `tx:savings_transfer` total over the last 3 months > total over the 3 months before × 1.3 |
  | `SALARY_STOPPED` / `INCOME_DROP` | a monthly `tx:salary` seen in earlier months is missing in the last full month (and `tx:benefits` appears → `BENEFITS_INFLOW`) |
  | `FREELANCE_INCOME` | ≥ 2 `tx:freelance_income` from ≥ 2 counterparties |
  | `CAR_LOAN_ENDING` | an active car loan ending within 6 months (from `loans`, via a profile event) |
  | `CHILD_BORN` | a child with `birthDate` within the last 6 months (profile event) |
  | `LARGE_UNEXPECTED_EXPENSE` | a one-off outflow > 2 × monthly income in health / car_maintenance / other |

  Implement them as rule `kind`s with a small named matcher (e.g. `kind: "pattern:saving_growth"`), so they are still declared in `signal_rules`.
- **`buildContext`:**
  - age from `birthDate` at `asOf`;
  - household from `maritalStatus` (married / cohabiting → couple);
  - savings = sum of savings + term-deposit balances; `monthlyDebt` = sum of active loan payments; `debtRatio`;
  - `heldSourceRows` = active holdings + active loans + accounts;
  - `cashflowPressure`: high if `debtRatio > 0.45` or an `INCOME_DROP` signal exists or the current balance is < 0.5 × monthly income; medium if `debtRatio > 0.33`; otherwise low.

## Database: `supabase/migrations/20261020120000_signal_rules.sql`

Create `signal_rules`:

| Column | Type |
|---|---|
| `code` | text pk |
| `label` | text, human sentence for "why" |
| `kind` | text |
| `source_rows` | int[], null = any |
| `detail_condition` | jsonb |
| `text_any` | text[] |
| `strength` | numeric |
| `window_days` | int |
| `half_life_days` | int |
| `is_disruption` | bool |

Config-table RLS pattern: readable by anon/authenticated, writes revoked. Seed every SignalCode in `TASKS.md` §5.

Starting rules (source_rows from the catalogue; tune the strengths freely):

| Code | Match | Strength |
|---|---|---|
| `MORTGAGE_SIMULATION` | `simulation` on row 2 (Home loan), value = max `detail.amount` | 0.45 |
| `HOUSING_BUDGET_VIEW` | `page_view` / `simulation` on row 18 | 0.25 |
| `PROPERTY_VALUATION_VIEW` | `page_view` on rows 16, 17 | 0.25 |
| `HOME_SEARCH_IN_APP` | `page_view` / `search` on row 15 (Immoscoop **inside KBC Mobile**) | 0.20 |
| `RENOVATION_VIEW` | `page_view` on rows 4, 12, 13, 131, 132 | 0.15 |
| `HOME_LOAN_KATE_QUESTION` | `kate_question`, `text_any` [home loan, mortgage, house, renovation loan] | 0.30 |
| `HOME_LOAN_APPLICATION` | `application_started` on row 2 | 0.80 |
| `NOTARY_PAYMENT` | `tx:notary` | 0.60 |
| `START_IT_VIEW` | `page_view` on rows 107, 109, 110 | 0.30 |
| `BUSINESS_ACCOUNT_VIEW` | `page_view` / `simulation` on rows 79, 121 | 0.30 |
| `ACCOUNTING_TOOL_PAYMENT` | `tx:accounting_software` | 0.35 |
| `EQUIPMENT_PURCHASE` | `tx:electronics` / `tx:business_supplies` > €800 | 0.15 |
| `BABY_SPENDING` | `tx:baby_kids` ≥ 2 | 0.40 |
| `EV_PAGE_VIEW` / `EV_LOAN_SIMULATION` | rows 27, 32 | 0.25 / 0.45 |
| `EV_CHARGING` | `tx:ev_charging` | 0.20 |
| `PENSION_VIEW` | rows 56–61 | 0.25 |
| `LUMP_SUM_INVESTMENT` | `tx:investment` > €10k | 0.35 |
| `INCOME_DROP` | `pattern:salary_missing` | 0.90, disruption |
| `COST_OVERRUN` / `PARTNER_DELAY` / `RATE_CHANGE` | `partner:quote_received` (amount > estimate) / `partner:delayed` / `simulation` rate change, all **injected events** | 0.90, disruption |

Check against the real data: Sofie must get `MORTGAGE_SIMULATION` (4 simulations, €243k–€476k), `HOUSING_BUDGET_VIEW`, `PROPERTY_VALUATION_VIEW`, `RENOVATION_VIEW` and `HOME_LOAN_KATE_QUESTION`.

## Fixtures you provide to others (by 11:45, in `fixtures/t1-*.ts`)

- `t1-sofie.ts`: hand-written `Signal[]` + `PersistentContext` for Sofie (from the real data: €2,619/month, tenant at €1,351, savings ≈ €31k, no loans). T3, T5 and T6 use it before integration.
- After T7's snapshot (13:30), export the **real** outputs for the 6 demo personas into `fixtures/t1-personas.json`.

## Steps

- [x] Migration + seed `signal_rules` (39 rules, one per SignalCode; source `fixtures/t1-signal-rules.json` → `scripts/ml/signal_rules_sql.py`); applied; advisors clean
- [x] `toEvents` + tests (app, tx, injected, profile `loan` / `child` / `employment` events; ids prefixed `app:` / `tx:` / `profile:`)
- [x] `extractSignals` (kind alternatives `a|b`, catalogue rows, detail condition, Kate keywords) + saturation/decay + tests
- [x] Patterns `saving_growth`, `salary_missing`, `income_drop`, `freelance` + tests; car loan ending, child born and large expense are plain rules on profile / tx events
- [x] `buildContext` + tests (observed income after an INCOME_DROP; high debt ratio is `high` only without a 3-month savings cushion)
- [x] `fixtures/t1-sofie.ts` (11:24); real facts of the 6 personas in `fixtures/t1-demo-facts.json` + acceptance tests `engine/t1-personas.test.ts`
- [x] Doc: status + `SOLUTION.md` log

New SignalCodes (T1 owns them): `HOME_LOAN_VIEW`, `BUSINESS_TOOLS_VIEW`, `BUSINESS_PROTECTION_VIEW`, `FAMILY_PROTECTION_VIEW`, `FAMILY_KATE_QUESTION`, `EV_KATE_QUESTION`, `ESTATE_PLANNING_VIEW`, `RETIREMENT_KATE_QUESTION`. Injected demo events must be dated ≤ `asOf`; `income_drop` = remove last month's `tx:salary` + `tx:benefits` from a non-child-benefit payer.

## Acceptance

- Pure functions, deterministic, no network.
- Sofie: ≥ 4 home signals, `cashflowPressure = "low"`, `housing = "tenant"`.
- Lucas: `FREELANCE_INCOME` present.
- Els: no strong home or business signal.
- Thomas: home signals present but weak (he is the hard negative; T3 decides).
- Injecting `{kind:"tx:benefits"}` + removing salary for Sofie → `INCOME_DROP` with `isDisruption: true`, and `cashflowPressure` rises.

## Improvement ideas

- Calibrate strengths from the data (T2 can report which signals matter most).
- Tests that run over all 2,000 customers, to check signal prevalence per moment.

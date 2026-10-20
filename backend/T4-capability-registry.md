# T4 — Capability registry & goal templates

> Owner: **Simon** · Status: todo · Last update: 11:00 · Pipeline stage ⑦ (data + lookup)
> Read first: `backend/TASKS.md`, `backend/backend.md` §4 ⑦.

## Goal

Turn the 229-item KBC catalogue into **capabilities** (what can be done), each with one or more **providers** (KBC or a partner item). Then describe each goal as a **template**: ordered capabilities with dependencies and conditions.

This is the data that makes the engine generic: **a new goal = new rows here, zero code.**

## Interface (`web/src/backend/engine/registry.ts`)

```ts
export function getTemplate(goalType: GoalType, rules: RuleSet): GoalTemplate;          // throws if unknown
export function providersFor(capability: CapabilityCode, rules: RuleSet): Provider[];    // sorted by priority
export function capability(code: CapabilityCode, rules: RuleSet): Capability;
export function coverageReport(rules: RuleSet, catalogue: { sourceRow: number; ecosystem: string }[]): { mapped: number; total: number; byEcosystem: Record<string, { mapped: number; total: number }> };
```

The coverage report feeds the pitch line "X of the 229 items are already wired as capabilities".

## Database: `supabase/migrations/20261020121500_capabilities.sql`

| Table | Columns |
|---|---|
| `capabilities` | `code` pk, `label`, `ecosystem`, `what_it_solves`, `required_data` text[], `output` |
| `capability_providers` | `capability_code` → capabilities, `source_row` → `ecosystem_items.source_row`, `lead_time_days`, `cost_eur`, `priority`, `estimates` jsonb (shape of `Estimates`); pk `(capability_code, source_row)` |
| `goal_templates` | `goal_type` pk, `label`, `default_constraints` jsonb, `outcome` |
| `template_steps` | `goal_type`, `capability_code`, `chapter`, `position`, `depends_on` text[] (capability codes), `condition` jsonb (`Condition`), `why` (template text with `{placeholders}`), `optional` bool |

Config-table RLS pattern. Add a unique constraint on `ecosystem_items.source_row` (it already exists) and an FK from `capability_providers.source_row`.

## Seed: hero `BUY_AND_PREPARE_HOME`

`source_row` values are verified against the catalogue.

| pos | chapter | capability | depends on | providers (source_row) | condition |
|---|---|---|---|---|---|
| 1 | Find | `estimate_budget` | — | 18 Calculate housing budget | |
| 2 | Find | `find_property` | estimate_budget | 15 Immoscoop search | |
| 3 | Find | `value_property` | find_property | 17 Indicative online valuation (KBC, fast, free), 16 Immoscoop estate-agent valuation | |
| 4 | Find | `inspect_property` | find_property | 14 De Immowinkel certificates & inspections | |
| 5 | Finance | `finance_property` | value_property, estimate_budget | 2 Home loan | not cash buyer |
| 6 | Finance | `bridge_finance` | finance_property | 3 Bridging loan | `ctx.housing = owner` (optional) |
| 7 | Renovate | `estimate_renovation` | inspect_property | 12 Setle | EPC in D/E/F **or** buildYear < 1990 |
| 8 | Renovate | `identify_grants` | estimate_renovation | 12 Setle | same |
| 9 | Renovate | `quote_insulation` | estimate_renovation | 131 Impact us today | same |
| 10 | Renovate | `quote_heating` | estimate_renovation | 132 Impact us today | same |
| 11 | Renovate | `quote_windows` | estimate_renovation | 13 Impact us today | optional |
| 12 | Renovate | `evaluate_solar` | inspect_property | 129 solar panels, 130 home battery | |
| 13 | Finance | `finance_renovation` | quote_insulation, quote_heating, identify_grants | 128 Energy loan, 4 Renovation loan | |
| 14 | Protect | `insure_property` | finance_property | 8 Home insurance, 9 Home assistance insurance | |
| 15 | Protect | `insure_loan` | finance_property | 10 Outstanding balance insurance | |

`default_constraints`: `{ termYears: 25 }`. The budget, own funds and max monthly payment come from the context at goal set-up (T5/T8).

## Seed: generalisation `START_BUSINESS`

| pos | chapter | capability | providers (source_row) |
|---|---|---|---|
| 1 | Start | `get_startup_support` | 107 Start it @KBC, 109 Boostpack |
| 2 | Start | `get_tax_legal_advice` | 110 Tax and legal advice for SMEs |
| 3 | Set up | `open_business_account` | 79 KBC Business PRO Account, 121 Business Account - Partner Hub |
| 4 | Get paid | `set_up_invoicing` | 86 Billit, 92 Soluz.io, 93 KBC Invoicing Services |
| 5 | Get paid | `accept_payments` | 123 Bancontact Pro Online, 122 Bancontact Pro In Store, 89 Payment terminals |
| 6 | Get paid | `connect_accountant` | 88 Send an expense claim to your accountant |
| 7 | Protect | `insure_liability` | 188 Professional liability, 187 Business liability |
| 8 | Protect | `insure_income` | 195 Guaranteed income insurance for the self-employed |
| 9 | Future | `build_pension` | 58 Supplementary pension for the self-employed, 61 Pension agreement for the self-employed |

**Stretch templates**, only if time allows:
- `WELCOME_BABY`: rows 75 Save for someone else, 157 Family insurance, 158 Accident insurance, 159 Life insurance.
- `SWITCH_TO_EV`: rows 37, 27, 32, 129, 52.
- `PREPARE_RETIREMENT`: rows 56, 57, 70, plus wealth/estate items.

## Estimates (illustrative, flagged as estimates in the UI)

Put rough figures in `capability_providers.estimates` and list each source or assumption in `docs/assumptions.md`:
- `customerEurOneOff`: grants, avoided overpay;
- `customerEurPerYear`, `kwhPerYear`, `co2KgPerYear`: insulation / heating / solar;
- `kbcRevenueEur`: loan margin, premium;
- `partnerValueEur`: lead value.

Add `leadTimeDays` too (e.g. Setle 7, Impact us today 21, De Immowinkel 10). T6 uses them for deadlines and delays.

## Fixtures

- By **11:45**, commit `fixtures/t4-rules.ts`: a `Partial<RuleSet>` with the two templates + providers above, hand-written. T5 and T6 build against it before the DB is ready.

## Steps

- [ ] Fixture `t4-rules.ts` (11:45)
- [ ] Migration + seed (capabilities, providers, templates, steps); apply; advisors clean
- [ ] `registry.ts` + tests (unknown goal throws, providers sorted, every template step has ≥ 1 provider, no dependency cycle)
- [ ] `coverageReport` + the number in `SOLUTION.md`
- [ ] Estimates + `docs/assumptions.md` entries
- [ ] Stretch templates
- [ ] Doc: status + `SOLUTION.md` log

## Acceptance

- Both templates load; every `depends_on` refers to a capability in the same template; there is no cycle.
- Every provider `source_row` exists in `ecosystem_items`.
- ≥ 2 capabilities have ≥ 2 providers. T6 needs this for `SWAP_PROVIDER` / arbitration.

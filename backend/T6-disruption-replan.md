# T6 — Disruption, replanning & scenarios

> Owner: **Mathias** · Status: todo · Last update: 11:00 · Pipeline stage ⑪ + multi-goal arbitration + what-if
> Read first: `backend/TASKS.md`, `backend/backend.md` §4 ⑪.

## Goal

**The innovation.** When reality changes (job loss, cost overrun, partner delay…), the engine:
1. detects which goals are hit;
2. measures which constraints break;
3. generates alternative plans with replanning strategies;
4. scores them and offers **2 scenarios** the customer chooses from (through Kate).

The same machinery answers **what-if** questions ("what if the house costs €280k?") and **arbitrates between several goals** that share money.

## Interface (`web/src/backend/engine/`)

```ts
// disruption.ts
export function detectDisruptions(signals: Signal[], before: PersistentContext, after: PersistentContext, rules: RuleSet, asOf: string): Disruption[];
export function assessImpact(d: Disruption, goal: Goal, plan: Plan, ctxAfter: PersistentContext): Impact;
// replan.ts
export function replan(goal: Goal, plan: Plan, ctx: PersistentContext, impact: Impact, rules: RuleSet, asOf: string): Scenario[];   // sorted by score, best 2 first
export function chooseScenario(goal: Goal, s: Scenario): { goal: Goal; plan: Plan };              // new plan version, goal status "replanned"
// scenarios.ts
export function simulate(goal: Goal, plan: Plan, ctx: PersistentContext, change: WhatIf, rules: RuleSet, asOf: string): Scenario[];  // nothing committed
export type WhatIf = { budget?: number; incomeDeltaPct?: number; termYears?: number; rateDeltaPct?: number; deadline?: string; dropCapabilities?: CapabilityCode[] };
// arbitration.ts
export function arbitrate(goals: Goal[], plans: Plan[], ctx: PersistentContext): { allocations: { goalId: string; maxMonthlyPayment: number; ownFunds: number; priority: number }[]; conflicts: string[] };
```

You **reuse T5**: `buildPlan(goal', ctx', rules, asOf, opts)`, `checkConstraints`, and `finance.ts` (`annuity`, `maxPrincipal`, `affordability`). Never duplicate the planning logic.

## How replanning works

1. **Impact.** Recompute `affordability(ctxAfter)`, then re-run `checkConstraints(plan, goal, ctxAfter)`. The broken checks plus the steps involved give `Impact`. Severity depends on how far over the limit we are.
2. **Candidates.** For each strategy whose `appliesTo` contains the disruption, build a candidate goal patch and/or plan options, then call `buildPlan`:

   | Strategy | Candidate |
   |---|---|
   | `REDUCE_SCOPE` | budget = `maxPrincipal(newMax, rate, term) + ownFunds`; renovation in 2 phases (drop `evaluate_solar` + `quote_windows` now, keep insulation + heating) |
   | `EXTEND_TERM` | `termYears` 25 → 30 (`params.maxTermYears`) |
   | `SWAP_PROVIDER` | `excludeProviders: [late or expensive one]` → next alternative |
   | `REORDER` | mark blocked steps `paused`, move independent steps forward |
   | `ADD_PROTECTION` | force `insure_loan` (row 10) + `insure_income` if self-employed |
   | `MAXIMISE_GRANTS` | move `identify_grants` first, count the grants against the overrun |
   | `PAUSE` | goal `paused`, progress kept, Kate follows up in N days |

   Strategies can be **combined** (e.g. `EXTEND_TERM + ADD_PROTECTION`).
3. **Score.** Each candidate gets:

   `score = 0.4·P(success) + 0.25·(1 − cost penalty) + 0.2·(1 − delay penalty) + 0.15·priority fit`

   `P(success)` = share of constraints satisfied, with margins (e.g. a payment at 85% of the max is safer than 99%). Weights are in `replan_strategies.params` or a constant (documented).
4. **Return the 2 best, and make them different** (different strategies). Each has a `label` ("Smaller home, renovate in 2 phases"), `tradeoffs[]`, `monthlyPayment` and `deadline`.

The hero demo numbers come from the real computation, not hard-coded:
- Sofie's income drops ~35% → a new max payment;
- **A** = `REDUCE_SCOPE` (≈ €220k, renovation in 2 phases);
- **B** = `EXTEND_TERM + ADD_PROTECTION` (keep ≈ €250k, 30 years, outstanding-balance insurance).

## Multi-goal arbitration

- Goals share `maxMonthlyPayment` and `ownFunds` from `affordability(ctx)`.
- Allocate by priority, then deadline. A goal that `dependsOn` another waits for it.
- `conflicts[]` explains what doesn't fit ("EV purchase and home purchase together exceed your monthly capacity by €210").
- A disruption on one goal re-runs `arbitrate` for all of them.
- Demo stretch: Sofie `BUY_AND_PREPARE_HOME` + `WELCOME_BABY`.

## Database: `supabase/migrations/20261020122500_disruptions.sql`

| Table | Columns | Seed |
|---|---|---|
| `disruption_types` | `code` pk, `signals` text[], `affects` text[], `kate_template` | `INCOME_DROP` (signals `INCOME_DROP`, `BENEFITS_INFLOW`; affects `maxMonthlyPayment`, `budget`), `COST_OVERRUN` (`budget`), `PARTNER_DELAY` (`deadline`), `UNEXPECTED_EXPENSE` (`ownFunds`), `RATE_CHANGE` (`maxMonthlyPayment`) |
| `replan_strategies` | `code` pk, `applies_to` text[], `params` jsonb | the 7 strategies above |

Config-table RLS pattern.

## Fixtures

- Inputs: `fixtures/t5-sofie-plan.ts` (~12:45). Until then, write `fixtures/t6-inputs.ts` with a hand-made goal + plan + context before/after.
- Output for T8 (by 13:30): `fixtures/t6-sofie-scenarios.ts`.

## Steps

- [ ] Migration + seed (disruption_types, replan_strategies)
- [ ] `detectDisruptions` (signals + context diff) + tests
- [ ] `assessImpact` + tests
- [ ] Strategies → candidates → `buildPlan` → score → top 2 distinct + tests (income drop, cost overrun, partner delay)
- [ ] `chooseScenario` (version++, goal `replanned`, history kept) + tests
- [ ] `simulate` (what-if, nothing mutated) + tests
- [ ] `arbitrate` + tests (2 goals that don't fit together)
- [ ] Fixture for T8
- [ ] Doc: status + `SOLUTION.md` log

## Acceptance

- Sofie + injected income drop: plan `atRisk`; 2 scenarios with **different** strategies and monthly payments both ≤ the new max; commercial non-urgent steps `WAIT` (via T5 rules on the new context).
- Partner delay on `quote_insulation`: a scenario with `SWAP_PROVIDER` or `REORDER` that meets the deadline.
- `simulate({ budget: 280000 })` returns a scenario with an updated payment and checks, and the original goal/plan objects are unchanged.
- All functions are pure; the inputs are never mutated (test it).

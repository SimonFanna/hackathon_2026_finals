# Feature — Backend T6: disruption, replanning, what-if, multi-goal arbitration
> Owner: Mathias (T6 agent) · Status: done on fixtures (integration with T7 pending) · Last update: 11:30

## Goal
Pipeline stage ⑪, the innovation. When reality changes (income drop, cost overrun, partner delay, unexpected expense, rate change), the engine:
1. detects the disruption from signals (T1) and from a context diff;
2. measures which goal constraints break and which steps are hit;
3. builds candidate plans with 7 replanning strategies, **by calling T5 `buildPlan` again** (no duplicated planning or money maths);
4. scores them and returns **2 different scenarios A/B**, which Kate (T8) presents and the customer chooses from.

The same machinery answers **what-if** questions (`simulate`) and **arbitrates** between goals that share one monthly capacity and one pot of own funds.

## How it works

### Files (`web/src/backend/engine/`)
| File | Exports |
|---|---|
| `disruption.ts` | `detectDisruptions(signals, before, after, rules, asOf, events?)`, `assessImpact(d, goal, plan, ctxAfter)`, `applyDisruption`, `severityOf`, `overshoot`, `purchasePriceOf` |
| `replan.ts` | `replan(goal, plan, ctx, impact, rules, asOf, disruption?)` → `Scenario[]` (A, B, then the rest), `chooseScenario(goal, s)`, `checkSafety`, `SCORE_WEIGHTS` |
| `scenarios.ts` | `simulate(goal, plan, ctx, change: WhatIf, rules, asOf)` → `[asked, fix1?, fix2?]` |
| `arbitration.ts` | `arbitrate(goals, plans, ctx)` → `{ allocations, conflicts }` |
| `replan-util.ts` | date / plan helpers shared by the four modules |

Fixtures: `fixtures/t6-inputs.ts` (rules = migration seed, signals and partner events) · **`fixtures/t6-sofie-scenarios.ts`** (output for T8/T7: income drop → impact → A/B → choice, and the €280k what-if).

Migration: `supabase/migrations/20261020122500_disruptions.sql` (**applied**). `disruption_types` (5 rows) and `replan_strategies` (7 rows). Config-table RLS: select for anon/authenticated, writes revoked. Security advisor: no new warning.

### Contract additions (in `types.ts`, all optional)
`GoalConstraints.ratePct`, `Disruption.delta.rateDeltaPct` + `sourceRow`, `Scenario.goalStatus`. Extra, optional args: `detectDisruptions(…, events?)` reads partner event details (capability, `overrunEur`, `delayDays`, `rateDeltaPct`); `replan(…, disruption?)` needs the disruption for overrun/delay/rate effects (**T7: always pass it**).

### Detection
- **Signals:** every `disruption_types.signals` code present → one disruption per code (evidence merged).
- **Context diff:** income −10% or more → `INCOME_DROP`; savings down ≥ 20% and ≥ €5,000 → `UNEXPECTED_EXPENSE`.

### Impact
The disruption is applied to **copies**: the overrun goes on the late quote's `provider.costEur` with the purchase price pinned (otherwise the implicit price absorbs it); delay → ETA shift on the step and its dependents; rate → loans re-priced. Then T5 `checkConstraints` runs against the new context. Severity: < 5% over / < 14 days → low; < 20% / < 60 days → medium; else high.

### Strategies → candidates (all through T5 `buildPlan` opts)
| Strategy | What it does |
|---|---|
| `REDUCE_SCOPE` | `dropCapabilities` solar + windows (phase 2), then **binary search on the budget** (€5k steps) until T5's money checks pass with the payment ≤ 95% of the max |
| `EXTEND_TERM` | `termYears` → 30; the budget search runs if the payment still doesn't fit. On an overrun: the envelope grows by the overrun, borrowed over the longer term |
| `SWAP_PROVIDER` | `excludeProviders` the late/expensive provider (only if the registry has another one) |
| `REORDER` | the late step and its dependents → `paused` (phase 2), everything else continues; the deadline is checked without paused steps |
| `ADD_PROTECTION` | `includeCapabilities` insure_loan (+ insure_income if self-employed). Combined with EXTEND_TERM (`params.combineWith`) |
| `MAXIMISE_GRANTS` | `includeCapabilities` identify_grants, forces the provider with the largest grant, moves it first |
| `PAUSE` | all open steps `paused`, deadline + 30 days, `goalStatus: "paused"`, progress kept |

Every candidate keeps the current providers (`forceProviders`) and the steps already started/done (`keepProgress`), then gets T5 `applyDecisionRules` on the new context, so commercial non-urgent steps go to `WAIT` under cashflow pressure.

### Score
`score = 0.4·P(success) + 0.25·(1 − cost) + 0.2·(1 − delay) + 0.15·priority fit`
- **P(success)** = mean safety of the checks. A satisfied check with margin scores 0.8 to 1 (a payment at ≤ 85% of the max = 1, at 99% ≈ 0.81). A broken one falls to 0 at +20% over or +60 days late. +0.05 with protection. PAUSE is fixed at 0.35 (unknown outcome).
- **cost** = extra total repaid vs a no-disruption reference plan (same date, same providers) ÷ (20% of the budget).
- **delay** = days later than the reference ÷ 180 (+30 days for a phase 2, + the pause).
- **priority fit** = mean of budget kept and one value per goal priority (affordability → payment safety, energy_efficiency → share of energy steps kept, speed → 1 − delay, security → protection).
- **Ranking:** feasible first, then score. The 2nd scenario must have a different main strategy and a payment at least €10 different.

### Hero numbers (from the engine, T5 fixtures, estimates)
Sofie: €250k all-in, €1,067/month. Income €2,619 → €1,800, so the max drops from €1,100 to €750 (high severity).
- **A** `EXTEND_TERM + ADD_PROTECTION`: "30-year loan (€200k) + outstanding-balance insurance", €736/month, P = 0.96.
- **B** `REDUCE_SCOPE`: "Smaller budget (€175k), renovate in 2 phases", €703/month, P = 0.92.
- What-if €280k: €1,213/month > €1,100 → fixes "Smaller budget (€245k), renovate in 2 phases" €1,042, and "Keep €280k over 30 years + insurance" €1,082.

### Arbitration
Active goals are ordered: dependencies first, then deadline, then creation date. Monthly capacity and own funds from `affordability(ctx)` are handed out greedily. Each shortfall gives a sentence, e.g. "EV purchase and home purchase together exceed your monthly capacity by €217."

## Decisions (and why)
- **Reuse T5, never re-implement:** every candidate is a real `buildPlan` result, so the scenario plans are exactly what the customer would get. The binary search costs about 10 builds (≈ 1 ms each).
- **Budget search instead of closed-form maths:** T5's money model (implicit purchase price, renovation loan, grants) stays the single source of truth.
- **Reference plan for delay/cost:** the original plan was built at an earlier `asOf`, so comparing ETAs to it would count elapsed time as delay.
- **Feasible-first ranking:** Kate never leads with an option that still breaks a limit. PAUSE and ADD_PROTECTION-alone stay available for the "other options" list.
- **Pure and deterministic:** no clock, no randomness. Inputs are never mutated (tested), and ids are derived from the plan id and the strategies.

## Known limits / improvement ideas
- A **cash-timing** disruption (client pays late, Victor's Lina event) and a `BRIDGE` strategy (overdraft / bridging credit) would cover business goals better. Lucas has no loan, so an income drop breaks nothing for him today.
- Insurance premiums are not counted in the monthly payment (T4 has no premium figures).
- `REORDER` uses a fixed 30-day penalty for phase 2. Real ETAs for phase 2 would need a T5 "soft dependency" option.
- The arbitration demand of a goal without a plan = its `maxMonthlyPayment` constraint.
- Victor's UI engine (`web/src/engine/outcome.ts`) uses its own strategies (`defer`, `substitute`, `refinance`, `protect`, `bridge`…). Once T7 exposes the API, the UI can show these backend scenarios instead.

## Status checklist
- [x] Migration + seed (applied, advisors clean)
- [x] `detectDisruptions` + tests (signals, context diff, partner events)
- [x] `assessImpact` + tests (income drop, overrun, delay, inputs untouched)
- [x] Strategies → `buildPlan` → score → 2 distinct + tests (income drop, overrun, delay with REORDER and SWAP, rate change, unexpected expense)
- [x] `chooseScenario` + tests (version, status, PAUSE → paused)
- [x] `simulate` + tests (€280k, income −35%, rate +1, nothing mutated)
- [x] `arbitrate` + tests (2 goals that don't fit, dependsOn, paused goals)
- [x] Fixture for T8 (`fixtures/t6-sofie-scenarios.ts`)
- [ ] Integration in `runPipeline` (T7) on the real snapshot

## Integration notes for T7
On every new fact batch: `detectDisruptions(signals, ctxBefore, ctxAfter, rules, asOf, events)` → for each active goal, `assessImpact(d, goal, plan, ctxAfter)` → if `impact.broken.length`: `replan(goal, plan, ctxAfter, impact, rules, asOf, d)` → Kate `kateForScenarios(impact, scenarios, ctxAfter, disruptionType, goal, d)`. **Pass `d` to both.** Customer picks → `chooseScenario(goal, scenario)` → store the new plan version (keep the old one) → `arbitrate(allGoals, plans, ctxAfter)` if the customer has more than one goal.

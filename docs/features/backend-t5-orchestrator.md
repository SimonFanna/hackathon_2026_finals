# Feature — Backend T5: orchestrator, decision rules, consent & outcome tracker

> Owner: Mathias (T5 agent) · Status: done (v1, on its own fixtures) · Last update: 11:25
> Spec: `backend/T5-orchestrator-plan.md` · Contract: `web/src/backend/types.ts` (T3 commits it)

## Goal

Pipeline stages ⑥ (goal creation), ⑦ (planning), ⑧ (suppression rules), ⑨ (consent) and ⑩ (outcome).
A confirmed goal becomes an ordered, explained action plan across KBC and partners. The customer accepts or skips steps and grants data per field. The tracker computes progress and the triple-win outcome (customer / KBC / partners), always flagged as estimates.

## How it works

| File (`web/src/backend/engine/`) | Role |
|---|---|
| `finance.ts` | `annuity`, `maxPrincipal`, `affordability(ctx)`, `DEFAULT_RATE_PCT`. Shared with T6. |
| `orchestrator.ts` | `createGoal`, `buildPlan`, `checkConstraints` |
| `rules.ts` | `applyDecisionRules`: sets each step's `display` + `displayReason`. The highest-priority matching rule wins; `LOWER_PRIORITY` moves a step with no dependents to the end. If the customer holds an alternative provider, it becomes the step's provider (then `ALREADY_COVERED`). Rule scope: `{ ctx, step: PlanStep + held/commercial/optional, fb: notRelevantDaysAgo/notNowDaysAgo/noDaysAgo }` |
| `consent.ts` | `applyStepAction` (pure; `done` is final), `setConsent` (append-only ledger, latest entry per goal/step/partner/field wins), `currentConsents`, `isGranted`, `sharedData` (requested ∩ granted, on accepted partner steps only), `isLead` |
| `tracker.ts` | `trackOutcome`: progress = accepted/in progress/done ÷ visible steps (not covered, hidden or skipped); € / kWh / CO₂ from engaged steps; partner leads need consent |
| `fixtures/t5-inputs.ts` | Hand-written Sofie/Lucas context, both templates + providers (T4 table), decision rules |
| `fixtures/t5-sofie-plan.ts` | Sofie's goal, plan (after rules) and outcome, plus `sofieCtxIncomeDrop` and Lucas's plan, for T6 and T8. Computed by the engine, so it never drifts |
| `supabase/migrations/20261020122000_decision_rules.sql` | `decision_rules` table + seed |

### Money maths (illustrative, see `docs/assumptions.md`)

- Annuity: `P · r / (1 − (1 + r)^−n)`, monthly rate `r = rate / 12`, `n = years × 12`. `maxPrincipal` is its inverse.
- `DEFAULT_RATE_PCT = 3.2` (illustrative 25-year fixed rate).
- `affordability(ctx)`:
  - `maxMonthlyPayment` = 42% of net income (debt-service-to-income cap), minus existing debt, rounded to the nearest €50;
  - `ownFunds` = savings rounded down to the nearest €5k (the rest stays as a buffer);
  - `maxPrincipal` = `maxPrincipal(maxMonthlyPayment, rate, 25)`.
- **`budget` = all-in project envelope** (purchase + works − grants), own funds included.
  - renovation = Σ `provider.costEur` of the works steps (`quote_insulation`, `quote_heating`, `quote_windows`, `evaluate_solar`);
  - grants = `identify_grants.estimates.customerEurOneOff`;
  - purchase price = `targetProperty.price` ?? budget − renovation + grants;
  - home loan = price − own funds (rate `ratePct ?? 3.2`); renovation loan = works − grants (energy loan, 3.25%), same term.
- Sofie (€2,619/month, €31k savings, 250k / 30k / 1,100): home €210k + works €48k − grants €8k = €250k. Home loan €180k (€872) + energy loan €40k (€195) = **€1,067/month ≤ €1,100**. Last step 2027-01-06. Not at risk.
- With an income drop (€1,800), affordability falls to €750/month and the `maxMonthlyPayment` check breaks. With a €280k house, `budget` and `maxMonthlyPayment` break.

### Checks (`ConstraintCheck.constraint`)

| Key | Rule |
|---|---|
| `maxMonthlyPayment` | Σ `estimates.monthlyPayment` of active steps ≤ min(goal limit, `affordability(ctx)`). The context is live, so a disruption in `ctx` breaks it by itself. |
| `budget` | purchase + works − grants ≤ budget |
| `ownFunds` | goal own funds ≤ `ctx.savings` |
| `deadline` | latest step ETA ≤ deadline |

### `buildPlan` options (for T6)

`excludeProviders`, `forceProviders`, `dropCapabilities`, `includeCapabilities` (forces a step past its condition), `costOverrides` (absolute €), `extraLeadDays` (delta), `version`, `reason`. Step ids are `<goalId>:<capability>`, stable across versions.

## Decisions (and why)

- `goal.constraints.maxMonthlyPayment` is the cap on the **new** payments of this goal. Existing debt is already removed by `affordability()`, so the check does not count it twice.
- Provider score = `priority` + priority fit (affordability → cheaper, speed → shorter lead time, energy efficiency → more kWh saved). The result is deterministic, ties broken by `sourceRow`.
- Topological sort tie-broken by template `position`. ETA = asOf + the longest lead-time chain through the dependencies.
- A partner lead counts only when the step is accepted **and** at least one field is granted.

## Known limits / improvement ideas

- The DSTI cap and the rate are illustrative constants, not KBC credit policy.
- Grants are counted from `identify_grants` estimates only.
- With no target price, the purchase price is derived from the budget, so the budget check always passes. Once a house is chosen (or on a cost overrun), set `targetProperty.price`.
- `T4` should put the **works price** in `costEur` for the quote / solar providers (≈ €48k in total, which matches the sourced Setle average).
- The local `getTemplate` / provider lookup duplicates T4 `registry.ts`; switch to it once it lands.

## Status checklist

- [x] `finance.ts` + tests
- [x] `createGoal` + tests
- [x] `buildPlan` + tests
- [x] `checkConstraints` + tests
- [x] migration + seed `decision_rules` (applied to Supabase, advisors clean), `applyDecisionRules` + tests
- [x] `applyStepAction`, `setConsent`, `sharedData` + tests
- [x] `trackOutcome` + tests
- [x] fixture `t5-sofie-plan.ts` for T6 / T8
- [ ] Swap my fixtures for T1 `t1-sofie.ts` / T4 `t4-rules.ts` / the T7 snapshot once they land
- [x] `SOLUTION.md` log

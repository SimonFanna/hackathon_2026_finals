# Feature — Backend T5: orchestrator, decision rules, consent & outcome tracker

> Owner: Mathias (T5 agent) · Status: in progress · Last update: 11:20
> Spec: `backend/T5-orchestrator-plan.md` · Contract: `web/src/backend/types.ts` (T3 commits it)

## Goal

Pipeline stages ⑥ (goal creation), ⑦ (planning), ⑧ (suppression rules), ⑨ (consent) and ⑩ (outcome).
A confirmed goal becomes an ordered, explained action plan across KBC and partners. The customer accepts or skips steps and grants data per field. The tracker computes progress and the triple-win outcome (customer / KBC / partners), always flagged as estimates.

## How it works

| File (`web/src/backend/engine/`) | Role |
|---|---|
| `finance.ts` | `annuity`, `maxPrincipal`, `affordability(ctx)`, `DEFAULT_RATE_PCT`. Shared with T6. |
| `orchestrator.ts` | `createGoal`, `buildPlan`, `checkConstraints` |
| `rules.ts` | `applyDecisionRules`: sets each step's `display` (`ALREADY_COVERED`, `WAIT`, `HIDDEN`, `SHOW_PARTNER`, `SHOW_GUIDANCE`, `SHOW_STEP`) |
| `consent.ts` | `applyStepAction`, `setConsent`, `sharedData` |
| `tracker.ts` | `trackOutcome` |
| `fixtures/t5-inputs.ts` | Hand-written context + registry until T1/T4 fixtures land |
| `fixtures/t5-sofie-plan.ts` | Sofie's goal + plan, for T6 and T8 |
| `supabase/migrations/20261020122000_decision_rules.sql` | `decision_rules` table + seed |

### Money maths (illustrative, see `docs/assumptions.md`)

- Annuity: `P · r / (1 − (1 + r)^−n)`, monthly rate `r = rate / 12`, `n = years × 12`. `maxPrincipal` is its inverse.
- `DEFAULT_RATE_PCT = 3.2` (illustrative 25-year fixed rate).
- `affordability(ctx)`:
  - `maxMonthlyPayment` = 42% of net income (debt-service-to-income cap), minus existing debt, rounded to the nearest €50;
  - `ownFunds` = savings rounded down to the nearest €5k (the rest stays as a buffer);
  - `maxPrincipal` = `maxPrincipal(maxMonthlyPayment, rate, 25)`.
- Sofie (€2,619/month, €31k savings): max ≈ €1,100/month, own funds €30k, so a €250k budget is a €220k loan ≈ €1,066/month. It fits.

## Decisions (and why)

- `goal.constraints.maxMonthlyPayment` is the cap on the **new** payments of this goal. Existing debt is already removed by `affordability()`, so the check does not count it twice.
- Provider score = `priority` + priority fit (affordability → cheaper, speed → shorter lead time, energy efficiency → more kWh saved). The result is deterministic, ties broken by `sourceRow`.
- Topological sort tie-broken by template `position`. ETA = asOf + the longest lead-time chain through the dependencies.
- A partner lead counts only when the step is accepted **and** at least one field is granted.

## Known limits / improvement ideas

- The DSTI cap and the rate are illustrative constants, not KBC credit policy.
- Grants are counted from `identify_grants` estimates only.

## Status checklist

- [ ] `finance.ts` + tests
- [ ] `createGoal` + tests
- [ ] `buildPlan` + tests
- [ ] `checkConstraints` + tests
- [ ] migration + seed `decision_rules`, `applyDecisionRules` + tests
- [ ] `applyStepAction`, `setConsent`, `sharedData` + tests
- [ ] `trackOutcome` + tests
- [ ] fixture `t5-sofie-plan.ts` for T6 / T8
- [ ] `SOLUTION.md` log

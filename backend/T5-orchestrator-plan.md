# T5 — Orchestrator, rules, consent & outcome tracker

> Owner: **Mathias** · Status: todo · Last update: 11:00 · Pipeline stages ⑥ (goal creation) ⑦ (planning) ⑧ ⑨ ⑩
> Read first: `backend/TASKS.md`, `backend/backend.md` §4 ⑥–⑩.

## Goal

From a confirmed goal, **compose the action plan**:
1. pick the template;
2. evaluate the conditions;
3. choose the best provider per capability;
4. order the steps by dependencies;
5. check the goal constraints.

Then apply the suppression rules, manage accept / skip / consent, and compute progress and the triple-win outcome.

## Interface (`web/src/backend/engine/`)

```ts
// finance.ts — shared money maths (T6 uses it too)
export function annuity(principal: number, annualRatePct: number, termYears: number): number;    // monthly payment
export function maxPrincipal(monthlyPayment: number, annualRatePct: number, termYears: number): number;
export function affordability(ctx: PersistentContext): { maxMonthlyPayment: number; maxPrincipal: number; ownFunds: number }; // e.g. 33% of income − existing debt
export const DEFAULT_RATE_PCT = 3.2;   // illustrative, flagged in docs/assumptions.md

// orchestrator.ts
export function createGoal(input: { customerId: number; type: GoalType; constraints: GoalConstraints; priorities: Priority[] }, ctx: PersistentContext, rules: RuleSet, asOf: string): Goal;   // fills missing constraints from affordability()
export function buildPlan(goal: Goal, ctx: PersistentContext, rules: RuleSet, asOf: string, opts?: { excludeProviders?: number[]; forceProviders?: Partial<Record<CapabilityCode, number>>; dropCapabilities?: CapabilityCode[]; version?: number; reason?: Plan["reason"] }): Plan;
export function checkConstraints(plan: Plan, goal: Goal, ctx: PersistentContext): ConstraintCheck[];
// rules.ts
export function applyDecisionRules(plan: Plan, ctx: PersistentContext, feedback: Feedback[], rules: RuleSet): Plan;
// consent.ts
export function applyStepAction(plan: Plan, stepId: string, action: "accept" | "skip" | "start" | "done" | "block"): Plan;
export function setConsent(consents: Consent[], c: Omit<Consent, "at">, asOf: string): Consent[];
export function sharedData(plan: Plan, consents: Consent[]): { partner: string; fields: string[] }[];   // what each partner actually receives
// tracker.ts
export function trackOutcome(goal: Goal, plan: Plan, consents: Consent[]): Outcome;
```

The `opts` of `buildPlan` exist **for T6**: replanning = calling `buildPlan` again with different options or constraints.

### `buildPlan` algorithm
1. Load the template (`registry.getTemplate`).
2. Drop steps whose `condition` is false (`evalCondition` from T3's `condition.ts`) or that appear in `dropCapabilities`.
3. For each capability, rank `providersFor()`:
   - honour `forceProviders` and `excludeProviders`;
   - score = `priority` + preference fit (`affordability` → lower cost; `speed` → lower `leadTimeDays`; `energy_efficiency` → higher kWh saved).

   The best one becomes `provider`; the rest go into `alternatives`.
4. Topological sort on `dependsOn`, tie-broken by template `position`. ETAs = asOf + cumulated lead times along the dependency chain.
5. `why` = the template text with placeholders filled (`{epc}`, `{buildYear}`, `{budget}`…). `dataRequested` = `capability.requiredData` when the provider is a partner, otherwise `[]`.
6. Estimates: the provider's `estimates`. For `finance_property`, `monthlyPayment = annuity(budget − ownFunds, rate, termYears)`.
7. `checks = checkConstraints(...)`; `atRisk = checks.some(c => !c.ok)`.

### `checkConstraints`
- Sum of new monthly payments + `ctx.monthlyDebt` ≤ `maxMonthlyPayment` (+ existing debt).
- Price + renovation − grants ≤ budget + own funds.
- The last ETA ≤ deadline.

Each check produces a readable `message`.

## Decision & suppression rules: `supabase/migrations/20261020122000_decision_rules.sql`

`decision_rules(id pk, condition jsonb, effect text, priority int, reason text)`. The condition scope is `{ ctx, goal, step }`. Seed:

| Condition | Effect | Reason |
|---|---|---|
| `step.provider.sourceRow` ∈ `ctx.heldSourceRows` | `ALREADY_COVERED` | "You already have this with KBC" |
| `ctx.cashflowPressure = high` and the step is commercial and not essential | `WAIT` | "Paused while your finances settle" |
| feedback `not_relevant` on this capability < 90 days | `LOWER_PRIORITY` / `HIDDEN` | "You told us this wasn't relevant" |
| `step.provider.isPartner` | `SHOW_PARTNER` | "Shared only with your consent" |
| capability is advice-only | `SHOW_GUIDANCE` | |

Config-table RLS pattern.

## Consent rules

- Every partner field defaults to **not granted**.
- A partner lead counts only if the step is accepted **and** ≥ 1 field is granted.
- Revoking is allowed at any time.
- `sharedData()` is what the UI shows under "What will be shared, and with whom?".

## Outcome

- `progressPct` = done-or-accepted steps / visible steps (excluding `ALREADY_COVERED` and `HIDDEN`).
- Customer € / kWh / CO₂ come from accepted steps.
- `handoffsAvoided` = the number of distinct providers coordinated − 1.
- KBC: products activated and revenue; partners: leads and value.
- Always `estimated: true`.

## Fixtures

- Inputs: `fixtures/t1-sofie.ts` (context) and `fixtures/t4-rules.ts` (registry), both due ~11:45. Before then, write a minimal `fixtures/t5-inputs.ts` yourself.
- Output for T6/T8 (by 12:45): `fixtures/t5-sofie-plan.ts` with Sofie's goal + plan.

## Steps

- [ ] `finance.ts` + tests (annuity matches a known value; maxPrincipal is its inverse)
- [ ] `createGoal` (defaults from affordability) + tests
- [ ] `buildPlan`: conditions, provider choice, topo sort, ETAs, why, estimates + tests
- [ ] `checkConstraints` + tests (a plan breaking each constraint)
- [ ] Migration + seed `decision_rules`; `applyDecisionRules` + tests
- [ ] `applyStepAction`, `setConsent`, `sharedData` + tests
- [ ] `trackOutcome` + tests
- [ ] Fixture for T6 / T8
- [ ] Doc: status + `SOLUTION.md` log

## Acceptance

- Sofie (tenant, no property yet; EPC unknown until a property is chosen → assume `buildYear` 1975 / EPC E from the goal set-up): ≥ 12 steps, ≥ 4 providers, 3 partners. The order respects the dependencies, and `atRisk = false` with her default constraints.
- `insure_property`: when Sofie already holds Home insurance (row 8), the step shows `ALREADY_COVERED`.
- No consent → `partners.leads = 0`, even if the steps are accepted.
- `START_BUSINESS` for Lucas builds with the **same code**.

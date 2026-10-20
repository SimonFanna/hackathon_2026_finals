# T3 — Moments, intents & decision gate

> Owner: **Mathias** · Status: todo · Last update: 11:00 · Pipeline stages ③ (active moments) ④ ⑤
> Read first: `backend/TASKS.md`, `backend/backend.md` §4 ③–⑤.

## Goal

From signals + context, decide **what is happening** (active moments with a confidence), **what the customer probably wants** (intents), and **whether we should speak at all** (`NO_ACTION · WAIT · ASK · SUGGEST`). Every decision must be explainable.

## Interface (`web/src/backend/engine/`)

```ts
// moments.ts
export function detectMoments(signals: Signal[], ctx: PersistentContext, rules: RuleSet, asOf: string): ActiveMoment[];
// intents.ts
export function deriveIntents(moments: ActiveMoment[], ctx: PersistentContext, rules: RuleSet): Intent[];
// decision.ts
export function decide(intents: Intent[], moments: ActiveMoment[], ctx: PersistentContext, feedback: Feedback[], goals: Goal[], rules: RuleSet, asOf: string): Decision[];
// explain.ts
export function explainMoment(m: ActiveMoment): string[];        // "You ran 4 home-loan simulations (up to €476k)"
export function explainNoAction(d: Decision): string[];          // "Signals too weak / not now / already in a goal"
// shared helper, used by T4/T5/T6 too:
export function evalCondition(cond: Condition | null, scope: { ctx: PersistentContext; goal?: Goal }): boolean;  // condition.ts
```

### `detectMoments`
- For each moment:
  - If `predict()` (T2) returns a prediction, use it (`source:"ml"`).
  - Otherwise use the **rule fallback** from `moment_rules`: `sigmoid(bias + Σ weight[code] × signal.strength)`, gated by its context `Condition`, with `source:"rules"`.
- `CASHFLOW_PRESSURE` is a moment derived from `ctx.cashflowPressure` and the disruption signals.
- `since` = date of the earliest evidence signal; `expiresAt` = `since + expiryDays`.
- Keep a moment only if its confidence ≥ 0.2, so `NO_ACTION` can still be explained.

### `deriveIntents`
- `intent_rules`: moment → intent with a weight and an optional condition, e.g.:
  - `HOME_BUYING → BUY_HOME` (1.0);
  - `HOME_BUYING → RENOVATE_HOME` (0.6, higher if `RENOVATION_VIEW`);
  - `HOME_BUYING → REDUCE_ENERGY_COST` (0.4).
- `confidence = moment.confidence × weight`. Several intents stay active.

### `decide`
Per intent, in this order:
1. An existing goal for the intent's `goalType` → `NO_ACTION` ("already in progress").
2. Feedback `no` in the last 180 days → `NO_ACTION`. Feedback `not_now` in the last 30 days → `WAIT`.
3. `CASHFLOW_PRESSURE` high and the intent is commercial → `WAIT`.
4. confidence < `askThreshold` → `NO_ACTION`; < `suggestThreshold` → `ASK`; otherwise `SUGGEST`.

Every decision carries a `reason` code and an `explanation[]` in plain English (from the contributions / evidence).

At most **one proactive Kate message per customer at a time**: only the highest intent is `ASK` / `SUGGEST`, and the others go to `WAIT` with reason `one_at_a_time`.

## Database: `supabase/migrations/20261020121000_intents.sql`

| Table | Columns | Seed |
|---|---|---|
| `moment_rules` | `moment` pk, `weights` jsonb (SignalCode → number), `bias`, `context_condition` jsonb, `expiry_days` | the 6 moments |
| `intents` | `code` pk, `label`, `goal_type`, `ask_threshold`, `suggest_threshold`, `kate_ask`, `kate_suggest` | 7 intents |
| `intent_rules` | `moment`, `intent`, `weight`, `condition` jsonb | the moment → intent map |

Config-table RLS pattern.

**Kate texts** (`kate_ask`, `kate_suggest`) are templates with `{firstName}` and `{evidence}` placeholders. T8 renders them. Example `BUY_HOME` ask:
> *"Hi {firstName} 👋 I noticed you've been looking at home loans lately. Are you planning to buy a home? I can put together your complete plan, from budget to keys."*

## Fixtures

- Inputs: `fixtures/t1-sofie.ts` (T1, ~11:45). Until then, write your own `fixtures/t3-inputs.ts` with signals for Sofie / Els / Thomas / Lucas.
- `fixtures/t3-sofie-decision.ts` for T8 (by 12:30): Sofie's moments + intents + decision.

## Steps

- [ ] `condition.ts` `evalCondition` + tests (`all` / `any` / `not`, ops, dotted paths). Commit early: T4, T5 and T6 use it.
- [ ] Migration + seed (moment_rules, intents, intent_rules)
- [ ] `detectMoments` (ml path via `predict()`, rules fallback) + tests
- [ ] `deriveIntents` + tests
- [ ] `decide` with all the gates + one-at-a-time + tests
- [ ] `explain.ts` + tests
- [ ] Fixture for T8
- [ ] Doc: status + `SOLUTION.md` log

## Acceptance

- Sofie → `HOME_BUYING` ≥ 0.6, `BUY_HOME` at `ASK` or `SUGGEST`, explanation mentions the simulations.
- Lucas → `STARTING_BUSINESS` → `START_BUSINESS` at `ASK`/`SUGGEST`.
- Els → only `NO_ACTION`, with a reason.
- Thomas → `NO_ACTION` or `WAIT` for `BUY_HOME`.
- A `no` feedback flips Sofie to `NO_ACTION`; `not_now` → `WAIT`; `INCOME_DROP` → `CASHFLOW_PRESSURE` → commercial intents `WAIT`.

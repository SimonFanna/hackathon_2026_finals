# Feature — Backend T3: moments, intents & decision gate
> Owner: Mathias (T3 agent) · Status: done on own fixtures (integration with T1/T2 pending) · Last update: 11:35

## Goal
Pipeline stages ③ (active moments) ④ (intents) ⑤ (decision gate). From T1's signals and context, decide **what is happening** (moments with a confidence), **what the customer probably wants** (intents) and **whether Kate should speak** (`NO_ACTION · WAIT · ASK · SUGGEST`). Every intent gets a decision with a plain-English **why / why not**. Spec: `backend/T3-moments-intents-decision.md`.

## How it works (files, data, contracts/APIs)
All in `web/src/backend/` and pure (no network, no clock: `asOf` is passed in).

| File | What |
|---|---|
| `engine/condition.ts` | `evalCondition(cond, { ctx, goal?, ...roots })`, `resolvePath`. Shared by T4/T5/T6. Ops: `eq neq gt gte lt lte in contains exists`; `all / any / not`. |
| `engine/moments.ts` | `detectMoments(signals, ctx, rules, asOf, model?)` → `ActiveMoment[]`, sorted by confidence. |
| `engine/intents.ts` | `deriveIntents(moments, ctx, rules)` → `Intent[]`. |
| `engine/decision.ts` | `decide(intents, moments, ctx, feedback, goals, rules, asOf)` → one `Decision` per intent definition; speakers first. |
| `engine/explain.ts` | `explainMoment`, `explainNoAction`, `describeSignal` ("You ran 4 home-loan simulations (up to €476k)"), `formatEur`. |
| `fixtures/t3-rules.ts` | Moment rules, 7 intents (thresholds + Kate texts), intent rules. **Mirrors the migration seed** (a test checks the two stay in sync). |
| `fixtures/t3-inputs.ts` | Hand-estimated signals + context for the 6 demo personas (real Supabase rows, T1's strength formula). Replace with `t1-personas.json` after T7's snapshot. |
| `fixtures/t3-sofie-decision.ts` | T3 output for T8: `sofieT3`, `lucasT3`, `thomasT3`, `elsT3`, `sofieIncomeDropT3`, `proactive(o)`. |
| `supabase/migrations/20261020121000_intents.sql` | `moment_rules`, `intents`, `intent_rules` + seed. **Applied.** Config RLS (read anon/authenticated, writes revoked). |

**③ Moments.** For each moment rule, gated by its `context` condition:
- **ML path:** if a `MomentModel` (T2's `{ features, predict }`) is passed and `predict` returns a prediction → `source:"ml"`. Contributions keyed `sig_<CODE>` are relabelled with what we saw.
- **Rules fallback:** `sigmoid(bias + Σ weight × signal.strength + Σ contextScores)` → `source:"rules"`.
- A moment needs at least one signal (`requiresSignal`, default true). `CASHFLOW_PRESSURE` can open from context alone and always uses rules.
- Kept if confidence ≥ 0.2. `since` = earliest evidence signal, `expiresAt = since + expiryDays`, and expired moments are dropped.

**④ Intents.** `confidence = moment.confidence × rule.weight`. The condition sees `{ ctx, moment }`. Several rules can target one intent, and the best one wins. Example: RENOVATE_HOME is 0.5, or 0.7 when `moment.evidence` contains `RENOVATION_VIEW`.

**⑤ Decision gate**, per intent definition, in this order:
1. Open goal of the same `goalType` (or of a sibling intent, for intents without a goal type) → `NO_ACTION goal_in_progress`.
2. Latest feedback `no` / `not_relevant` ≤ 180 days → `NO_ACTION declined / not_relevant`.
3. No intent → `NO_ACTION no_signal`. Confidence < `askThreshold` → `NO_ACTION below_threshold`, with "what we saw" and "what would make it clearer".
4. Latest feedback `not_now` ≤ 30 days → `WAIT snoozed`.
5. `CASHFLOW_PRESSURE` ≥ 0.6 and the intent is commercial → `WAIT cashflow_pressure`.
6. Confidence < `suggestThreshold` → `ASK`, otherwise `SUGGEST`.
7. **One at a time:** only the strongest ASK/SUGGEST stays. The others become `WAIT one_at_a_time`. If a goal is still `proposed` (Kate is waiting for an answer), nothing new is raised.

`Decision` carries the optional extras `confidence`, `moment` and `goalType` (added to `types.ts`). Reason codes: the `DecisionReason` type in `decision.ts`.

**Results on the fixtures (asOf 2026-10-01):**

| Persona | Moments | Decision |
|---|---|---|
| Sofie | HOME_BUYING 0.84, NEW_PARENT 0.25 | **BUY_HOME ASK**: "You ran 4 home-loan simulations (up to €476k) / You looked up property values (3 times) / You asked Kate about home loans…". RENOVATE_HOME WAIT (one at a time). |
| Sofie + income drop | CASHFLOW_PRESSURE 0.99 | BUY_HOME and RENOVATE_HOME **WAIT cashflow_pressure** ("Your income dropped") |
| Lucas | STARTING_BUSINESS 0.93 | **START_BUSINESS SUGGEST** |
| Thomas | HOME_BUYING 0.24 | **BUY_HOME NO_ACTION**: "saw 3 home searches + a budget check; what would make it clearer: a home-loan simulation" |
| Els | CASHFLOW_PRESSURE 0.82 (debt ratio 0.55) | **only NO_ACTION** |
| Nadia | NEW_PARENT 0.88 | PREPARE_FOR_BABY SUGGEST (non-commercial, so not blocked by her cashflow pressure) |
| Pieter | EV_PURCHASE 0.53 | SWITCH_TO_EV ASK |

## Decisions (and why)
- **Threshold before the WAIT gates** (the spec has `not_now` and cashflow first): WAIT means "we would speak, but not now". If the evidence is too weak there is nothing to wait for, so the answer is NO_ACTION. This keeps Els at "only NO_ACTION" even though her cashflow pressure is high.
- **One decision per intent definition** (with `no_signal`), not only per detected intent, so that "why am I *not* seeing X?" always has an answer. Consumers take `decisions.find(d => d.level === "ASK" || d.level === "SUGGEST")`.
- **T2 is injected** (`model?` parameter) instead of imported, so T3 never breaks if T2 is missing or has no weights. T7's pipeline passes `{ features, predict }`.
- **Commercial flag** on intents (`is_commercial`): `REDUCE_ENERGY_COST` and `PREPARE_FOR_BABY` are protective / cost-saving, so they can still be raised under cashflow pressure.
- **Context scores** in moment rules (added to the logit, each with a label) let the rules fallback use context (tenant, debt ratio) and stay explainable, like the ML contributions.
- Thresholds: ask 0.5 and suggest 0.85 for all intents. Sofie lands at ASK, which matches the hero Kate line ("Are you planning to buy a home?").

## Known limits / improvement ideas
- Signal strengths in `t3-inputs.ts` are **my estimates** of T1's output. Re-run the tests on `t1-personas.json` and retune `bias` if needed: Thomas sits just above the 0.2 moment floor, and Sofie between ask (0.5) and suggest (0.85).
- Feedback windows (180 / 30 days) and the pressure threshold (0.6) are constants in `decision.ts`; they could move into a DB table.
- Feedback targets are intent codes only. Feedback on a capability is T5's concern.
- Moment expiry uses the earliest evidence (per spec). A long-running interest can expire although recent signals exist: consider `latest + expiryDays`.
- The UI "players" (branch `victor`) use a Thomas who buys a first home, while the bank's `thomas` is our hard negative. Align the names before the pitch.

## Status checklist
- [x] `condition.ts` + tests (shared, on main 11:15)
- [x] Migration + seed (moment_rules, intents, intent_rules), applied, advisors clean for these tables
- [x] `detectMoments` (ml path via injected model, rules fallback) + tests
- [x] `deriveIntents` + tests
- [x] `decide` with all the gates + one-at-a-time + tests
- [x] `explain.ts` + tests
- [x] Fixture for T8 (`t3-sofie-decision.ts`)
- [ ] Re-validate on T1's real persona outputs (after 13:30 snapshot)
- [ ] Wire T2's `predict()` once `model.ts` lands

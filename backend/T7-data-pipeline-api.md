# T7 — Data layer, persistence, pipeline & API

> Owner: **Simon** · Status: todo · Last update: 11:00 · Wires everything: Supabase ↔ engine ↔ API, plus the offline snapshot
> Read first: `backend/TASKS.md`, `backend/backend.md` §7–8, `docs/features/bank-data.md`.

## Goal

Make the pure engine **run for real**:
1. load facts and rules from Supabase, server-side only;
2. chain all the stages in `runPipeline`;
3. persist the runtime state;
4. expose the API the UI and Kate use;
5. guarantee the demo works **offline** from a JSON snapshot.

You also own the **end-to-end tests** (the demo checks in `TASKS.md` §6).

## Interface

```ts
// data/supabase.ts — server-only client (import "server-only"); SUPABASE_URL + SUPABASE_SECRET_KEY from env, never NEXT_PUBLIC
// data/facts.ts
export async function loadFacts(slug: string, asOf?: string): Promise<CustomerFacts>;   // falls back to snapshot
// data/rules.ts
export async function loadRules(): Promise<RuleSet>;                                     // falls back to snapshot
// data/repo.ts — runtime state (falls back to an in-memory store when offline)
export interface Repo { getGoals(customerId): Promise<Goal[]>; saveGoal(g): …; getPlan(goalId): Promise<Plan | null>; savePlan(p): …;
  getConsents(goalId): …; saveConsent(c): …; getFeedback(customerId): …; saveFeedback(f): …;
  saveScenarios(s: Scenario[]): …; getScenario(id): …; injectEvent(customerId, e: Event): …; getInjected(customerId): Promise<Event[]>;
  saveKateMessage(m): …; listKateMessages(customerId): …; reset(customerId): … }
// pipeline.ts
export async function runPipeline(slug: string, opts?: { asOf?: string }): Promise<PipelineResult>;
export interface PipelineResult { facts: { customerId: number; firstName: string }; events: number; signals: Signal[]; context: PersistentContext;
  moments: ActiveMoment[]; intents: Intent[]; decisions: Decision[]; goals: Goal[]; plans: Plan[]; outcomes: Outcome[];
  disruptions: Disruption[]; impacts: Impact[]; scenarios: Scenario[]; kate: KateMessage | null; timings: Record<string, number> }
```

### `runPipeline` order
1. `loadFacts` + injected events
2. `toEvents` (T1)
3. `extractSignals` (T1)
4. `buildContext` (T1)
5. `detectMoments` (T3, which calls T2 `predict`)
6. `deriveIntents` (T3)
7. `decide` (T3, with the stored feedback and goals)
8. For each active goal:
   - load the plan, then `applyDecisionRules` (T5) and `trackOutcome` (T5);
   - `detectDisruptions` (T6), comparing the context without and with the injected events; for each disruption, `assessImpact` and `replan`;
   - persist the scenarios.
9. `kate` = T8 `kateForDecision(...)` or `kateForScenarios(...)`
10. `timings` per stage, in ms (for the "tech" slide)

## API (Next.js route handlers, `web/src/app/api/`)

| Route | Body → result |
|---|---|
| `GET /api/customers` | demo personas (slug, first name, one-line summary) |
| `GET /api/customers/[slug]/pipeline` | `PipelineResult` |
| `POST /api/customers/[slug]/feedback` | `{target, kind}` → stored; `no` / `not_now` affect the next run |
| `POST /api/goals` | `{slug, type, constraints, priorities}` → T5 `createGoal` + `buildPlan` + `applyDecisionRules` → `{goal, plan, outcome}` |
| `POST /api/goals/[id]/steps/[stepId]` | `{action}` → T5 `applyStepAction` → `{plan, outcome}` |
| `POST /api/goals/[id]/consents` | `{stepId, partner, field, granted}` → `{consents, sharedData, outcome}` |
| `POST /api/goals/[id]/simulate` | `WhatIf` → T6 `simulate` → `Scenario[]` (not persisted) |
| `POST /api/goals/[id]/scenarios/[sid]/choose` | T6 `chooseScenario` → `{goal, plan, outcome}` |
| `POST /api/customers/[slug]/events` | demo: inject a preset (`income_drop`, `cost_overrun`, `partner_delay`) or a raw `Event` |
| `POST /api/customers/[slug]/reset` | demo: wipe the runtime state for this persona |
| `GET /api/goals/[id]/outcome` | `Outcome` |

`/api/kate/**` belongs to T8.

**Input validation:** zod on every body, and the slug must be one of the demo personas (`is_demo`). Return 400 on bad input, without leaking the internal error. These matter for Aikido and the security score.

**Injected presets:**
- `income_drop`: remove the salary of the last month + add `tx:benefits` at 60% of the salary.
- `cost_overrun`: `partner:quote_received` on `quote_insulation` at +40% of the estimate.
- `partner_delay`: `partner:delayed` of 60 days on Impact us today.

## Database: `supabase/migrations/20261020123000_runtime.sql`

Tables: `injected_events`, `signals`, `customer_intents`, `goals`, `plans` (jsonb steps + `version` + `reason`), `scenarios`, `consents`, `kate_messages`, `feedback`, `outcomes`.
- Keep them simple: ids, `customer_id`, `created_at`, plus `jsonb` payloads matching the TS types.
- RLS on and **no policy**: only the server (secret key) reads and writes.
- Index on `customer_id` / `goal_id`.

## Offline snapshot

- `npm run snapshot` (script `scripts/snapshot.ts`) writes `web/src/backend/data/snapshot/rules.json` (the full `RuleSet`) and `facts-<slug>.json` for the 6 demo personas. Commit both; synthetic data only.
- When Supabase is unreachable or the env vars are missing, the loaders use the snapshot and `Repo` switches to memory. Log it once, and expose `"source": "snapshot"` in the API response.

## Steps

- [ ] Migration runtime + RLS; apply; advisors clean
- [ ] `supabase.ts` server client + env in `web/.env.example` (names only)
- [ ] `loadFacts` / `loadRules` + snapshot fallback + tests (offline path)
- [ ] `Repo` (Supabase + memory) + tests on memory
- [ ] `runPipeline` with stubs for missing modules → real modules as they land
- [ ] API routes + zod validation + presets
- [ ] `npm run snapshot` (13:30) → announce to the team
- [ ] `pipeline.test.ts` = the 6 demo checks in `TASKS.md` §6, offline
- [ ] Doc: status + `SOLUTION.md` log + README run instructions

## Acceptance

- The 6 demo checks pass offline (`npm test`).
- `GET /api/customers/sofie/pipeline` responds in < 500 ms on Vercel.
- No secret in the client bundle: grep the build output for the key name.

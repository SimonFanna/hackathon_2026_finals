# Feature — T7 Data layer, pipeline & API
> Owner: Simon (Claude session `simon-data`) · Status: in progress (T1 / T2 / T8 stand-ins) · Last update: 12:05

## Goal
Make the pure engine run for real: load facts and rules from Supabase (server-side), chain every stage in `runPipeline`, persist the runtime state, expose the API, and keep the demo working offline. Spec: `backend/T7-data-pipeline-api.md`.

## How it works
- **Data** (`web/src/backend/data/`)
  - `facts.ts` `fetchFacts(db, slug, asOf)` → `CustomerFacts` (transactions ≤ asOf, app events < asOf + 1 day, catalogue ids resolved to `source_row`); `withInjected` adds demo events and applies `facts:exclude_transactions` markers.
  - `rules.ts` `fetchRules(db, fallback)` → the full `RuleSet` from the 13 config tables (snake_case → contract types). A missing or empty table falls back to the snapshot part.
  - `load.ts` `loadFacts` / `loadRules`: Supabase first, the snapshot on any failure (logged once). Per-instance cache: facts 5 min, rules 1 min.
  - `repo.ts` `Repo`: `supabaseRepo` (runtime tables, secret key) or `memoryRepo` (offline / tests).
  - `server.ts` (`server-only`) `serverDeps()`: secret key → Supabase read + write; publishable key only → Supabase read + memory state; nothing or `BACKEND_OFFLINE=1` → snapshot + memory.
  - `snapshot/`: `rules.json`, `facts-<slug>.json` (6 demo personas), `catalogue.json`. Regenerate: `npm run snapshot` in `web/` (reads `.env.local`; the publishable key is enough).
- **Pipeline** (`web/src/backend/pipeline.ts`): `loadSituation` (facts → events → signals → context, plus the "before" context without injected events) then moments → intents → decision → per active goal: decision rules, disruptions → impact → replan, outcome → Kate. Returns `PipelineResult` + `timings` + `source`.
- **Stand-ins** (`web/src/backend/stages.ts`): T1 `toEvents` / `buildContext` (spec-based) and `extractSignals` (returns []), T2 model (none → T3 rules fallback), T8 Kate messages (templated). Swap the imports when the real modules land.
- **Service** (`web/src/backend/service.ts`): goal creation, step actions, consents, what-if, scenario choice, feedback, reset, demo presets (`income_drop`, `cost_overrun`, `partner_delay`, shapes agreed with T1).
- **API** (`web/src/app/api/`): the 11 routes of the spec. zod on every body and param (`web/src/backend/http.ts`), slugs limited to the demo personas, 16 KB body cap, 400 / 404 without internals, 500 logged server-side only.
- **Database**: `supabase/migrations/20261020123000_runtime.sql` (10 tables, RLS on, no policy, all privileges revoked from anon / authenticated). Applied.

## Decisions (and why)
- Loaders take the client as a parameter: tests and the snapshot script run without `server-only`.
- Demo clock: feedback and consents are stamped with `DEMO_AS_OF` (2026-10-01), so "days ago" rules behave on stage.
- The GET pipeline does not change stored goals or plans; it returns them with `atRisk` / `at_risk` when a disruption breaks a constraint, and stores scenarios, outcomes and the latest signals / intents.

## Verified (12:05)
- `pipeline.test.ts`: the demo checks pass offline (Sofie → BUY_HOME + Kate, plan ≥ 10 steps / ≥ 3 partners / dependency order / covered products / consent; income drop → INCOME_DROP, at risk, 2 scenarios, WAIT, choose → new version; Lucas → START_BUSINESS; Els / Thomas → no message; reset). T1 is simulated from T3's persona fixtures until it lands.
- `next start` smoke test: every route answers, bad input → 400, unknown step → 404; 2nd pipeline call 3 ms (cache).
- No secret in the client bundle (`grep SUPABASE_SECRET_KEY .next/static` → nothing).

## Known limits / improvement ideas
- Real signals need T1; real ML needs T2 `momentModel`; real Kate needs T8.
- Vercel functions run in `iad1` while Supabase is in `eu-west-1`: move the function region to `dub1` for latency.

## Status checklist
- [x] Runtime migration + RLS, applied; advisors: only the intended INFO "RLS enabled, no policy" on the runtime tables (server-only by design)
- [x] Server client + env names in `web/.env.example`
- [x] `loadFacts` / `loadRules` + snapshot fallback
- [x] `Repo` (Supabase + memory)
- [x] `runPipeline` with stand-ins
- [x] API routes + zod + presets
- [x] `npm run snapshot`
- [x] `pipeline.test.ts` demo checks (offline)
- [ ] Swap stand-ins for T1 / T2 / T8 and re-run the checks on real signals

# Backend review — 2026-10-20, 12:24 (main @ bd53f6f)

> **How it was done:** 7 reviewers ran in parallel, one each for T1+T2, T3, T4+T5, T6, T7, T8 and security. On top of that, the demo flow was replayed end to end over HTTP against `next start` in offline mode.
> **Reproducibility:** every item below was reproduced, unless it is marked *plausible*. The repro scripts live in the reviewers' scratch dirs; nothing was added to the repo.
> **Health:** lint ✓ · 258/258 tests ✓ · build ✓ · no secret in the client bundle.

## Status — 12:55 (main @ cbe63d1, 264 tests ✓, build ✓)

| P0 | Status |
|---|---|
| #1 Kate what-if hangs the server | ❌ **Open: still reproduces.** The server stops answering every route. Mathias |
| #2 Scenario A can't be chosen | ✅ T7 route (choose A → 200, re-verified over HTTP) · ❌ Kate's `REPLY_ACTION`, Mathias |
| #3 Double "income drop" click | ✅ Memory repo replaces by id (re-verified: still INCOME_DROP + 5 scenarios) · ⏳ T1 de-duplication in `toEvents`, Simon |
| #4 Kate repeats her reason | ❌ Open: Simon (T2 merge) + Mathias (`evidenceWords`) |
| #5 Nadia / Pieter plan → 500 | ✅ `POST /api/goals` → 400 "no plan template for WELCOME_BABY yet" (re-verified) · ❌ T3 still offers the plan, Mathias |
| #6 Kate on a frozen fixture | ❌ Open: Mathias |
| #7 Anonymous writes | ✅ Same-origin check (cross-site → 403, re-verified), 30 writes/min/client, event numbers bounded (re-verified), `x-demo-token` on reset + events if `DEMO_TOKEN` is set (**not set on Vercel yet: Simon's call**) · `GET /pipeline` still persists derived rows (idempotent; reset clears them) |
| #8 Feedback dates on Supabase | ✅ Repo maps `at` → YYYY-MM-DD (T7; not re-verified live) |
| #9 Impossible dates | ✅ `z.iso.date()` (re-verified: 400) |
| #10 Supabase unreachable | ✅ Cached 1.5 s probe → snapshot + memory, 4 s timeout per call (T7; not re-verified live) |
| P1 (T7) | ✅ A re-created goal starts fresh (v1, no consents); reads newest-first (500); the `partner_delay` preset is now 120 days |

## Verdict

- **The stages hold up on their own:** pure, deterministic and consistent with the contract. Catalogue = seed = fixtures = snapshot, and the 6 demo checks pass in-process.
- **What breaks is the glue:**
  - route id validation;
  - state across requests;
  - Kate's frozen session;
  - a public write API with no protection.
  The tests stay green because `pipeline.test.ts` calls the service directly and never goes through the routes. Several demo paths fail as soon as the UI calls the API.
- **P0 is about 1.5 h of work, mostly one-liners.** Land it before the 15:00 backend freeze.

## P0 — before 15:00

| # | Problem (evidence) | Fix | Owner |
|---|---|---|---|
| 1 | **Kate can hang the server (public DoS).** `simulate()`'s binary search uses `(lo + hi) >> 1` (`engine/replan.ts:261`), which overflows past 2³¹, and Kate's what-if amount is unbounded (`engine/kate/router.ts:35`). *Repro:* ask "What if the budget is 9,000,000,000,000?" → the request never returns, and every route on the instance stops answering (verified over HTTP). | `Math.floor((lo + hi) / 2)`, an iteration cap, and reject budgets > €10M in `simulate` and `parseAmount` | Mathias (T6/T8) |
| 2 | **Scenario A can't be chosen.** `scenarioIdParam` (`http.ts:15`) has no `+`, and Kate's `REPLY_ACTION` (`kate/reply.ts:9`) has neither `:` nor `+`. Sofie's top scenario is `goal-1-buy_and_prepare_home:v1:extend_term+add_protection` → **400** on both routes (verified over HTTP). | Allow `[\w:.+-]{1,160}` in both regexes, and add one route-level test that uses a real T6 id | T7 + Mathias (T8) |
| 3 | **A second "income drop" click cancels the disruption.** The memory repo appends a duplicate with the same id (`data/repo.ts:74`), and `toEvents` doesn't de-duplicate (`engine/events.ts:77`). The benefit counts twice → no INCOME_DROP, 0 scenarios, no Kate message (verified over HTTP). | Memory `injectEvent` replaces by id; `toEvents` keeps one event per id | T7 + Simon (T1) |
| 4 | **Kate's opening line repeats its reason:** "…(you've been putting more aside each month and you've been putting more aside each month)". T2 returns `sig_X` and `cnt_X`, T3 labels both the same way, and T8 takes the top 2. | Merge `sig_X` + `cnt_X` into one contribution per code in `predict`; de-duplicate labels in `evidenceWords` | Simon (T2) + Mathias (T8) |
| 5 | **Nadia and Pieter are offered a plan that can't be built → `POST /api/goals` 500.** WELCOME_BABY / SWITCH_TO_EV have no template, and Kate ask/reply return 404 for these slugs (verified over HTTP). | In `decide()`, never ASK/SUGGEST a goal type that has no template; return 400 for unknown types | Mathias (T3) + T7 |
| 6 | **Kate answers from a frozen fixture, not the customer's live plan.** `app/api/kate/_lib/session.ts:18-41` builds its answers from the t5 fixtures. | Build `QaInput` from T7's `loadSituation` + `repo.getGoal/getPlan/getConsents`; the reply route calls `feedbackFor()`. **Biggest item: 30–45 min** | Mathias (T8) with T7 |
| 7 | **Anonymous visitors can rewrite the live demo state.** The deployed API writes to Supabase with the secret key, and reset / events / feedback / goals / consents / steps / choose have no auth and no rate limit. Event `detail` numbers are unbounded: Kate then says "a quote came in €987,654,321 above the estimate". A juror can reset Sofie, or say "No" for her, during the pitch. | In `handle()`, require `x-demo-token` == a server-only `DEMO_TOKEN` (constant-time compare) for every POST and for the persisting part of `GET /pipeline`. Reuse Kate's rate limiter, and bound `detail` numbers | T7 |
| 8 | **"No / Not now" is ignored on the Supabase deploy.** `feedback.at` is `timestamptz` and comes back as `2026-10-01T00:00:00+00:00`, which is compared as a string with asOf `2026-10-01` (`engine/decision.ts:24`). The feedback is dropped and Kate proposes again. | `at: String(r.at).slice(0, 10)` in the repo's `getFeedback` / `getConsents`; compare dates in `decision.ts` | T7 + Mathias (T3) |
| 9 | **An impossible date breaks the persona for everyone.** `isoDate` is a regex only (`http.ts:8`): `deadline:"2026-13-31"` → 200, then every Sofie pipeline → 500 until a reset (verified over HTTP). | `z.iso.date()`, or refine with `Date.parse` | T7 |
| 10 | **Supabase unreachable (venue Wi-Fi) → 500 or ~7 s per call instead of the snapshot.** The repo is chosen from env only (`data/server.ts:20-28`). postgrest retries 3× (1+2+4 s) and failures are not cached. `source.rules` says `supabase` even when every part fell back. | A probe with a short timeout + `retry(false)` + a cached "offline" verdict. **Plan B for the pitch:** `BACKEND_OFFLINE=1` | T7 |

Details for #6, all reproduced on the live plan:

| Situation | Kate says | Correct answer |
|---|---|---|
| After choosing B (plan v2 at €703/month) | "(now €1,067)" | €703/month |
| "Why home insurance?" | "You already have this" | Sofie doesn't hold row 8; the fixture does |
| "Why Setle before the loan?" | Contradicts the order of the real plan | The real plan's order |
| Feedback ("not now", "no") | Saved to an array that nothing reads | Should reach T7 |

## P1 — wrong answers and correctness, if time allows

**Kate (Mathias, T8 / T6)**
- **The €280k demo answer is wrong.** "What if the house costs €280k?" is modelled as an all-in budget of €280k, i.e. a €240k house. Kate says €1,213/month; a €280k house costs about €1,407/month. Fix: add `WhatIf.price` → `targetProperty.price`. This is demo check 5.
- **The what-if parser misreads input and has no bounds:**
  - "€30k more" → budget €30k;
  - "in 2027…" → €2,027;
  - "rate is 4%" → +4 points;
  - 0 years and a 99% rate are accepted.
  Fix: validate with `whatIfBody` before calling `simulate`.
- **The numbers guard and the prompt layout can be bypassed:**
  - the question shares a message with the draft;
  - the guard accepts numbers from the question, any number ≤ 10, and numbers written in words;
  - `isSafe` misses "will be approved".
  KBC-internal figures (`kbcRevenueEur`, `partnerValueEur`) are also sent to the LLM.
- **The LLM rate limit is per instance**, and spoofable through XFF off Vercel. There is no global budget. Over the limit, fall back to the deterministic answer instead of returning 429.

**Decisions and replanning (Mathias, T3 / T5 / T6)**
- After "No" on BUY_HOME, Kate immediately proposes RENOVATE_HOME. Suppress per moment, not per intent.
- Thomas's "why not" says "nothing seen": his moment is dropped under the 0.2 floor. That loses the hard-negative story (we saw it and stayed quiet).
- Scenario ids collide when 2 disruptions hit one goal: "Choose B" applies another plan, and the Supabase upsert would have a duplicate PK. Put the disruption code in the id.
- A handled disruption fires again after the customer chose a fix (the overrun or delay is counted twice), so Kate prompts again every run.
- `ADD_PROTECTION` mutates the shared RuleSet across requests (`replan.ts:166`; fix: `[...strs(...)]`).
- `ADD_PROTECTION` gets its bonus even when it adds nothing, so scenario A is sold as "+ insurance" that is already in the plan. The label "30-year loan (€200k)" quotes the all-in budget, not the loan.
- `plan.checks` / `atRisk` are computed before the decision rules (`orchestrator.ts:266`), so the stored plan contradicts itself.
- `ALREADY_COVERED` treats a held loan, or any held alternative, as covering a new need. This affects owners who buy again.
- Re-creating a goal (without a reset) serves the stale v2 plus the old consents. Use `version = latest + 1` and clear the consents. (T7 / T5)
- The `partner_delay` preset (60 days) shows nothing for the default goal, which has 85 days of slack. Derive the delay from the plan. (T7)
- Repo reads stop at 1,000 rows, oldest first, so after 1,000 junk consents or events the new ones are ignored. Read newest first. (T7)

**Signals and model (Simon, T1 / T2)**
- `saving_growth` depends on asOf and on the transfer's day of the month: at asOf 2026-09-15, Thomas scores 0.89 and gets SUGGEST. Count calendar months instead.
- Kate keywords are matched as substrings: "vat" matches "renovation", which gives Sofie a false business signal. Use word boundaries.
- Context-feature labels are third-person ("rents their home") and can reach Kate's text. Rewrite them in the second person.

## P2 — minor / documented

- Training leaks converted customers (they hold the anchor product).
- T1 drops events dated later on the asOf day.
- Kate answers use `Date.now()` for `at` / ids.
- `MAXIMISE_GRANTS` breaks the dependency order.
- The disruption reads the oldest partner event.
- One Setle request counts as 2 leads.
- `finance_renovation` doesn't depend on solar / windows.
- The target-property default (1975) applies even when the EPC is given.
- `arbitrate()` is never called outside its tests.
- Template slips ("Lucas … about €0", "Home purchase alone exceed…").

## Security and platform (outside the code)

- **Aikido** will flag only `braces`: a dev-only ESLint chain with no patched version. Ignore it in Aikido with that reason. Production dependencies: 0 vulnerabilities.
- **Public repo:** the organisers' PDF (`resources/Tectonic Hackathon - Finals Guide-1.pdf`, page 7) contains the venue Wi-Fi password, and the rules say "never upload passwords". Fix: `git rm --cached` + `.gitignore`. The file is also 55 MB, over GitHub's warning size.
- **Clean:**
  - RLS is on for all 37 tables; anon has SELECT only on bank / config; runtime and `ml` are closed;
  - no secret in any git blob;
  - the CSP and security headers are live;
  - Kate's key is server-only, with a 4 s abort.
- **Vercel:** Git pushes hit the Hobby deployment rate limit, yet the live URL already serves the T7 API. Check which commit is live before the pitch.
- **Side effect of the review:** one GET on the live `/pipeline` wrote 16 derived rows for Sofie. That is normal pipeline output, and a reset clears it.

## What holds (no action)

- Engine purity and determinism.
- No training / serving skew: `features.csv` is reproduced exactly.
- Catalogue = seed = fixtures = snapshot.
- Annuity maths, topological sort, cycle handling.
- Consent is off by default, and revocation works.
- The T3 gate logic.
- The T6 hero path: income drop → 2 scenarios (€736 / €703), WAIT, v2.
- Offline, Kate answers the 4 demo questions and refuses the injection.
- Errors are generic.

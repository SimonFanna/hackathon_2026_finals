# SOLUTION — Intent → Journey

> Living document, updated throughout the day. Each feature has its own file in `docs/features/<feature>.md`.
> Last update: 10:32

## One-liner

**KBC notices that a customer is entering a life moment and turns that intent into a concrete, step-by-step journey combining KBC and its partners — with the customer in control at every step.**

## The problem

KBC already offers ~229 products and services across 21 ecosystems (Housing, Energy, Mobility, Business…), including ~27 partners (Immoscoop, Setle, Cambio, NMBS, Billit…). For the customer it is a fragmented catalogue: they must know what to look for, in which order, and from whom. The intent ("I'm buying a house") never becomes action.

## Our solution

An **orchestrator** that always runs the same loop:

1. **Signal** — an observed event (Immoscoop search, loan simulation, EPC lookup…)
2. **Intent** — inferred life moment with a confidence score. Below a threshold we *ask* the customer instead of assuming.
3. **Journey** — a multi-step journey composed from the KBC + partner catalogue.
4. **Customer control** — at each step: accept / skip, and choose which data is shared with which partner (off by default).
5. **Measurable outcome** — a triple-win view: value for the customer, for KBC, for partners.

**Scalability key:** a new intent = new *data* (intent + steps), not new code.

## Demonstrated journeys

### Hero — "I'm buying a 1975 house"
Immoscoop search → valuation → housing budget → home loan → renovation obligation (EPC) → renovation costs & grants via Setle → insulation / heating quotes → solar → energy loan → home insurance.
*Measurable:* € saved, kWh, CO₂, grants obtained.

### Generalisation proof — "I'm starting my business" (not built yet)
Start it → Business PRO → Billit invoicing → self-employed status, pension & insurance.

## Triple win

| Customer | KBC | Partners |
|---|---|---|
| A clear path, less effort, € and CO₂ saved | More products per customer, engagement, consented data | Qualified leads, at the right moment, with consent |

## Principles (from the KBC guide)

- **Bold** — we don't recommend a product, we orchestrate a life moment.
- **Scalable** — generic engine, data-driven intents.
- **Transparent & privacy-first** — consent per partner and per step, visible "why am I seeing this".
- **Commercially viable** — every step is a KBC product or a revenue-generating partner.

## Differentiation

What KBC already does (verified):
- **MyHome** ([KBC press release, 29 Jan 2026](https://www.kbc.com/content/dam/kbccom/doc/newsroom/pressreleases/2026/20260129%20MyHome_EN.pdf)): a dashboard in KBC Mobile since March 2026. It groups loans, insurance, renovation advice and energy insights, with the partners Setle, Eliq, Immoscoop, Impact us today and Immowinkel. It is **only for customers who opted into "extra convenience"**; Kate is the first point of contact.
- **Immoscoop inside KBC Mobile** ([kbc.be](https://www.kbc.be/retail/en/products/payments/self-banking/on-your-smartphone/mobile/immoscoop.html)): customers search homes, save searches, and Kate alerts them when a matching home goes online. KBC shares the customer's name and email with Immoscoop.
- **Feasibility certificate (haalbaarheidsattest)** ([Immoscoop press release](https://www.immoscoop.be/content/blog/persbericht-bereal-kbc-en-immoscoop-lanceren-haalbaarheidsattest-voor-kandidaat-kopers), around Aug 2026): per property, it shows whether an offer looks affordable. Once the offer is accepted, the customer can go straight to a KBC loan application with the data reused. This is the closest existing piece to our journey.

So our pitch is **not** "we bundle housing partners", and not "Immoscoop to mortgage". What we add:
- **proactive detection** from signals;
- a **sequenced plan** across ecosystems (housing → finance → energy → insurance), not a toolbox;
- **per-step, per-partner consent**;
- a **measured triple win**;
- **one generic engine**, where a new intent is new data.

**Our assumption (not documented publicly):** KBC uses in-app Immoscoop saved searches as an intent signal. It is plausible (the search runs inside KBC Mobile and Kate already sends the alerts), and we gate it on the same "extra convenience" opt-in KBC uses for MyHome. Pitch line: *proactive detection only runs for customers who opted in, exactly like MyHome today.*

This also matches KBC's own line on Kate: *"Kate will never implement anything without explicit customer approval"* ([KBC newsroom, Nov 2025](https://newsroom.kbc.com/kate-five-years-and-five-milestones)).

## Architecture

- **Front:** Next.js + TypeScript + Tailwind in `web/`, deployed on Vercel
- **Engine:** pure TypeScript in `web/src/engine/`, tested with Vitest; no LLM in decision-making
- **Data:** static synthetic data in the engine (V0); Supabase planned (`ecosystem_items`, `intents`, `intent_steps`, `customers`, `signals`; RLS on, read-only) with static fallback

## Out of scope (unless time allows)

Authentication, LLM decisioning, Kate voice, real partner integrations.

## Features (one file each in `docs/features/`)

| Feature | Owner | Status | Doc |
|---|---|---|---|
| Journey engine (steps, consent, scoreboard) | coordinator (kepa) | done (V0) | `journey-house-v0.md` |
| Intent detection & confidence scoring (signals → intent, levels none/ask/suggest) | DB + ML team | todo — engine has a placeholder (`detectIntents`, thresholds 0.4/0.75) to replace; keep the `DetectedIntent` contract | `backend/backend.md` |
| **Outcome Engine backend** (events → signals → context → intents → decision → Kate goal confirmation → capability orchestrator → rules → consent → outcome tracker → disruption replanning + scenarios) | Mathias (T3 T5 T6 T8) + Simon (T1 T2 T4 T7) | build split, in progress | `backend/backend.md`, `backend/TASKS.md` |
| Journey UI V0 | peer agent (kepa) | replaced by UX redesign V1 | `journey-house-v0.md` |
| UX redesign V1 (KBC brand, Kate voice, phone stage, triple-win finale) | peer agent (kepa) | done (V1) | `ux-redesign.md` |
| Adaptive Outcome Engine: players screen (home + business), live plan, 4 unexpected events per goal, scored re-planning, engine HUD | Victor | done (V1, branch `victor`) | `outcome-engine.md` |
| Supabase catalogue + data | Simon | done (applied + loaded) | `bank-data.md` |
| Supabase live data in the demo (Sofie + signals, offline snapshot) | kepa | done on `main`; **not wired into the UI on branch `victor`** (Victor's call: static players Thomas + Lina for now). `bank.ts`, `bankSnapshot.ts`, `bankClient.ts` and their tests are kept as is. | `supabase-live-data.md` |
| Pitch 3D "Lucas's World" (`pitch3d/`, three.js, 7 beats, Supabase snapshot) | Kepa UI terminal | **paused** (V1 works on `kepa`, not merged) | `pitch-3d.md` |
| 3D persona carousel at app start (`web/src/components/picker/`, three.js, CC0 people, procedural scenes, 2D fallback) | Kepa UI terminal | V1 on `main` (1556de3); art polish on `kepa`. High quality by default (bloom + MSAA); `?q=low` → 2D | `persona-picker-3d.md` |
| Deck + demo (GIF/video) | — | todo | — |
| Security (Aikido) + public repo | Kepa UI terminal (hardening) · user/Simon (Aikido) | in progress: headers + CSP done, Aikido not connected | `docs/features/security.md` |

## Open questions

- Which ecosystem KPIs does KBC use? (ask staff on site)
- Can we name partners in the demo / pitch?
- **MyHome / Immoscoop signals:** ask KBC staff whether in-app Immoscoop saved searches may be used as a signal under "extra convenience". Position us as the proactive, sequenced layer on top of MyHome.
- Verify the Flemish rule: buyers of an E/F-label home must renovate to at least label D within 5 years (used in the EPC step).

## Log

- **Presentation-only pain story:** removed from `main` at Victor's request. The live site opens directly on the original player selector and guided demo. The full game-style story, original vector artwork, thirteen slide captures and export script remain on the [`victor-pain-tunnel` branch](https://github.com/SimonFanna/hackathon_2026_finals/tree/victor-pain-tunnel), for the PowerPoint presentation.

- **09:20** — Direction A validated. Document created.
- **09:50** — No Supabase access yet: V0 on static TS data. Engine `web/src/engine/` delivered (tests green); Next.js UI built.
- **10:05** — Supabase access OK (empty DB). V0 UI judged too cluttered → UX redesign started (KBC brand + market benchmark). `CLAUDE.md` team rules added; docs switched to English.
- **10:20** — UX redesign V1 shipped in `web/`: a KBC Design Language look (tokens read live from kbc.be), Kate's voice, one step at a time with a consent sentence per partner, a hidden presenter panel (key P) and a triple-win finale. Screenshots in `docs/screenshots/`. MyHome finding added (Differentiation, Open questions).
- **10:32** — MyHome verified (KBC press release, 29 Jan 2026, opt-in "extra convenience"). Immoscoop × KBC integration and haalbaarheidsattest documented. Our Immoscoop-signal assumption is labelled and gated on the same opt-in.
- **10:50** — Quick wins from `docs/review-1100.md`: root README rewritten (run, architecture, status, team, Vercel steps); CSP + security headers; stale `pitch/idea-a.html` removed; `docs/features/security.md` (Aikido steps) and `docs/assumptions.md` (every figure sourced or flagged) added.
- **11:10** — Demo wired to Supabase: Sofie and her signals are read live from the synthetic bank (`app_events`), with a bundled snapshot of the same rows as offline fallback. Kate's line and the budget step are built from data (latest simulation €251k, was a hardcoded €320k).
- **10:55** — Backend redesigned as the **KBC Outcome Engine** (`backend/backend.md`): an 11-stage data-driven pipeline on Simon's facts tables. Kate confirms goals and answers plan questions (the LLM phrases, the engine decides). New: disruption detection (income drop, cost overrun, partner delay) → impact → replan → scenarios A/B the customer chooses; multi-goal arbitration. The V0 engine structure is not reused.
- **11:05** — Backend split into 8 independent tasks (`backend/TASKS.md` + `backend/T1…T8-*.md`): shared TS contract + vocabulary, one migration and one set of files per task, fixtures to mock inputs, integration at 14:00, backend freeze 15:00. Simon: signals/context, ML, capability registry, data/pipeline/API. Mathias: moments/intents/decision, orchestrator/consent/tracker, disruption/replan, Kate.
- **11:10** — Adaptive Outcome Engine (branch `victor`): a "Choose your player" start screen (Thomas, first home · Lina, first business), the plan goes live, and 4 unexpected events per goal (cost overrun, partner 3 months late, rate rise / late payer, job loss / injury declared to Kate). The engine recalculates constraints, scores every option and recommends one; the customer decides. One engine with no goal-specific code: Lina is a data file. 30/30 tests.
- **11:10** — Merged `main` into `victor`. The UI uses static players (Thomas, Lina) and makes no Supabase call for now; the bank pipeline code stays in the repo. Note for Mathias: `web/src/engine/outcome.ts` already implements disruption → impact → scored options → customer choice, deterministic and tested. It can be the reference for the backend replanning stage.
- **11:15** — `victor` merged into `main`: the live site now opens on "Choose your player". The UI makes no Supabase call (Victor's call for now); the bank code is kept.
- **11:25** — Backend **T5** done on its own fixtures (`docs/features/backend-t5-orchestrator.md`): `finance.ts` (annuity, affordability), `orchestrator.ts` (createGoal → buildPlan → checkConstraints), `rules.ts` (decision & suppression rules, migration `decision_rules` applied), `consent.ts` (append-only consent ledger, sharedData), `tracker.ts` (progress + triple win). Sofie: 14 steps, 4 providers (3 partners), €210k home + €48k works − €8k grants = €250k all-in, €1,067/month ≤ €1,100, home insurance `ALREADY_COVERED`, no consent → 0 leads. Lucas builds `START_BUSINESS` with the same code. 44 backend tests.
- **11:35** — Backend **T3** done on its own fixtures (`docs/features/backend-t3-decision.md`): shared contract `types.ts` + `vocabulary.ts` + `evalCondition` on main; `detectMoments` (T2 model injected, rules fallback), `deriveIntents`, `decide` (goal / refusal / threshold / snooze / cashflow gates, one Kate message at a time) with a why / why-not for every intent; migration `intents` applied (6 moment rules, 7 intents, 8 intent rules). Sofie → BUY_HOME **ASK** (84%, "You ran 4 home-loan simulations (up to €476k)"), Lucas → START_BUSINESS SUGGEST, Thomas → NO_ACTION ("what would make it clearer: a home-loan simulation"), Els → only NO_ACTION, Sofie + income drop → WAIT. 37 T3 tests.
- **11:30** — Backend **T6** done on its own fixtures (`docs/features/backend-t6-replanning.md`): `detectDisruptions` (signals + context diff + partner events), `assessImpact`, `replan` (7 strategies, each candidate a real T5 `buildPlan`, binary search on the budget, score = 0.4·P(success) + 0.25·cost + 0.2·delay + 0.15·priority fit, 2 distinct scenarios), `chooseScenario`, `simulate` (what-if) and `arbitrate` (multi-goal). Migration `disruptions` applied (5 disruption types, 7 strategies). Sofie's income €2,619 → €1,800 (max €1,100 → €750): **A** 30-year loan €200k + outstanding-balance insurance, €736/month · **B** €175k, renovation in 2 phases, €703/month. What-if €280k → €1,213 > €1,100 → 2 fixes. Partner delay → REORDER keeps the deadline. Fixture for Kate: `fixtures/t6-sofie-scenarios.ts`. 33 T6 tests.
- **11:40** — Backend **T8 Kate** done (`docs/features/backend-t8-kate.md`): proactive message from T3's decision (`kateAsk`/`kateSuggest` + top-2 evidence), pre-filled goal set-up (budget capped at T5 `affordability`, €1,100/month), scenario choice A/B from T6, and plan Q&A. Every answer is first built by code (router → draft from the plan, T5 `sharedData`, T6 `simulate`); OpenAI **Luna** (`gpt-5.6-luna`) only rephrases it, and a guard falls back if it writes a number not in the facts. Injections never reach the LLM. Routes `POST /api/kate/ask` and `/api/kate/reply` (zod, rate limit). The 4 demo questions verified live (€280k → €1,213 > €1,100 → 2 fixes). 46 Kate tests.
- **11:44** — T1 (signals & context, 39 `signal_rules`) and T2 (ML model) on main. One logistic regression per moment, CV AUC 0.990–0.996. Scores 2.5M customers × 5 moments in 1.15 s on one core. Sofie, Lucas, Nadia and Pieter reach SUGGEST; Els and Thomas get NO_ACTION. The `model_weights` table is empty for now (fallback `weights.json`).
- **11:48** — Pitch 3D "Lucas's World" V1 **paused** by the user (too big). It works on `kepa` (`pitch3d/`): 7 beats from Lucas's Supabase rows, low-quality mode, fps measured on an Intel Iris Xe (high 25–54, low 40–59 at 1080p), screenshots in `docs/screenshots/3d/`. Not merged into `main`.
- **12:24** — Backend review (7 parallel reviewers + an end-to-end HTTP run): `backend/REVIEW.md`. 10 P0 to fix before 15:00 (simulate DoS, scenario A not choosable, double injection, Kate on a frozen fixture, unprotected write API, Nadia/Pieter 500…), each with an owner.
- **12:45** — 3D persona carousel V1 on `kepa`. Thomas and Lina are CC0 rigged people (Quaternius, user-approved download, credited) standing in a procedural Flemish house and Lina's coffee bar. Locked goals are silhouettes. Entry dive: the window light morphs into the measured phone screen. Victor's 2D picker is the fallback. 60 fps at 1080p on an Intel Iris Xe. Stage diff: 6 lines.
- **13:35** — 3D picker after an adversarial art review, merged into `main` by the coordinator (kepa 81f32f9 → main 1556de3). Changes:
  - the stage fits the free band at any screen size (720p projectors no longer hide the plinths);
  - the dive stops on the lit window, and the light lands on the window's own rectangle and morphs into the phone (no full-screen flash);
  - locked goals are night silhouettes, there is a KBC-blue selection ring, and the people have contact shadows;
  - production default is high quality (bloom + MSAA, no automatic downgrade; `?q=low`, `?bloom=0`, `?q=auto` are manual switches).
  Prod full flow Thomas → C → Lina: 0 console/CSP errors.
- **14:25** — Demo V2 P1 + P2 on `kepa` (6eeb34b, 10f1991): Kate's notification no longer blocks the home screen (click outside / Esc, a Kate pill brings it back); the carousel shows Lina first and by default, then Thomas, no locked goals (3D and 2D). Verified on a prod build, 0 console errors.

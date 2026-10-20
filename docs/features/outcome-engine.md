# Feature — Adaptive Outcome Engine (players, live plan, unexpected events)
> Owner: Victor (branch `victor`) · Status: done (V1) · Last update: 11:10

## Goal

Show that the product is **not a house widget** but one engine that takes **any goal** to a measurable outcome, **even when life gets in the way**:

1. **Pick a player** (video-game style): Thomas, 30, buying his first home · Lina, 29, opening her first business (a coffee bar). Three more goals are shown locked ("Same engine, new data").
2. Same phone flow as V1 (Kate's notification → intent → path → one step at a time with consent → plan).
3. **New:** the plan goes **live**. Time fast-forwards; **four unexpected events** hit each goal. For each one the engine **detects the impact, recalculates the constraints, scores every option, recommends one**, and the **customer decides**. The plan re-organises itself (changed steps are flagged).
4. Finale: "Life hit 4 times. The plan held." + the decisions taken + the triple win.

## How it works

### Engine (`web/src/engine/`, pure TS, no LLM, Vitest)
| File | Role |
|---|---|
| `types.ts` | Adds `IntentModel`, `Journey.chapters`, `JourneyStep.purpose`, and the outcome types: `ConstraintDef`, `OutcomePlan`, `Disruption`, `PlanOption`, `EvaluatedOption`, `Run`, `PendingHit`. |
| `outcome.ts` | The adaptive engine: `startRun`, `hit` (disruption → broken constraints + scored options), `evaluateOptions`, `resolve` (customer's choice), `advance`, `goalReached`, `stepStatus`, `health`. **No goal-specific code.** |
| `personas.ts` | Registry: a persona = customer + signals + intent model + journey + outcome model + copy. House outcome model lives here. |
| `business.ts` | Lina's data: signals, intent model, 10 steps (verbatim catalogue labels), outcome model + 4 events. |
| `engine.ts` | `detectIntents(customer, signals, model = houseIntentModel)` and `buildJourney` now read the registry. Contract `DetectedIntent` unchanged (DB + ML team can still replace the scoring). |
| `outcome.test.ts` | 24 tests: both personas start at 100% health, each event breaks a constraint, Kate always recommends a feasible option, the goal is reached when following Kate, options re-scored on the customer's real choices, the insurance claim only exists if the insurance step was accepted. |

**Model.** Every goal is held to 4 constraints (labels per goal): `cost` (max), `monthly` (max), `finish` (max month), `buffer` (min).
- Goal health = 100 − penalties: a broken constraint costs 15–40 points; being within 2% of a limit costs a little. A plan with any broken constraint is capped at 79% (never "on track").
- Option score = health − 1 point per €1,000 of hidden long-term cost (extra interest, lost savings).
- Recommendation = best **available** option that keeps **every** constraint; otherwise the best available one.
- Options can depend on earlier choices (`requiresStep`). Example: Lina's "Claim your guaranteed income insurance" exists only if she accepted that step. Otherwise it is shown locked: "you skipped …".
- Re-planning strategies are generic data (`defer`, `substitute`, `refinance`, `rebalance`, `reorder`, `protect`, `bridge`, `keep`).

**The 8 events (illustrative figures):**
| Thomas · first home | Lina · first business |
|---|---|
| M2 Rates up 0.6 pt → monthly over limit | M1 Fit-out contractor **3 months late** → misses summer |
| M4 Renovation quote +€11,800 → budget broken | M3 Equipment +€12,500 → budget broken |
| M6 Installer **3 months late** → after lease ends | M6 Biggest client pays 75 days late → cash under safety line |
| M9 Job loss (told Kate) → affordable monthly drops | M8 Broken wrist, 6 weeks off (told Kate) → cash hit |

Income and health shocks are **declared by the customer** ("You told Kate"), never inferred.

### UI (`web/src/components/journey/`)
| File | Role |
|---|---|
| `CharacterSelect.tsx` | S0 "Choose your player": 2 big cards (SVG avatars, stats derived from data, 4 event icons), 3 locked goals. ← → / 1 2 / Enter. |
| `OutcomeScreens.tsx` | S7 `LiveScreen` (month, goal health, constraints, plan with step status + change notes), S8 `EventScreen` (what broke), S9 `OptionsScreen` (scored options, "Kate recommends", locked options, customer chooses). |
| `EngineHud.tsx` | Right of the phone on stage ≥1100px: pipeline Detect → Plan → Execute → Adapt → Outcome, the adapt sub-steps, goal health, 4 constraint gauges, the 4 event slots ("???" until they hit, then "Kate's pick" / "Customer's call"). |
| `outcome-ui.tsx` | `HealthBar`, `ConstraintRow`, `EventBadge`. |
| `Stage.tsx` | State machine, extended: `select → home → … → plan → live ⇄ event → options → live … → finale`. Screen shake + red flash when an event hits (disabled with reduced motion). |
| Existing screens | Now persona-driven (copy, chapters, home accounts, "why" note). `Finale` shows the decisions and the outcome. |

**Keys:** `→/Enter` next · `←` back · `S` skip · **`F` fill the plan** (accept the remaining steps) · **`1–4` pick an option** · `R` restart · **`C` players** · `P` presenter · `W` weak signals.
**Deep links (pitch backups):** `?player=house|business` + `?demo=intent | step&n=N | live | event&n=N | options&n=N | finale | weak`.

## Decisions (and why)
- **Data, not code:** the engine has zero knowledge of houses or coffee bars. This is the scalability proof: Lina is a new data file.
- **Deterministic scoring, visible:** the HUD states the formula. Kate can recommend a non-KBC option (e.g. a refurbished machine beats leasing), which builds trust.
- **Customer control:** any available option can be chosen, even one that breaks a limit. The engine re-scores later events on the plan the customer actually has.
- **Fixed event order:** the pitch needs a reliable story. The engine itself would handle any order.
- **HUD instead of the presenter panel:** the adaptive loop is the innovation, so it is always visible on stage. The presenter panel (P) still shows the signals.

## Known limits / improvement ideas
- Event-driven products (leasing, factoring, advance) do not yet count in KBC revenue / partner leads in the finale.
- Multi-goal interdependence (home + business sharing one monthly budget) is not modelled yet. Natural next step: a shared `monthly` constraint across two runs.
- Events are scripted per goal. A real system would trigger them from signals (quote received, payment overdue, salary stopped with consent).
- The locked players are mock-ups: no data yet.
- The danger colour is not from KDL (no public token found).

## Status checklist
- [x] Engine + 24 new tests (37/37 green with the bank tests)
- [x] Players screen, live plan, events, options, HUD, finale
- [x] Lint, build green; full keyboard run of both players checked in Chrome (no console errors)
- [x] `main` merged into `victor` (11:10). The UI uses static players, with no Supabase call (Victor's decision); the bank code is kept.
- [ ] Merge `victor` into `main`: this disconnects the live Supabase customer from the UI, so agree with Kepa/Simon first

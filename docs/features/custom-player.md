# Feature — "Your own" player (Demo V2 P5)
> Owner: kepa (agent, branch `custom-player`) · Status: done · Last update: 14:25

## Goal
Show that the trained moment model **adapts** to the customer's situation. The presenter picks one of the 6 Supabase
demo customers, switches life signals on and off, and watches the model's confidence per moment, its "why" and the
decision level change live. "Let Kate plan it" then hands the backend plan to the existing phone flow.

## How it works (files, data, contracts/APIs)
- `web/src/components/custom/model.ts` (pure, browser-safe, tested in `model.test.ts`):
  - `base(slug)`: snapshot facts (`backend/data/snapshot`) → `toEvents` → `extractSignals` (snapshot signal rules, as of `DEMO_AS_OF`) → `buildContext`. Exactly what the backend sees offline.
  - `TOGGLES`: 8 life signals; each groups real `SignalCode`s (together: every non-disruption code of `FEATURE_NAMES`). No invented features.
  - Toggle state `own | sim | off`: `own` = the customer's own signals (start state, identical scores to the backend), `off` = all the group's codes removed, `sim` = own signals plus simulated fresh ones for the `adds` codes (the backend's strength formula: rule strength × saturation(3) × decay(7 days)).
  - `score()`: `features()` + `predict()` + `engine/weights.json` (lr-2026-10-20) per moment; level = backend thresholds from `rules.intents` (ask ≥ 0.5, suggest ≥ 0.85); top 3 contributions relabelled with the signal rule labels.
- `web/src/components/custom/CustomPlayer.tsx`: the screen (base customer, switches, confidence bars with 50 % / 85 % ticks, why chips, Kate's line, "Let Kate plan it").
  - Top moment with goal `BUY_AND_PREPARE_HOME` / `START_BUSINESS` (the two plan templates) → `startJourney(slug, goalType)` from `web/src/lib/backend.ts` → Stage `handoff()` → phone "path" screen (house story or business story). API down → `null` → Stage's local engine journey.
  - Other moments → "<name>, I see you're <moment>; that plan isn't ready yet." (button disabled). Below 50 % → Kate stays quiet.
- `web/src/components/custom/YourOwnSlot.tsx`: player 3 card (night silhouette with "?"), beside the 3D card and under the 2D cards.
- Integration (small diffs, Victor FYI): `Stage.tsx` (screen `custom`, `handoff`, key `3`, `keepGoal` so the persona reset does not wipe the goal just created), `CharacterSelect3D.tsx` / `CharacterSelect.tsx` (optional `onCustom` prop). The screen is code-split (`next/dynamic`): the snapshot is only loaded when it opens.

## Signal → feature mapping
| Toggle | Codes removed when off | Simulated when switched on |
|---|---|---|
| Simulated a home loan | MORTGAGE_SIMULATION, HOUSING_BUDGET_VIEW, HOME_LOAN_VIEW, HOME_LOAN_KATE_QUESTION, HOME_LOAN_APPLICATION | MORTGAGE_SIMULATION, HOUSING_BUDGET_VIEW, HOME_LOAN_VIEW |
| Saving for a down payment | SAVING_FOR_DOWN_PAYMENT, PROPERTY_VALUATION_VIEW, HOME_SEARCH_IN_APP, RENOVATION_VIEW, NOTARY_PAYMENT | SAVING_FOR_DOWN_PAYMENT, PROPERTY_VALUATION_VIEW |
| First freelance invoices | FREELANCE_INCOME, SALARY_STOPPED | both |
| Read about starting a business | START_IT_VIEW, BUSINESS_ACCOUNT_VIEW, BUSINESS_KATE_QUESTION, BUSINESS_TOOLS_VIEW, BUSINESS_PROTECTION_VIEW | START_IT_VIEW, BUSINESS_ACCOUNT_VIEW, BUSINESS_KATE_QUESTION |
| Pays for pro tools and equipment | ACCOUNTING_TOOL_PAYMENT, EQUIPMENT_PURCHASE | both |
| Baby shop and family pages | BABY_SPENDING, CHILD_BORN, CHILDCARE_PAYMENT, FAMILY_PROTECTION_VIEW, FAMILY_KATE_QUESTION | BABY_SPENDING, FAMILY_PROTECTION_VIEW, FAMILY_KATE_QUESTION |
| Looked at EV loans | EV_LOAN_SIMULATION, EV_PAGE_VIEW, EV_KATE_QUESTION, EV_CHARGING, CAR_LOAN_ENDING | EV_LOAN_SIMULATION, EV_PAGE_VIEW |
| Pension fund page views | PENSION_VIEW, RETIREMENT_KATE_QUESTION, ESTATE_PLANNING_VIEW, LUMP_SUM_INVESTMENT | PENSION_VIEW, RETIREMENT_KATE_QUESTION, ESTATE_PLANNING_VIEW |

Demo script: Thomas (quiet, 9 % home) → "Read about starting a business" (74 %, Kate asks) → "First freelance invoices" (89 %, Kate suggests) → Let Kate plan it → START_BUSINESS plan for Thomas. Nadia → 95 % baby → "plan isn't ready yet". All off → Kate quiet for everyone.

## Decisions (and why)
- Client-side `predict` (the model files are pure, no `server-only`): bars move instantly and offline; the backend is only called for the plan.
- Toggles group several codes so "all off" really means no life evidence (NO_ACTION for all 6), and so one switch is one human sentence.
- The start state is the customer's own data, untouched (test: same scores as the backend input).
- No 3D diorama for slot 3: `dioramas.ts` is being edited for P4; a DOM silhouette card avoids a conflict and new assets.

## Known limits / improvement ideas
- The model gives FREELANCE_INCOME a small weight (2.1): invoices alone do not move STARTING_BUSINESS; EQUIPMENT_PURCHASE (35.1) dominates. Worth a look in the training data (ML owner).
- The toggled signals are not sent to the backend: the plan is built from the base customer's real facts (no API to inject signals). The goal type comes from the client-side model.
- After the handoff, the phone shows the local persona's story copy (Lina / Thomas names in the footer and HUD); disruptions are replayed in the backend only when the base customer is Sofie (house) or Lucas (business), otherwise the local story's events are used.
- Back from the path screen goes to the local intent screen, not to the custom screen.

## Status checklist
- [x] Pure mapping + tests (toggles → features → predict, thresholds, all-off, Lucas/Thomas cases)
- [x] Screen + player 3 slot (3D and 2D pickers), key 3, Esc back
- [x] Handoff to the phone flow (live backend plan; local fallback verified with the API blocked)
- [x] Prod build verified in a browser, 0 console errors; screenshot `docs/screenshots/demo-v2/custom-player.png`

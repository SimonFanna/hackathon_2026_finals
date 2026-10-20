# Feature — House journey V0 (engine + first UI)

> Owner: coordinator (engine) + peer agent (UI), both on branch `kepa` · Status: done, UI being redesigned (`ux-redesign.md`) · Last update: 10:05

## Goal

End-to-end demo of the hero journey "I'm buying a 1975 house", **without Supabase**: static TypeScript data, pure engine, Next.js UI.

## How it works

| Part | Location |
|---|---|
| Engine (types, demo data, pure functions, tests) | `web/src/engine/` — `types.ts`, `data.ts`, `engine.ts`, `index.ts`, `engine.test.ts` |
| UI V0 | `web/src/app/`, `web/src/components/journey/` (JourneyApp, IntentPanel, StepCard, ScoreboardPanel) |

Import everything from `@/engine`:

```ts
demoCustomer, demoSignals                    // synthetic data
detectIntents(customer, signals)             // → DetectedIntent[] (confidence, needsConfirmation, reasons)
buildJourney("buy_house", customer)          // → Journey (11 ordered steps)
initState(journey)                           // all steps "pending", all consents false
decide(state, stepId, "accepted"|"skipped")  // immutable
setConsent(state, stepId, field, ok)         // immutable
scoreboard(state)                            // triple-win totals
```

- **Intent detection:** each distinct signal type adds independent evidence: `confidence = 1 − Π(1 − weight)`. The threshold is 0.75. The demo signals give 0.69, so `needsConfirmation = true` and the UI asks "Is this your project?".
- **Steps:** 11 steps using verbatim catalogue labels from `resources/KBC_Ecosystems.xlsx`:
  - Partners: Immoscoop ×2, De Immowinkel, Setle, Impact us today ×2.
  - KBC: housing budget, home loan, solar, energy loan, home insurance.
- **Scoreboard:** only accepted steps count. A partner gets a lead **only** if the step is accepted **and** at least one data field is consented.
- Commands (in `web/`): `npm test`, `npm run lint`, `npm run build`, `npm run dev -- -p 3100`.

## Decisions

- Static data first: no network dependency for the demo, and Supabase can be swapped in later.
- Privacy by default: every consent starts at `false`.
- No LLM in decisions: the logic stays deterministic and explainable.
- €/kWh/CO₂ figures are illustrative estimates, and the UI says so.

## Known limits / improvement ideas

- The UI V0 is too cluttered (3 columns), so it is being redesigned (`ux-redesign.md`).
- Only one intent so far. Adding "start a business" would prove that the engine generalises.
- `buildJourney` ignores the customer: no personalisation yet (e.g. skip the home loan if the customer is a cash buyer).
- Signal weights are hand-tuned. They could be calibrated or learned later.
- The EPC rule (label D within 5 years) still needs to be verified.

## Status checklist

- [x] Scaffold `web/`
- [x] Engine + tests (8 green)
- [x] UI wired to the engine (build, lint and tests green)
- [ ] Deployed (live URL)

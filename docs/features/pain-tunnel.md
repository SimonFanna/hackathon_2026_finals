# Feature - Pain tunnel: Thomas's year
> Owner: Victor / Codex | Branch: `victor-pain-tunnel` | Status: done

## Goal

Make the customer problem tangible before revealing the solution. A game-inspired interactive story follows Thomas, 30, buying and renovating his first home in Gent. Costs, unfamiliar decisions, and separate conversations accumulate. Four setbacks break the original plan. The visitor can then rewind the same year and enter the existing guided demo with Kate.

The central pain: every decision can make sense separately while the whole project stops fitting the customer's life.

## Experience

Seven chapters, ten manually advanced frames:

| Chapter | Visual and message | Presenter cue |
|---|---|---|
| 1. The dream | Original illustrated house, pixel Thomas, warm windows, heart, asking price | His first home. He wants to move in before his lease ends. |
| 2. The real price | A printed receipt builds a complete project budget | The asking price is only one part of the project. |
| 3. The unknowns | Unanswered questions surround Thomas and the house | He needs to know what to ask before he can ask for help. |
| 4. The coordination | Messages from five separate interlocutors | Thomas has to connect every change himself. |
| 5. Life happens | Four game event windows: rate increase, quote overrun, delay, job loss | Each change affects several parts of the same plan. |
| 6. The result | PLAN OVERLOAD, computed score, four project limits | The unchanged plan has three broken limits. |
| 7. Try again | The world rewinds, Kate joins Thomas, the palette turns cyan | Same goal, same setbacks, a plan that adapts. |

Navy, cream and amber establish an arcade world that remains connected to KBC. Coral marks damage; cyan introduces Kate. All artwork is repo-native SVG/CSS, including the house, scaffolding and pixel characters. No downloaded imagery, added dependency, sound or autoplay.

The story uses Thomas as a first-time buyer trying to do the right thing. It does not portray him as incompetent. KBC and its partners already offer support; the footer and result explain that this is a simulation in which the initial plan is not adapted.

## Data and framing

- `buildPainRun()` calls the existing `hit` / `resolve` loop, choosing each event's `keep` strategy.
- Health sequence: **100 -> 79 -> 69 -> 46 -> 22**. This is an illustrative engine score, not a probability of success.
- Final state: project cost EUR401,800 / budget EUR400,000; repayments EUR1,910 / affordable limit EUR1,450; move-in month 14 / deadline month 13; savings EUR19,150 / minimum EUR10,000.
- The last chapter rewinds the HUD to the starting plan before entering the guided demo.
- The receipt uses a synthetic EUR320,000 listing, EUR16,000 illustrative purchase/financing costs, and the remaining renovation budget calculated from the engine's EUR390,000 starting project cost. It asserts no legal rate and charges no seller certificates to the buyer.
- The single fact card cites the CBC survey reported in [KBC's January 2026 release](https://www.kbc.com/content/dam/kbccom/doc/newsroom/pressreleases/2026/20260129%20MyHome_EN.pdf): 71% do not know which renovation grants or help exist. The source opens in a new tab.
- The delayed contractor is generic in both versions. Impact us today remains an available network rescue option.
- The job loss is described as a life event received by Thomas, without suggesting that Kate is already present or inferred sensitive information.

## Entry points and controls

| URL / control | Behaviour |
|---|---|
| `/` | Start the story |
| `/?pain=1` through `/?pain=7` | Open a chapter |
| `/?pain=5&hit=1` through `hit=4` | Open a specific setback |
| `&still=1` | Disable all animation for screenshots / slides |
| `/?intro=0` | Go directly to the existing player selector |
| Existing `?demo=...` and `?player=...` | Bypass the story and keep existing demo behaviour |
| Primary button / Right / Space / PageDown / Enter | Next frame; final frame starts Thomas's guided journey |
| Back button / Left / PageUp | Previous frame |
| Skip intro / Escape | Existing player selector |
| Chapter timeline | Jump to any chapter |

Replay goes straight to Thomas's home screen, not back through character selection. The URL becomes `?intro=0&player=house`, so reload keeps the guided entry point. Scene navigation updates the URL without adding browser-history entries. There is no localStorage dependency.

Mobile uses a vertically stacked, scrollable layout. Desktop slides target 1600x900 and 1280x720. Keyboard controls ignore editable fields, modifiers and repeats, and do not double-advance when Enter activates a focused button. Native buttons, visible focus, labelled navigation and polite live announcements support keyboard use. Reduced-motion preferences and still mode disable ambient motion, shake and transitions.

## Implementation

| File | Responsibility |
|---|---|
| `web/src/components/pain/IntroExperience.tsx` | Client entry, URL routing, skip and direct replay |
| `web/src/components/pain/PainTunnel.tsx` | Ten frames, HUD, keyboard controls, chapter navigation |
| `web/src/components/pain/World.tsx` | Original vector house and pixel character artwork |
| `web/src/components/pain/copy.ts` | Narrative copy, questions, messages and fact source |
| `web/src/components/pain/model.ts` | Engine counterfactual, formatting and URL interpretation |
| `web/src/components/pain/pain.css` | Scoped visual styling, compact projector/mobile layouts and reduced motion |
| `web/src/components/pain/model.test.ts` | Counterfactual consistency, scenario changes and entry point tests |
| `web/scripts/export-pain.mjs` | Dependency-free local Chrome browser checks and screenshot export |

Minimal integration edits: `app/page.tsx` renders `IntroExperience`; `Stage` accepts an optional `startAtHome` prop; the house delay event has a generic contractor source. Existing decision and scoring rules are unchanged.

## Screenshots and browser verification

Use Node 22+ and a local Chrome/Edge executable. From `web/`, after a production build:

```powershell
node node_modules/next/dist/bin/next start -p 3178
# In another terminal:
$env:PAIN_BASE_URL = 'http://localhost:3178'
node scripts/export-pain.mjs
```

Optional: `CHROME_PATH` selects a browser executable. The script launches a separate headless browser with an isolated temporary profile, exports the ten desktop frames plus projector/mobile captures to `docs/screenshots/pain/`, and writes `checks.json`. It checks all chapters for overflow, replay, skip, clicker controls, existing house/business links and reduced motion. No browser package is installed in the project.

## Pitch suggestion

Use a short selection of exported scenes: dream -> complete budget -> coordination -> renovation quote -> result -> replay. Keep the full four-event story available for exploration. The pitch should explain that the result is an unchanged-plan simulation; it is not evidence that every customer without the prototype fails.

KBC/partner business value stays in the existing finale to preserve one customer story at the start.

## Known limits / improvement ideas

- Events are scripted illustrative scenarios, as in the existing demo; no real partner actions or credit decisions occur.
- The receipt breakdown is illustrative and is not a purchase-cost calculator.
- The story is designed for manual presentation; a video or PPT deck is not generated automatically, only its PNG assets.
- The separate Lucas 3D concept is not integrated. Use one hero in the final three-minute pitch.

## Validation

- Lint and production build passed during implementation.
- 261 unit tests passed, including four new story tests; the existing opt-in scoring-speed benchmark is skipped unless `BENCH=1`.
- Chrome browser validation passed: 46 checks, no console errors. All ten frames fit a 1600x900 slide; all seven chapters fit a 1280x720 projector; all chapters avoid horizontal overflow at 390px mobile width. Direct replay, skip, clicker next/back, focused-button Enter, existing house/business demo links, still mode and reduced motion were checked.
- Thirteen PNG captures and `checks.json` are available in `docs/screenshots/pain/`. Desktop captures are static slides; the two mobile captures show the full scrollable page.

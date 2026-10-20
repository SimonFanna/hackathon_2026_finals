# Feature — House journey UX redesign (V1)
> Owner: Kepa's UI terminal · Status: done (V1 shipped) · Last update: 10:20

## Goal

Replace the cluttered V0 (3 columns, 11 cards at once, a wall of toggles, a heavy permanent scoreboard) with a **calm, one-thing-at-a-time KBC Mobile experience voiced by Kate**. It must:

- look and feel like real KBC (KBC Design Language, not an invented style);
- make the customer's control obvious (one human consent sentence per partner);
- read well on a projector in a dark room, and work as a real phone app;
- end on a strong triple-win screen built for the pitch.

**Design read:** a mobile banking guided journey (Operate mode) with a Persuade finale, for a KBC retail customer and a jury watching a projector, in KDL. The tone is calm and trust-first, in Kate's voice. Dials: variance 4 · motion 5 · density 3.

---

## How it works

### Same engine API, new screens
- **Engine:** imports only from `@/engine`: `demoCustomer`, `demoSignals`, `detectIntents`, `buildJourney`, `initState`, `decide`, `setConsent`, `scoreboard`. **No change required** (optional requests in §Decisions D8).
- **Files (built):** everything lives in `web/src/components/journey/`.
  - `Stage.tsx`: state machine, presenter keys, phone scaling, finale layout.
  - `Phone.tsx`: frame and status bar.
  - Screens: `HomeScreen.tsx` (S1), `IntentScreen.tsx` (S2, S2b), `PathScreen.tsx` (S3), `StepScreen.tsx` (S4: card, consent block, segmented progress, impact pill), `PlanScreen.tsx` (S5), `Finale.tsx` (S6, stage and in-app variants).
  - Sheets: `Sheet.tsx` (bottom sheet with focus trap, plus the switch) and `Sheets.tsx` (Why, Choose what to share, How we estimate this).
  - `PresenterPanel.tsx` (key P).
  - Small parts: `Kate.tsx` (Kate mark and line), `KbcLogo.tsx`, `AnimatedNumber.tsx`, `ui.tsx` (buttons, layout).
  - Helpers: `copy.ts` (Kate copy, chapter labels, consent purpose lines), `format.ts`, `useViewport.ts`.
- **Screenshots:** in `docs/screenshots/`. Desktop: `s1`…`s6` at 1600×900 @2x. Mobile: `mobile-s1`, `mobile-s4` at 390×844.
- **Tokens and font:** KDL tokens as CSS variables in `web/src/app/globals.css`; Nunito Sans loaded via `next/font` in `layout.tsx`.
- **Logo:** `web/public/brand/kbc-logo.svg`, taken from the KDL asset library on kbc.be.
- **New dependencies:** `motion` (screen transitions, springs, count-up) and `@phosphor-icons/react` (one icon family).
- **Presenter keys:** `→` / `Enter` = primary action of the screen, `←` = back, `S` = skip (or "Not now" on S2), `R` = restart, `P` = presenter panel.

### 1. KBC brand tokens (verified, live)

**Sources**
1. **Official KDL token stylesheet served by kbc.be**, read live on 2026-10-20: `wcmassets.kbc.be/etc.clientlibs/kbc/components/kdl-design-tokens.latest.min.<hash>.css`. It holds 4 themes: `:root` (KBC retail), `.kdl-theme-dark`, `.kdl-theme-high-contrast` and `.kdl-theme-private-banking`.
2. **kbc.be production CSS** (32 stylesheets, occurrence counts) for fonts, radii, shadows and transitions.
3. [kbc.com — Our brand](https://www.kbc.com/en/about-us/our-brand.html): the logo is "the blue swimmer"; PEARL values.
4. [Kan Design — KBC](https://www.kandesign.com/en/work/kbc): the logo is "a banker who welcomes you with open arms".
5. [KBC Newsroom — Kate: five years and five milestones](https://newsroom.kbc.com/kate-five-years-and-five-milestones) (Nov 2025):
   - 5.8M users;
   - proactive suggestions in 140+ situations;
   - future advice on "housing, mobility and energy";
   - **"Kate will never implement anything without explicit customer approval."** This is our pitch line.
6. [kbc.be — Kate](https://www.kbc.be/retail/en/kate.html): real tone-of-voice samples.
7. Cross-check: [Brandfetch kbc.be](https://brandfetch.com/kbc.be) (#0097DB / #003665). #003665 is the old print navy; KDL's **#0D2A50** is the digital truth.

There is no public brandbook. The production design system above is a stronger source than any PDF.

**Colours (`:root`, KBC retail)**

| Role | KDL token | Value |
|---|---|---|
| Night blue: main text, titles, stage background | `--kdl-color-primary-main` | `#0D2A50` |
| Darker night blue: pressed state, stage gradient | `--kdl-color-primary-main-600` | `#021E43` |
| Secondary text | `--kdl-color-primary-main-300` | `#45658F` |
| Borders, dividers | `--kdl-color-primary-main-100` | `#BFDAFF` |
| **The one accent**: CTA, progress | `--kdl-color-primary-accent` | `#0097DB` |
| Accent as text on white (links, small text) | `--kdl-color-primary-accent-600` | `#007AB1` |
| Accent tint (chips) | `--kdl-color-primary-accent-100` | `#E5F4FF` |
| App background | `--kdl-color-surface-background` | `#F2F2F2` |
| Element background (info blocks) | `--kdl-color-surface-element` | `#F2FAFF` |
| Cards | `--kdl-color-elevation-01` | `#FFFFFF` |
| **Kate** (Kate mark only) | `--kdl-color-os-kate` | `#55C7DF` |
| Energy / CO₂ impact (semantic only) | `--kdl-color-sustainability-green` / `-600` | `#1DB955` / `#00903D` |
| Warning | `--kdl-color-system-warning` | `#DC7507` |
| Modal scrim | `--kdl-color-overlay-default` | `rgba(13,42,80,.4)` |

- **Colour strategy: restrained.** Neutrals, one accent (`#0097DB`), and two single-purpose semantic colours (Kate cyan, sustainability green). No gradients except the flat night-blue stage, no decorative colour.
- **Contrast:** white on `#0097DB` is **3.26:1**, which passes AA for *large* text only. So CTA labels are **19px bold** (≥14pt bold), and any small blue text on white uses `#007AB1` (**4.75:1**).

**Typography**
- Production uses **Museo Sans** 300/500/700 (80× `font-family:"MuseoSans"` in kbc.be CSS). It is commercial, so it is **never committed**.
- Stack: `"Museo Sans", "Nunito Sans", system-ui, sans-serif`. **Nunito Sans** (`next/font`) is the closest free match: same geometric-humanist build and the same softness.
- Scale inside the phone (CSS px before scaling):

| Use | Size / leading | Weight | Tracking |
|---|---|---|---|
| Screen title | 28/32 | 800 | −0.02em |
| Card title | 22/27 | 700 | −0.01em |
| Kate line | 17/24 | 500 | 0 |
| Body | 16/23 | 400 | 0 |
| Label | 13/18 | 600 | +0.01em |
| Impact number | 40/40 | 800 | −0.02em, `tabular-nums` |

- No uppercase mono micro-labels. Hierarchy comes from weight and colour.

**Shape and depth (kbc.be CSS)**
- **Cards 8px**, chips and inputs 4px, **buttons pill 100px**. These are exactly the three dominant values in production (4px ×66, 8px ×40, 100px ×18).
- The phone screen corner (44px) is the one documented exception: it mimics the hardware, not the UI.
- Card shadow `0 4px 16px rgba(0,54,101,.08)`; raised `0 4px 16px rgba(0,54,101,.16)`. Shadows are blue-tinted, never black.

**Logo:** the "blue swimmer" over "KBC", accent `#0097DB` + night blue `#0D2A50`.
- Rendered once through `<KbcLogo/>`, at the top of the app.
- Never stretched or recoloured; clear space ≥ the height of the symbol.
- Used within the KBC challenge. Footer: "Built for the KBC challenge at Tectonic Hackathon 2026".

**Tone of voice (Kate, from kbc.be)**
- Short, "you", reassuring: "No stress. Kate it.", "When you're really in a rush, Kate is there for you."
- No emoji, very light humour, exclamation marks only in calls to action.
- Our rules: Kate speaks in **one sentence**, names **one observed fact**, asks **one question**. She never promises on KBC's behalf and never decides for the customer.

**Illustration and photo**
- No public guide to KBC Mobile illustration, so we invent no illustrations.
- The only hero visual is Sofie's house: a real photo of a 1970s Flemish house. Until replaced, a `picsum` placeholder labelled *synthetic*.
- Icons: **Phosphor Regular** only (the KBC icon font `iconskbc` is proprietary).

### 2. Benchmark: patterns we steal

| Product | What we steal | Where it lands | Source |
|---|---|---|---|
| **Monzo Salary Sorter** | Turn a detected event into a one-tap workflow ("from a notification into a workflow"). Monzo's principles "good friction" and "attention as currency" (spend magic moments sparingly). | S1 Kate notification → S2 question; one card at a time | [monzo.com blog](https://monzo.com/blog/2019/09/26/introducing-salary-sorter-and-bills-pots), [Flat Studio](https://www.flatstudio.co/blog/neobank-ux-patterns-daily-banking), [Monzo magic moments](https://monzo.com/blog/2022/11/04/how-we-design-magic-moments-at-monzo) |
| **Airbnb Setup** | A 3-part overview before you start, then one main button per screen. A live outcome estimate while you fill it in ("hosts… are earning $89"). A human fallback is always reachable. | S3 path overview; the impact pill on S4; "Talk to a KBC advisor" on S5 | [Airbnb 2022 Winter Release](https://news.airbnb.com/2022-winter-release/), [Chameleon](https://www.chameleon.io/inspiration/airbnb-value-reminder) |
| **Duolingo Path** | Replace free choice with **one next-best step**: Duolingo's tree → path reboot reported +3.7% bookings. Three node states: done / current / locked. Critics say it removes control, so we keep a visible **Skip**. | S4 single step; segmented progress (done / current / upcoming) | [Duolingo blog](https://blog.duolingo.com/new-duolingo-home-screen-design), [Apple dev news](https://developer.apple.com/news/?id=jhkvppla) |
| **Setle** (a real KBC partner) | Address or EPC in, plan out. Measures as cards that toggle on/off and recalculate instantly. Outputs: label change (F→B), grants (€), yearly saving (€). | Step outcome line; renovate chapter; label E → D/B shown in the step | [setle.app](https://setle.app/en), [KBC Brussels — Setle](https://www.kbcbrussels.be/retail/en/products/payments/self-banking/on-your-smartphone/mobile/setle.html) |
| **Octopus Energy Saving Sessions** | A one-line personal result with kWh + money. Users distrusted unexplained baselines, so show **"How we estimate this"**. | S6 finale + an "How we estimate this" sheet | [Octopus analysis PDF](https://octoenergy-production-media.s3.amazonaws.com/documents/Octopus_Energy_Saving_Sessions_Analysis.pdf) |
| **Year in Monzo** | A shared skeleton with personal data layered in, ending on one summary card; each stat paired with a one-liner. | S6 finale: each number gets a one-line meaning | [Monzo — writing Year in Monzo](https://monzo.com/blog/writing-year-in-monzo-2024) |

**Consent references** (they shaped D5):
- **Plaid Link:** co-branded headline "[App] uses Plaid to connect…", with a "Why is this needed" half-sheet listing purpose + data scopes. [docs](https://plaid.com/docs/link/data-transparency-messaging-migration-guide/)
- **UK Open Banking (OBIE) CX guidelines:** state the **purpose**, **who** gets the data, and the **duration** (once vs ongoing). Show data by plain-language clusters with drill-down; confirm success; offer a revoke dashboard. [OBIE](https://standards.openbanking.org.uk/customer-experience-guidelines/account-information-services/account-information-consent/v3-1-3/)
- **Sign in with Apple:** one sheet, pre-filled, "share or hide", and the advice "err on the side of minimum amount of information". [WWDC19 706](https://developer.apple.com/videos/play/wwdc19/706)

**Kate in production:**
- A blue icon or search bar at the top of KBC Mobile; chat + voice.
- Proactive mode is opt-in ("advanced Kate"). Proposals come "in a discreet way", and the customer is "completely free to accept or not".
- 24% of 27.8k proactive notifications were accepted (May 2021); ~1.3M nudges/month today; ~12% of conversations hand off to KBC Live.
- Sources: [Ergomania](https://ergomania.eu/fintech-belgium-kbc-kate-voice-user-interface/), [KBC newsroom](https://newsroom.kbc.com/kate-your-personal-digital-assistant). Kate's avatar is **not public**.

**⚠️ Competitive context (verified 10:32):**
- **Verified:** since March 2026, KBC Mobile has a **MyHome** dashboard with Setle, Eliq, Immoscoop, Impact us today and Immowinkel. It is only for customers who opted into "extra convenience", with Kate as the first point of contact ([KBC press release, 29 Jan 2026](https://www.kbc.com/content/dam/kbccom/doc/newsroom/pressreleases/2026/20260129%20MyHome_EN.pdf)).
- Immoscoop already runs inside KBC Mobile: saved searches, Kate alerts, name and email shared ([kbc.be](https://www.kbc.be/retail/en/products/payments/self-banking/on-your-smartphone/mobile/immoscoop.html)).
- The KBC × Immoscoop **haalbaarheidsattest** links a property to a KBC loan application ([Immoscoop](https://www.immoscoop.be/content/blog/persbericht-bereal-kbc-en-immoscoop-lanceren-haalbaarheidsattest-voor-kandidaat-kopers)).
- The "Why am I seeing this?" sheet says the Immoscoop signal is used only because the customer searches inside KBC Mobile and turned on extra convenience. That KBC uses saved searches as a signal is **our assumption**.
- So our pitch must not be "we bundle housing partners"; KBC already does that. Our difference:
  - **(1) proactive detection** from signals;
  - **(2) a sequenced plan** across ecosystems (housing → finance → energy → insurance), not a toolbox;
  - **(3) per-step, per-partner consent**;
  - **(4) a measured triple win**;
  - **(5) one generic engine:** a new intent is new data.

### 3. Screen-by-screen flow

Legend: `[ Button ]` = primary pill `#0097DB`; `Link` = text `#007AB1`.

**S0 — Stage (desktop / projector)**
```
┌──────────────────────── flat #021E43 → #0D2A50 (no grid, no texture) ────────────────────────┐
│                                                                                              │
│  (presenter panel, key P)               ┌──────────────┐                                     │
│                                         │  status bar  │                                     │
│                                         │              │                                     │
│                                         │    phone     │  ← scaled to 92% of viewport height │
│                                         │   (S1…S5)    │    blue-tinted shadow               │
│                                         │              │                                     │
│                                         └──────────────┘                                     │
│  Sofie, 32 · Gent · synthetic demo customer               Built for the KBC challenge · Tectonic │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```
Dark stage for a dark room: no glare, and the light phone pops. Two 13px captions at 60% opacity, nothing else.

**S1 — KBC Mobile home + Kate notification** (the "before they realise they need help" hook)
```
┌───────────────────────────┐
│ 9:41              ▂▄▆ ▮   │
│ ┌───────────────────────┐ │  ← slides down from the top 1.2s after load
│ │ ◉ Kate · now          │ │    (spring, no bounce)
│ │ Looks like you're     │ │
│ │ house hunting. Want a │ │
│ │ hand with the plan?   │ │
│ └───────────────────────┘ │
│  [KBC logo]               │
│  Good evening, Sofie      │
│  ┌─────────────────────┐  │  ← low-contrast decor: a normal banking app
│  │ Current account     │  │
│  │ € 4,218.40          │  │
│  └─────────────────────┘  │
│  ┌─────────────────────┐  │
│  │ Savings  € 38,900   │  │
│  └─────────────────────┘  │
└───────────────────────────┘
```
Tapping the notification goes to S2. The rest of the home screen is inert decor (`aria-hidden`).

**S2 — Kate asks: "Is this your project?"**
```
┌───────────────────────────┐
│ ‹                         │
│ ◉ Kate                    │  ◉ = #55C7DF disc
│ "You saved 4 houses on    │  Kate line 17/24, fades in (60ms stagger per line)
│  Immoscoop and simulated  │
│  a €320k home loan."      │
│                           │
│ Are you planning to       │  title 28/32, 800
│ buy a home?               │
│                           │
│ Kate isn't sure yet,      │  16/23 #45658F
│ so she's asking first.    │
│                           │
│ Why am I seeing this?  ⌄  │  Link → sheet listing the 3 signals (source, date, label)
│                           │  + "Nothing has been shared yet."
│ [ Yes, I'm buying a home ]│  ← thumb zone
│        Not now            │
└───────────────────────────┘
```
- **Not now** → S2b: "Got it. Kate won't bring this up again. Nothing was shared." plus `Back to home`. No journey is built. This is the privacy beat of the pitch.
- If `needsConfirmation === false`, the screen is the same, but the line becomes "Here's a plan for your new home." and the CTA becomes `[ Show my plan ]`.

**S3 — Your path (overview before step 1)**
```
┌───────────────────────────┐
│ ‹                         │
│ [1975 house photo, 16:10, │  ← the only hero visual, radius 8
│  synthetic]               │
│ Your path to a home       │  28/32
│ in Gent                   │
│                           │
│ 1  Find the house     2   │  4 rows, step count on the right in #45658F,
│ 2  Finance it         2   │  separated by space, not rules
│ 3  Renovate           6   │
│ 4  Protect            1   │
│                           │
│ One step at a time. You   │
│ decide what is shared.    │
│ [ Start ]                 │
└───────────────────────────┘
```

**S4 — One step (×11)**
```
┌───────────────────────────┐
│ ‹   ▰▰▰▱ ▱▱ ▱▱▱▱▱▱ ▱      │  segmented bar grouped by chapter (1 segment = 1 step)
│     Finance · 3 of 11     │  13/18
│                  +€5,000  │  ← impact pill: quiet, grows (600ms count-up)
│ ◉ "Your simulation says   │  Kate line = step.why
│   ~€320k. Let's check it  │
│   fits your income."      │
│ ┌───────────────────────┐ │  card, radius 8, shadow .08
│ │ [KBC mark] KBC        │ │  or "Setle · Partner of KBC"
│ │ Calculate your        │ │  22/27, 700 (step.title)
│ │ housing budget        │ │
│ │ Save up to €5,000     │ │  one outcome line: the strongest one available
│ │                       │ │  (customer € > kWh > none; kWh/CO₂ in sustainability green)
│ │ Stays with KBC.       │ │  KBC step: one line. Partner step: consent block ↓
│ │ Nothing is shared.    │ │
│ └───────────────────────┘ │
│ [ Add to my plan ]        │
│        Skip               │
└───────────────────────────┘
```
**Consent block (partner step)**, which replaces "Stays with KBC":
```
│ │ Share your property address │ │  WHO + WHAT: one human sentence, fields as inline chips
│ │ and EPC label with Setle?   │ │  (accent-100 bg, #0D2A50 text)
│ │ So Setle can estimate your  │ │  WHY (purpose, OBIE): from a per-partner copy map
│ │ renovation and grants.      │ │
│ │ Shared once. Choose what ›  │ │  HOW LONG + drill-down link → per-field sheet
│ └─────────────────────────────┘ │
│ [ Share and continue ]          │  = setConsent(every field, true) + decide(accepted)
│   Continue without sharing      │  = decide(accepted), consents stay false → no lead
│   Skip                          │  = decide(skipped)
```
- The sentence is built in the UI from `dataShared` + the provider name: `"Share your " + naturalList(fields) + " with " + name + "?"`. **No engine change.**
- The purpose line ("So Setle can…") comes from a small UI copy map keyed by partner (`copy.ts`). It falls back to "So {partner} can prepare this step for you."
- "Shared once" is honest for the demo (no ongoing feed). Pattern: Plaid "Why is this needed" + OBIE purpose/duration + Apple "minimum information".
- After "Continue without sharing", a 2s toast (not a modal): "Added. Setle won't contact you; you can reach them yourself."
- **"Choose what to share" sheet:** one switch per field, initial state = engine state (`false`), plus `[ Done ]`. It previews exactly what is shared: "Setle will receive: property address, EPC label."

**S5 — Your plan is ready (inside the phone)**
```
┌───────────────────────────┐
│ Your plan is ready        │  28/32
│ 1  Find the house         │  accepted steps only, grouped by chapter;
│    Immoscoop · valuation  │  skipped steps collapse to "2 skipped"
│ 2  Finance it             │
│    KBC · home loan        │
│ 3  Renovate …             │
│ ┌───────────────────────┐ │  #F2FAFF element block
│ │ You shared 4 details  │ │  privacy recap, counted from consents
│ │ with 3 partners.      │ │
│ │ Nothing else left KBC.│ │
│ └───────────────────────┘ │
│ [ See the impact ]        │
│  Talk it through with a   │  Link: human fallback (Airbnb pattern; KBC Live exists)
│  KBC advisor              │
└───────────────────────────┘
```

**S6 — Triple-win finale** (stage takeover, the pitch moment)
```
┌──────────────────────────────────── #0D2A50 ─────────────────────────────────────┐
│  ┌──────────┐                                                                    │
│  │  phone   │   One intent. Eleven steps.                  48/52 white 800       │
│  │ (S5, at  │   Everyone wins.                                                   │
│  │ scale .82│                                                                    │
│  │ slid     │   Sofie              KBC                Partners                   │
│  │ left)    │   €14,200            5 products         3 consented leads          │
│  │          │   saved or unlocked  €11,050 revenue    €920 lead value            │
│  │          │   −17,500 kWh/yr                                                   │
│  │          │   −3.9 t CO₂/yr  (sustainability green)                            │
│  └──────────┘   Illustrative figures for the demo, not KBC data.  13px 60%       │
└──────────────────────────────────────────────────────────────────────────────────┘
```
- Figures come from `scoreboard(state)`; the values above are an example.
- Each number gets a one-line meaning (Year in Monzo). A "How we estimate this" link opens a sheet with the per-step assumptions (Octopus lesson: unexplained baselines read as random).
- Three text columns on night blue, **no cards**, so the numbers breathe.
- Below 520px wide, S6 is an in-app full screen that scrolls vertically.
- Key `R` resets the demo.

### 4. Motion rules

| Moment | What moves | How | Why |
|---|---|---|---|
| S1 notification | translateY(−110% → 0) + opacity | spring, bounce 0, duration .45 | something new arrives from the top, as on iOS |
| Kate lines | opacity + translateY 8px | 220ms `cubic-bezier(.23,1,.32,1)`, 60ms stagger | the rhythm of a conversation |
| Next card | enters from the right (24px) + fade | spring, bounce 0, duration .4 | spatial progress: moving forward |
| Accept | card scales to .96 and lifts toward the impact pill; segment fills | 280ms ease-out; segment 200ms | causality: my choice feeds my plan |
| Skip | card exits left, opacity 0 | 200ms ease-out (exit faster than enter) | set aside, not added |
| Impact numbers | count-up | 600ms ease-out, `tabular-nums` | show it growing |
| Button press | scale .97 | 100ms | instant response |
| Sheets | translateY(100% → 0) + scrim | spring, bounce 0, duration .35; close 200ms | familiar iOS pattern |
| S6 finale | phone → scale .82 and slides left; columns stagger in at 80ms | spring, bounce 0, duration .6 | zoom out onto the outcome |

- `transform` and `opacity` only. Everything is interruptible: you can accept while a card is still entering.
- `prefers-reduced-motion`: everything becomes a 150ms cross-fade, and numbers appear without counting.
- Presenter keyboard shortcuts trigger the same transition as a click, never an extra one.

### 5. States and edge cases
- **No intent detected:** S1 without a notification; the presenter panel shows "No intent above 0".
- **Intent declined:** S2b.
- **Every step skipped:** S5 says "Nothing added yet. Your plan stays here whenever you're ready." S6 shows zeros (no count-up).
- **Partner step accepted without sharing:** counts for the customer, **not** as a lead. The finale shows this honestly.
- **Back (‹):** returns to the previous step; the decision stays editable (`decide(st, id, "pending")`).
- **Accessibility:**
  - every CTA ≥ 48px tall;
  - visible focus ring (2px `#0097DB`, offset 2px);
  - Kate lines in `aria-live="polite"`;
  - sheets are modal `dialog`s that trap focus.
- **Sizes:** the phone scales from 320 to 1000px tall; below 520px wide there is no frame and the app goes full screen.

---

## Decisions (and why)

- **D1 — One thing at a time, voiced by Kate.** Kate is the voice *above* the card, not a full chat. A full-page chat was considered and rejected: actions drown in the message stream, and a card + button reads better on a projector.
- **D2 — Phone frame, but scaled.** A 390×844 phone in a 1080p projector is ~40% of the height if unscaled. We scale it to 92% of the viewport height (~×1.1) and size type from the real phone. Below 520px wide: no frame, true mobile.
- **D3 — 4 chapters (Find, Finance, Renovate, Protect)** with a segmented "stories" bar and an overview screen (S3) before step 1. Eleven flat steps feel endless; chapters give a map.
- **D4 — Presenter mode, hidden by default.** Keys:
  - `→` or `Enter`: primary action;
  - `S`: skip;
  - `R`: reset;
  - `P`: a panel on the night-blue stage, left of the phone, showing the weighted signals, confidence 0.69 vs threshold 0.75, the catalogue item of the current step, and the raw scoreboard.
  
  This serves Tech (20%) and the 5-min Q&A without cluttering the customer UI. The customer never sees a percentage.
- **D5 — Consent = one sentence + 3 honest choices.** "Share and continue", "Continue without sharing", "Skip". Per-field switches live one level deeper, in a sheet. The default stays "nothing shared" (the engine's choice).
- **D6 — Dark stage, light app.** Physical scene: a dim theatre with a projector, and a phone on a sofa at night. A night-blue surround avoids glare; the KBC Mobile light theme stays authentic.
- **D7 — Removed from V0:**
  - 3-column layout, signal feed on the main screen, permanent scoreboard;
  - the 11-card timeline;
  - the per-field toggle wall;
  - `Catalogue · …` mono labels (moved to the presenter panel);
  - uppercase mono eyebrows, the blueprint grid, Bricolage Grotesque and IBM Plex;
  - the 🔒 emoji and the infinite CTA pulse;
  - the confidence % shown to the customer.
- **D8 — Engine requests** (to the coordinator, all optional, none blocking):
  1. `chapter: "find" | "finance" | "renovate" | "protect"` on `JourneyStep` (otherwise the UI maps by `step.id`, which is fragile);
  2. split `customerEur` (one-off: valuation, grants) from a yearly saving field, since today they are summed, so the UI says "saved or unlocked";
  3. export `BUY_HOUSE_THRESHOLD` from `index.ts` for the presenter panel.

## Known limits / improvement ideas
- **Deviations from the spec:**
  - no house photo on S3, because no licensed 1970s house photo is available; the four chapter rows carry the screen;
  - the bottom sheets use a 16px top radius (iOS sheet convention, documented exception to the 8px card radius);
  - the toast sits at the top of the phone so it never covers the actions;
  - no `autoFocus` on CTAs, since presenter keys are global and auto focus drew a double outline on projector.
- **Engine export request:** the presenter panel reads `buyHouseSignalWeights` from `@/engine/data` (read only). Ask the engine owner to re-export it from `@/engine`.
- **Presenter clicker (review #10, not implemented yet):** pitch clickers send `PageDown` / `PageUp` (sometimes `Space` / `B`), not `→`.
  - Map `PageDown` and `Space` to next, and `PageUp` to back, in the Stage key handler.
  - Keep `→` / `←`.
  - Test on a borrowed laptop at 1920×1080 and 1280×720, full screen (F11), and keep the `?demo=` links on a backup slide.
- **Next ideas:**
  - a `?demo=finale` deep link, as a pitch backup if a click fails;
  - a 20s screen recording of the flow for the deck (the guide requires the demo embedded in PPT/PDF);
  - an "Undo" on the "Continue without sharing" toast;
  - dark theme from `.kdl-theme-dark` for the in-app screens.
- The Museo Sans look is approximated with Nunito Sans. If KBC supplies the font on the day, swap one line in `layout.tsx`.
- Kate's real avatar is not public. We use a neutral `#55C7DF` disc; replace it with the official Kate mark if KBC provides it.
- The house photo is a placeholder: replace it with a real (licensed) photo of a 1970s Flemish house.
- Second intent ("Starting my business") can reuse every screen unchanged: only the data differs. This is the scalability proof for the pitch.
- Optional pitch extra: an ElevenLabs voice reading Kate's lines (only if time allows after 14:00).
- Show "You can stop sharing at any time" only if a real revoke screen exists by the freeze; otherwise drop the line.

## Status checklist
- [x] KBC brand research (live KDL tokens + kbc.be CSS + KBC press)
- [x] Market benchmark (6 products + consent references + Kate in production)
- [x] Screen-by-screen flow, copy, motion rules, removals
- [x] Coordinator go
- [x] Phase 2 implementation: lint clean, 10/10 tests, build green, Impeccable detector clean, checked in the browser (desktop 1440/1600, mobile 390), screenshots saved

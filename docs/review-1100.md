# Critical review — 11:00
> Owner: Kepa's UI terminal · Status: done (read-only review, nothing implemented) · Last update: 10:50

Written as a harsh KBC jury member would read the project at 11:00, against the judging grid: **Creativity 25 · Pitch 25 · Tech 20 · Fit 20 · Security 10**.

Scope: `SOLUTION.md`, `backend/backend.md`, `web/` (engine + UI V1), `supabase/`, `scripts/`, `README.md`, `pitch/`, `docs/`.

Intent detection and confidence scoring are owned by the DB + ML team (Simon, Mathias). This review only states **what the UI needs from them** (§B), never how to score.

---

## A. Top 10 weaknesses, ranked by score impact

| # | Weakness | Criteria hit | Fix | Effort |
|---|---|---|---|---|
| 1 | **No pitch yet.** No script, no deck, no story arc, and the demo has 11 steps for a 3-minute slot. | Pitch 25 | (a) Write a 3:00 script with timings: hook 20s → Sofie's moment 40s → demo 80s → triple win + scale 30s → ask 10s. (b) A 6-slide deck. (c) Demo only S1 → S2 → two chosen steps → finale, using `?demo=step&n=6` and `?demo=finale` as backups. (d) Rehearse twice with a timer. | M |
| 2 | **Not bold enough next to what KBC already ships.** MyHome (Mar 2026) bundles Setle, Immoscoop, Impact us today and Immowinkel. The Immoscoop × KBC haalbaarheidsattest already links a listing to a KBC loan. Our trigger (she is already searching on Immoscoop) means she *already knows* she needs help. That misses the guiding question: "before they realise they need help". | Creativity 25, Fit 20 | Reframe around the insight the customer does **not** have: *"You're not buying a €320k house, you're buying a €320k house plus a €48k renovation."* Show the true cost **before the offer**: price + renovation − grants = real budget, and what that changes in the bid. KBC's own figure: average renovation €47,950 (Batibouw 2025 press release). This is "before they realise", and nothing in MyHome or the attest does it. In the UI, the step order becomes budget → EPC → renovation cost → offer/loan. | M |
| 3 | **README is still the empty template** (`<PRODUCT NAME>`, `<project>.vercel.app`). There is no live URL, and `web/README.md` is the create-next-app default. The rules require "explain your project, how to run it and anything unfinished"; judges open the repo first. | Tech 20, Pitch 25, rules | Rewrite `README.md`: what it is, a screenshot, the live URL, how to run, the keys, what is synthetic, what is unfinished. Deploy `web/` to Vercel now and put the URL in the README. Delete `web/README.md` or point it to the root. | S |
| 4 | **Security is at 0 / 10 today.** Aikido is not connected (its scan needs time before the 16:00 freeze). `next.config.ts` has no security headers (CSP, `frame-ancestors`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`). `npm audit` reports 0 prod vulnerabilities but **5 high in dev deps**, which Aikido will list. `pitch/idea-a.html` is public, stale, and full of invented figures (Sarah, €342k, "27 partners activated"). | Security 10 | (a) Connect the repo to Aikido **now**. (b) Add `headers()` with a strict CSP in `next.config.ts`. (c) `npm audit fix` on dev deps, then re-check. (d) Remove or update `pitch/idea-a.html`. (e) Run the `security-review` skill before submitting. | S |
| 5 | **Numbers a KBC banker will challenge in Q&A.** "€5,000 avoided overpaying" is speculative and is summed into "€13,000 unlocked". KBC "€9,000 revenue" for a home loan has no basis (margin? horizon?). Partner lead values (€40–400) are arbitrary. One-off and yearly gains share one headline. | Fit 20, Pitch 25 (Q&A) | (a) Add an assumptions table with a source for every figure (KBC Batibouw 2025 average renovation €47,950; Flemish grant amounts; €/kWh and kg CO₂/kWh for gas; a loan margin stated as an assumption) and show it in "How we estimate this". (b) Drop "avoided overpay" from totals, or label it "potential". (c) Express KBC value as products × an illustrative margin, never as a precise figure. | S–M |
| 6 | **"Scalable to millions" is claimed, not shown.** Steps are hardcoded in `engine/data.ts`. `buildJourney` ignores the customer. The 229-item catalogue in Supabase (Simon) is not wired to any step. The second intent ("Starting my business") does not exist. The UI copy hardcodes "4 houses / €320k" (`copy.ts`). | Tech 20, Fit 20, Creativity | (a) Steps reference catalogue rows (`capabilityId` → `ecosystem_items.id`), so a journey template is data. (b) Ship the second intent as **data only**, rendered by the same screens with zero UI code. (c) The presenter panel shows "same engine · 2 templates · 229 capabilities · 21 ecosystems". (d) Kate's lines are built from signal data, not hardcoded copy. | M–L |
| 7 | **The most convincing ideas in `backend.md` are not in the product.** Suppression rules ("already has equivalent product", "cash-flow pressure"), persistent context, and the outcome tracker are missing. A jury will ask: "What if she already has KBC home insurance?" Today the journey would still propose it. | Fit 20, Tech 20, Creativity | (a) The UI supports `step.status = "suppressed"` with a reason: "Hidden: you already have KBC home insurance." That is a strong *NO_ACTION per step* moment. (b) S5 becomes the start of an **outcome tracker**: dates, next action, progress. (c) Use persistent context for the home screen (balances, products held) instead of hardcoded decor. | M |
| 8 | **No business model.** "Commercially viable for KBC and attractive for partners" is a design principle of the brief. The finale shows numbers, but not who pays whom. | Fit 20 | One slide plus one presenter-panel block: the partner pays per *consented, qualified* lead (or a rev-share). KBC earns on the loan, the energy loan and insurance, plus retention. Add a **partner-side view** ("what Setle receives": only the consented fields, the timing, the intent level) to prove the triple win from the partner's chair. | S–M |
| 9 | **UX friction left in V1.** | Pitch, Fit | See §C for screen-by-screen fixes. | M |
|   | (a) 11 screens × 3 buttons is long even for a real customer. | | Offer "Add all KBC steps" per chapter. | |
|   | (b) "Continue without sharing" is ambiguous: what happens next? | | Rename it "Add it, I'll contact them myself". | |
|   | (c) We say "Shared once", but there is no screen to review or revoke consents. | | Add a "Manage what you shared" list on S5. | |
|   | (d) The plan ends without dates or a next action. | | Add dates and a next action to the plan. | |
|   | (e) The S1 notification overlaps the greeting. | | Fix the overlap. | |
|   | (f) Kate's avatar is a placeholder. | | Ask KBC staff for the official Kate mark. | |
| 10 | **Demo fragility on a device that is not ours.** Presenter clickers send `PageDown`/`PageUp`, not `→`, and keys need page focus. There is no live URL. Fonts load from `next/font` (fine offline once built). Untested on a borrowed laptop or projector resolution. | Pitch 25, Tech 20 | (a) Map `PageDown`/`PageUp`/`Space` to next/back. (b) Test on another laptop at 1920×1080 and 1280×720, full screen (F11). (c) Keep `?demo=` links on a slide as a fallback. (d) Record a 20s backup video *after* the UX is final. | S |

**Order of attack (my recommendation):**
- **S fixes, quick wins first:** #3 (README + deploy), #4 (Aikido + headers), #10 (clicker keys), #5 (assumptions).
- **Score movers:** #2 (the reframe) and #1 (pitch).
- **Depth if time allows:** #7, #6, #8, #9.

---

## B. Contract the UI needs from the DB + ML team

The UI only consumes these shapes. How confidence is computed is theirs.

1. **`DetectedIntent`** (keep the current fields, add):
   - `level: "none" | "ask" | "suggest"`. Already there; the UI honours `none` by staying silent.
   - `evidence: { signalId, label, source, observedAt, basis: "kbc_internal" | "extra_convenience" | "declared" | "partner_consented" }[]`. The "Why am I seeing this?" sheet must show the **legal basis** for each signal, not just a text reason.
   - `facts: Record<string, number | string>`, e.g. `{ savedHouses: 4, loanSimulationEur: 320000 }`, so Kate's lines are templated from data (today `copy.ts` hardcodes them).
   - `expiresAt` (moments expire, per `backend.md` §4). The UI hides an expired intent.
   - A sorted array with several intents. The UI shows the top one and could show "1 other idea".
2. **`Journey` / `JourneyStep`** (add):
   - `capabilityId` → a catalogue row (`ecosystem_items.id`), so steps are data, not code.
   - `status: "proposed" | "suppressed"` + `suppressedReason` (e.g. "already holds KBC home insurance"). The UI renders suppressed steps as a quiet line.
   - `dataShared: { key, label, purpose, retention: "once" | "until_revoked" }[]` instead of `string[]`. The consent sentence then comes from data, and "Shared once" becomes a true statement.
   - `outcome` values plus `assumptions: { text, source }[]` per step, for "How we estimate this".
   - Optional `dueBy` or `relativeTiming` ("before your offer", "within 3 months of the deed") for the tracker.
3. **`CustomerContext`** (persistent context): name, city, household, products held, and balances for the home screen (today hardcoded decor), plus the `extraConvenience: boolean` opt-in. When it is false, the UI never shows proactive Kate.
4. **Stability:** keep `scoreboard(state)` and the immutable `decide` / `setConsent`. The UI depends on them, and they are covered by tests.

---

## C. Review by area

### Idea (vs MyHome)
- **Strong:** a cross-ecosystem sequence; consent per step; "NO_ACTION is possible"; KBC's own line "Kate will never implement anything without explicit customer approval".
- **Weak:** to a KBC jury, it can read as "MyHome + a wizard". The bold, defensible part is the **insight KBC has and the customer doesn't**: the hidden renovation cost of a 1975 house, *before* the offer. Today that comes at step 6, after the loan. → #2.

### Story
- There is no antagonist and no stakes. Give Sofie a concrete risk: "she's about to bid €320k on a house that needs €48k of work, and she doesn't know".
- Close on one sentence the jury repeats: *"KBC told Sofie what the house really costs before she made the offer."*

### UX, screen by screen
| Screen | Keep | Fix |
|---|---|---|
| S1 home + notification | Calm, authentic KBC Mobile; the "before they ask" hook | Notification overlaps the greeting; home data is hardcoded (should come from `CustomerContext`) |
| S2 "Are you planning to buy a home?" | Asking first; the Why sheet with real signals | Kate's line is hardcoded; show the legal basis per signal (§B1) |
| S3 path | Clear map, 4 chapters | Add the hidden-cost insight here ("Most of the cost is after the deed") |
| S4 step | One decision; consent sentence with purpose and duration | Too many screens; rename "Continue without sharing"; no suppressed steps; outcome lines mix speculative and real gains |
| S5 plan | Privacy recap | No dates, no next action, no "manage what you shared"; the advisor link is a fake toast |
| S6 finale | Strong pitch frame | Numbers need sources (#5); add the partner chair (#8); the one-off headline is inflated by "avoided overpay" |
| Presenter (P) | Shows the engine honestly; W shows NO_ACTION | Add PageDown/PageUp; show "templates / capabilities" to prove scale |

### Engine / backend (`backend.md` vs code)
| `backend.md` | In the code today |
|---|---|
| Events → signals → context → intents | One placeholder function `detectIntents` (owned by DB + ML) |
| Goal confirmation (low / medium / high) | ✅ `level` none / ask / suggest, honoured by the UI |
| Capability registry from the XLSX | Catalogue in Supabase ✅, but **not linked** to journey steps |
| Generic orchestrator | ❌ steps hardcoded per intent |
| Decision & suppression rules | ❌ (only intent-level NO_ACTION) |
| Customer control & consent | ✅ per step, per field (UI + engine) |
| Outcome tracker | ❌ (the plan screen is a static list) |
| Second journey (business) | ❌ |

### Data credibility
- Signals are plausible and labelled (in-app Immoscoop, opt-in). ✅
- Catalogue labels are verbatim from the XLSX. ✅
- Outcome figures are illustrative and unsourced → #5.
- No real customer data anywhere. ✅

### "Scalable to millions"
- Today the proof is only rhetorical. A KBC jury needs to see: 1 engine, N templates as data, a catalogue-backed capability registry, and a stateless evaluation per customer.
- The cheapest convincing proof is the second intent rendered by the same UI (#6).

### Security
- Supabase catalogue: RLS on, read-only for anon/authenticated, writes revoked. ✅
- No secrets in git (scanned: no `sb_secret_…`, no JWTs). `.env*` is ignored, and only `.env.example` with placeholders is committed. ✅
- Missing: security headers / CSP, the Aikido connection and scan, dev-dependency vulnerabilities, and the stale public pitch file → #4.

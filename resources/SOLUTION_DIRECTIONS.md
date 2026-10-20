# Solution directions — private draft (not on main)

## Interesting angles in the dataset

- **Housing + Energy together form one natural cross-ecosystem journey** (buy → value → finance → renovate → insulate/solar/battery → insure). It is the richest partner chain in the file.
- Entrepreneurship is deep: Start it @KBC, Boostpack, Business PRO, Billit, self-employed pension, guaranteed income insurance, liability.
- Travel is nearly empty → room for "introduce new partners" (explicitly allowed), but there is less to demo from the catalogue.
- The API/Widget/Partner Hub items let us pitch credible partner-side distribution, i.e. commercial viability.

## Solution directions (ranked by judging fit)

### A. ★ "Intent → Journey" ecosystem orchestrator (recommended)
- **What it does:**
  - Detects a life/business **intent** from signals (transactions, declared events, PSD2 data, browsing on Immoscoop, …).
  - Turns that intent into a **multi-step journey** that composes KBC products + partners from the catalogue.
  - The customer approves each step and controls exactly what is shared with each partner.
- **Hero journey:** *"Buying a house built in 1975"*. Immoscoop search → valuation → housing budget → home loan → Flemish renovation obligation (EPC) → Setle cost & grants estimate → insulation/heating quotes (Impact us today) → solar + battery → energy loan → home insurance. Every step is a real catalogue item.
- **Measurable outcome shown live:**
  - Customer: € saved/year, EPC label before → after, CO₂.
  - KBC: products per journey, loan volume.
  - Partners: qualified leads.
  - Together these make the **triple-win scoreboard.**
- **Scale story:** the intent library is data, not code. Intent = signals + ordered capability graph over the 229 items. A new intent is a row, not a project.
- **Fit for each criterion:**
  - Creativity: high (a graph over the whole ecosystem, not a widget).
  - Fit: it ticks all 5 "should" points.
  - Tech: a deterministic engine + Supabase is feasible in 7 h.
  - Pitch: one emotional, concrete story.

### B. Energy-transition copilot (domain-deep variant of A)
- Signals: energy bill debits, EPC, house age, EV interest → a personal decarbonisation plan with ecoWise, solar/battery/insulation quotes, group purchase, energy loan, Encon/Sweco.
- Very measurable (kWh, €, CO₂) and on-theme ("be bold" domain).
- Narrower, so it scores less on "ecosystem". Best used **as the hero journey inside A** rather than standalone.

### C. Entrepreneur launchpad
- Signals: first incoming freelance invoices, KBO registration → Start it @KBC, Business PRO account, Billit e-invoicing, Go Solid, self-employed pension, guaranteed income insurance, liability, accountant link.
- Strong fit, rich catalogue.
- Less visual and less emotional for a 3-min pitch. A good **second intent** to prove "it generalises".

### Recommended MVP (7 h)
- **Data:**
  - Supabase tables: `ecosystem_items` (229 rows, cleaned: `ecosystem`, `name`, `partner`, `kind`, `segment`), `intents`, `intent_steps` (intent → ordered item ids + rationale + data shared), `customers` (3–4 synthetic), `signals`.
  - RLS on, read-only for anon, publishable key server-side only.
- **Engine:** a pure TS module with unit tests (Vitest). It maps signals → intent with a confidence score (stays silent below a threshold) → journey → outcome metrics.
- **UI** (Next.js + Tailwind):
  - Customer picker.
  - Intent detection with "why" (the signals).
  - Journey timeline with accept/skip per step and a per-partner consent toggle.
  - Triple-win scoreboard.
  - A second intent (entrepreneur) to show it generalises.
- **Explicitly out:** auth, real partner APIs, LLM decisioning. An optional ElevenLabs "Kate voice" narration is a nice pitch extra only if done by 14:00.
- **Deploy:** Vercel public URL by 10:00. Aikido connected by 10:30.

### Open questions for the KBC staff on site
- Can we cite the Flemish renovation obligation and real partner names in the pitch?
- What success KPIs does KBC itself use for ecosystems?

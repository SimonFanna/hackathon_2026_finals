# Finals analysis — Tectonic Hackathon 2026 (KBC track)

_Written 2026-10-20 from `resources/Tectonic Hackathon - Finals Guide-1.pdf`, `resources/KBC_Ecosystems.xlsx` and `README.md` @ 0d8c10d. Analysis only — no solution choices here._

---

## 1. Finals Guide

### Timeline (hard)
| Time | What |
|---|---|
| 08:00–09:00 | Arrival, welcome (Vooruit Concertzaal) |
| **09:00–16:00** | **Hacking — 7 h**, lunch 12:30 |
| **16:00** | **Submissions close. Final = final, no code changes after.** |
| 16:15–17:35 | Semi-final pitches, Wintercircus. KBC = Rooms 1 & 2, 10-min slots. Be there 10 min early. |
| 18:10–18:25 | KBC winner announced + finalist re-pitch (Vooruit Theaterzaal) |
| 19:00 | Overall winner (€10,000) |

### Pitch format
- **3 min pitch + 5 min Q&A**, strict timing.
- **Not on our own device** → the slides must be **PPT or PDF**. Embed the demo as screenshots/GIF/video in the deck, and have a public live URL as backup.

### Submission (Builderbase, before 16:00)
- Short description
- Pitch deck (< 3 min, ppt/pdf)
- **Public** GitHub repo link (must stay public until judging ends)
- **Screenshots of the Aikido scan** showing the repo name + remaining vulnerabilities

### Judging
| Criterion | Weight |
|---|---|
| Creativity — originality | **25%** |
| Pitch quality | **25%** |
| Technical ability — does it work? | 20% |
| Fit — did you solve the challenge? | 20% |
| Security (Aikido) | 10% |

→ **50% is idea + pitch.** A working, narrow demo with a strong story beats broad but half-done code.

### KBC challenge
**Design a scalable ecosystem that moves customers from intent to successful action.** Guiding question: *how can KBC help customers reach important life/business goals before they realise they need help?*

What the solution must do:
1. Recognise signals of an emerging need/ambition/opportunity/challenge.
2. Understand the customer context behind the intent.
3. Activate KBC capabilities, channels, expertise **and ecosystem partners**.
4. Guide decisions and actions **while the customer stays in control**.
5. Deliver a **measurable outcome** and a **triple win**: customer + KBC + partners.

Design principles:
- Bold, not a minor product tweak.
- Personalised yet scalable to millions.
- Trustworthy, transparent, privacy-conscious.
- **Commercially viable** for KBC and attractive to partners.
- A believable journey, shown through a proof of concept.

Suggested domains: **energy & sustainability, entrepreneurship & business growth, travel.**

### Constraints and rules
- Built during the time slot. "Existing projects submitted as your own" are **not eligible** → ⚠️ do **not** copy the qualifier repo (`hackaton_2026`) wholesale. Reuse ideas and patterns, but rewrite the code today.
- README must explain: the project, how to run it, **what is unfinished**.
- No secrets or confidential data in the repo.
- Partner credits: ElevenLabs, Cursor (Discord coupons), Google Cloud (link in Builderbase, valid 1 week). Aikido is on site.

---

## 2. `KBC_Ecosystems.xlsx`

**Structure:** 1 sheet, `Platte lijst` (Dutch for "flat list"), **229 rows × 2 columns**: `Ecosystem ` (header has a trailing space) and `Product or service`. No IDs, descriptions, prices, segment, eligibility or channel. **No customer data at all** — it is KBC's capability catalogue.

**Rows per ecosystem (21 ecosystems):**

| Ecosystem | Rows | Ecosystem | Rows |
|---|---|---|---|
| Business | 46 | Mobility | 31 |
| Housing | 23 | Everyday banking & payments | 16 |
| Digital platforms & assistance | 14 | Energy & sustainability | 13 |
| International business | 10 | Business protection | 10 |
| Pensions | 9 | Investing | 9 |
| Shopping & everyday services | 8 | Family & protection | 6 |
| Work & employees | 6 | Savings | 5 |
| Health & wellbeing | 4 | Wealth & estate planning | 4 |
| Administration & documents | 4 | General integrations | 4 |
| Agriculture & horticulture | 3 | **Travel** | **3** |
| Security | 1 | | |

**Partners:** encoded as an `"<item> - <Partner>"` suffix, ~27 distinct partners:
- Housing: Immoscoop, Setle, Impact us today (×4: windows, insulation, heating, airco), De Immowinkel
- Mobility: Cambio, De Lijn, NMBS, MIVB, Mobit, Blue-bike, Velo Antwerpen, Q-Park, 4411, Q8, MoveSmart/VAB
- Business: Billit, Go Solid, Soluz.io, NOWJOBS
- Other: Bolero (investing), Encon and Sweco (energy), Helena (health), IPEX (admin), Brussels Airport and Firsty (travel)

**Platform plumbing:**
- 14 integration items: Home/Car Insurance and Home Loan API + Widget, Partner Hub ×4, PSD2 AIS/PIS, application-status webhooks, Developer Portal.
- 8 Kate items (KBC's AI assistant).
- This is the "ecosystem rail" a solution can plug into.

**Data quality issues:**
- Header has a trailing space (`"Ecosystem "`); sheet name is in Dutch.
- The partner is mixed into the product name. `"- Partner Hub"` is a channel, not a partner. `"MoveSmart and VAB"` vs `"MoveSmart integration"` is the same partner spelled differently.
- Overlapping categories: Business / Business protection / International business / Work & employees. "Energy loan" sits in Energy, but "Renovation loan" sits in Housing.
- Retail and business products are mixed with no segment flag.
- Very thin on the domains KBC highlights: **Travel = 3 items**, Energy = 13.
- No relationships between items. Any mapping between items has to be built by us.

---

## 3. README vs guide — gaps

| # | Gap | Fix |
|---|---|---|
| 1 | The game plan is in relative hours (H+0…H+8+) and assumes ~10 h; we have **7 h, hard stop at 16:00** | Re-time to clock times: 09:00 / 10:00 live URL / 13:30 feature freeze / 15:00 Aikido + README / 15:45 submit |
| 2 | No **Aikido** step (10% of the score + mandatory screenshots) | Connect the repo around 10:00, fix at 14:00, final scan + screenshots at 15:30 |
| 3 | Pitch is 25% but gets only the last slot; the deck must be **PPT/PDF**, not our device | Deck owner from 13:00; demo GIF/video inside the deck; rehearse 3:00 strict + likely Q&A |
| 4 | README template is a **single-user "one card"** advisor (KBC Fit DNA). The challenge asks for an **ecosystem**: partners, triple win, commercial model | Add sections: *Ecosystem & partners*, *Triple win / business model*, *Measurable outcome* |
| 5 | "Saying nothing" rule is fine, but **customer control** (consent per partner, data shared per step) must be explicit | Make the customer-control story explicit in the demo |
| 6 | Risk of re-using the qualifier code ("existing projects… not eligible") | Fresh scaffold today; cite only concepts |
| 7 | Badges/stack say Next 16 + Supabase. OK, but no mention of the dataset we were given | Use and credit the provided dataset |
| 8 | Missing: submission checklist (Builderbase fields, public repo, "unfinished" section) | Add a checklist at the bottom |

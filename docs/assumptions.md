# Assumptions — every figure in the demo
> Owner: Kepa's UI terminal · Status: done (inventory, no data changed) · Last update: 10:55

Every number a jury member can see, with where it comes from. **Nothing in `web/src/engine/data.ts` was changed.** The figures belong to the engine / DB + ML owners; this file tells them what to keep, what to source and what to drop.

Legend:
- **Sourced:** a public source is linked.
- **Estimate:** our own order of magnitude; it must be labelled as such in the UI.
- **Speculative:** we cannot defend it in Q&A, so take it out of the totals.

---

## 1. Public figures we can quote (verified, 10:55)

Use these in the pitch and in "How we estimate this". They are stronger than our own numbers.

| Figure | Source |
|---|---|
| Average renovation cost via Setle: **€47,950** | KBC Batibouw press release 2025 ([PDF](https://www.kbc.com/content/dam/kbccom/doc/newsroom/pressreleases/2025/Persbericht%20Batibouw_EN.pdf)) |
| Setle runs simulations for **~1,500 properties a month** | same |
| Average KBC energy loan: **€12,900** (2024; €12,400 in 2023) | same |
| KBC energy loan rate cut from 3.59% to **3.25%**; renovation loan from 3.99% to **3.65%** (representative examples, 2025) | same |
| **50%** of Belgians don't know the EPC rating of their own home | same |
| **23%** of those surveyed want to buy *and renovate* a home with a weak EPC | same |
| An EPC **F** home stays online **68 days** vs **56** for EPC A (Immoscoop CEO) | same |
| **66%** of Flemish homes were built before 1981 | KBC MyHome press release, 29 Jan 2026 ([PDF](https://www.kbc.com/content/dam/kbccom/doc/newsroom/pressreleases/2026/20260129%20MyHome_EN.pdf)) |
| **~80%** of Belgian housing still needs work; ~**€350bn** total (estimate by the National Bank of Belgium) | same |
| **69%** feel insufficiently informed; **71%** don't know which grants or help exist | same |
| **6 in 10** Belgians favour one digital platform for the whole housing journey | same |
| Energy loans **+19%** in 2025 (heat pumps +30%, home batteries +160%) | same |
| Kate: 5.8M users, proactive suggestions in **140+** situations; "will never implement anything without explicit customer approval" | [KBC newsroom, Nov 2025](https://newsroom.kbc.com/kate-five-years-and-five-milestones) |

**Pitch hook built only from sourced facts:**
- 2 in 3 Flemish homes are pre-1981;
- the average renovation is ~€48k;
- 71% don't know which grants exist.

"Sofie is about to bid on one of those houses without knowing any of it."

---

## 2. Demo figures, step by step (`web/src/engine/data.ts`)

| Step | Field | Value | Status | Comment / how to defend it | Keep in totals? |
|---|---|---|---|---|---|
| search | partnerValueEur | €40 | Estimate | Cost per qualified home-seeker lead for a portal. No public number. | Keep, as an *illustrative* partner value |
| valuation | customerEurOneOff | **€5,000** | **Speculative** | "Avoided overpaying" cannot be measured. | **Remove from totals.** Show at most "potential" |
| valuation | partnerValueEur | €150 | Estimate | Estate-agent valuation lead | Keep (illustrative) |
| budget | — | — | — | No figure | — |
| home-loan | kbcRevenueEur | **€9,000** | **Speculative** | No basis is stated (margin? years?). A €320k loan × an assumed net margin over N years would have to be written out. | Replace with "1 home loan" (count), or state the formula |
| epc | partnerValueEur | €120 | Estimate | Inspection/certificate lead | Keep (illustrative) |
| grants | customerEurOneOff | €8,000 | Estimate | Depends on income bracket and the works, under the Flemish grant scheme (Mijn VerbouwPremie). Plausible order of magnitude, not verified. | Keep, labelled "up to, depends on income", or show a range |
| insulation | customerEurPerYear | €900 | Estimate | 6,000 kWh × ~€0.10–0.15/kWh gas | Keep (estimate) |
| insulation | kwhPerYear / co2KgPerYear | 6,000 / 1,200 | Estimate | 0.20 kg CO₂/kWh is the usual natural-gas factor ✅ | Keep |
| heating | customerEurPerYear | €700 | Estimate | Net saving after electricity for the heat pump | Keep (estimate) |
| heating | kwhPerYear / co2KgPerYear | 8,000 / 2,000 | Estimate | 0.25 kg/kWh is higher than the gas factor; recheck (net of the electricity used) | Keep after a recheck |
| solar | customerEurPerYear | €600 | Estimate | Depends on self-consumption and the tariff | Keep (estimate) |
| solar | kwhPerYear | 3,500 | Estimate | ~4 kWp × ~900 kWh/kWp in Belgium: plausible | Keep |
| solar | co2KgPerYear | 700 | **Weak** | 0.20 kg/kWh is high for the Belgian grid, which is low-carbon (nuclear + renewables). Use a lower grid factor, or drop CO₂ for solar. | Recheck |
| solar | kbcRevenueEur | €150 | Estimate | Referral or quote margin | Keep (illustrative) |
| energy-loan | kbcRevenueEur | €1,500 | Estimate | Could be anchored on the **sourced** average energy loan of €12,900 at 3.25%, with an assumed margin stated | Restate with the formula |
| home-insurance | kbcRevenueEur | €400 | Estimate | This looks like a yearly premium, not KBC revenue | Rename to "yearly premium" or drop from "revenue" |
| all partner steps | partnerValueEur | €40–400 | Estimate | No public lead prices | Keep, labelled "illustrative lead value" |

**What the finale should show** (recommendation, to apply in the engine/UI later):
- **Customer:** grants "up to €8,000" (once) + **€2,200/yr** saved + **17,500 kWh/yr** + CO₂ (after the factor recheck). **No "avoided overpay" in the € headline.**
- **KBC:** **number of products** (5) plus **loan volume** as a count/amount anchored on the sourced figures (home loan + €12,900 average energy loan), not a "€11,050 revenue" total.
- **Partners:** number of consented leads; the lead value stays "illustrative".

---

## 3. Signals, customer and UI decor

| Item | Value | Status | Comment |
|---|---|---|---|
| Signal weights (`buyHouseSignalWeights`) | 0.35 / 0.40 / 0.15 / 0.20 / 0.50 | **Placeholder** | Owned by the DB + ML team (`SOLUTION.md`). Not to be defended as a model. |
| Thresholds | 0.40 ask / 0.75 suggest | **Placeholder** | Same owner |
| Loan simulation | €320k | Synthetic | Plausible for Gent; no real customer |
| Customer Sofie, 32, Gent, couple + 1 child | — | Synthetic | Labelled "synthetic demo customer" on stage |
| Home screen balances (€4,218.40 / €38,900.00) and transactions | — | Synthetic decor | Hardcoded in `HomeScreen.tsx`; should come from `CustomerContext` (review §B3) |
| ⚠️ Copy mismatch | `copy.ts`: "You saved **4 houses** on Immoscoop" vs signal s1: "Saved **4 searches** for houses…" | **Bug** | Build Kate's line from signal data (`facts`), see review §B1. UI copy is frozen for now. |

---

## 4. Rules for any new figure
1. Each figure is either **sourced** (with a link), **estimate** (with the formula in one line), or **synthetic** (demo customer data).
2. Speculative figures never enter a headline total.
3. One-off and yearly euros are never added together.
4. KBC value is shown as **products and volumes**, not as a precise revenue figure, unless the margin assumption is written next to it.
5. The UI keeps the line "Illustrative figures for the demo, not KBC data."

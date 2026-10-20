// T1 fixture — Sofie (customer 1, slug "sofie") at asOf 2026-10-01.
// Hand-written from her real synthetic data (scripts/bank_data, seed 20261020) with the T1 strength formula
// (strength × saturation(count) × decay). T3 / T5 / T6 build against it before integration; after T7's
// snapshot it is superseded by fixtures/t1-personas.json (the real outputs for the 6 demo personas).
import type { PersistentContext, Signal } from "../types";

export const T1_SOFIE_AS_OF = "2026-10-01";

export const t1SofieSignals: Signal[] = [
  { code: "MORTGAGE_SIMULATION", customerId: 1, strength: 0.31, at: "2026-09-11", count: 4, value: 476000,
    evidence: ["app:104", "app:116", "app:120", "app:129"], isDisruption: false },          // €255k, €476k, €243k, €251k
  { code: "PROPERTY_VALUATION_VIEW", customerId: 1, strength: 0.19, at: "2026-09-25", count: 3,
    evidence: ["app:103", "app:130", "app:134"], isDisruption: false },
  { code: "SAVING_FOR_DOWN_PAYMENT", customerId: 1, strength: 0.14, at: "2026-09-27", count: 2, value: 315,
    evidence: ["tx:savings-2026-08", "tx:savings-2026-09"], isDisruption: false },           // €217 → €315 / month
  { code: "HOME_LOAN_KATE_QUESTION", customerId: 1, strength: 0.13, at: "2026-09-24", count: 1,
    evidence: ["app:133"], isDisruption: false },                                             // "Can I combine a home loan with a renovation loan?"
  { code: "HOME_LOAN_VIEW", customerId: 1, strength: 0.12, at: "2026-09-26", count: 3,
    evidence: ["app:98", "app:108", "app:136"], isDisruption: false },
  { code: "RENOVATION_VIEW", customerId: 1, strength: 0.1, at: "2026-09-26", count: 2,
    evidence: ["app:115", "app:135"], isDisruption: false },                                  // Setle
  { code: "HOUSING_BUDGET_VIEW", customerId: 1, strength: 0.08, at: "2026-09-09", count: 1,
    evidence: ["app:121"], isDisruption: false },
];

export const t1SofieContext: PersistentContext = {
  customerId: 1,
  firstName: "Sofie",
  age: 32,
  region: "flanders",
  language: "nl",
  household: "couple",
  children: 1,
  youngestChildAgeMonths: 40,
  employment: "employee",
  monthlyIncome: 2618.94,
  housing: "tenant",
  monthlyRent: 1351,
  savings: 30935.15,
  monthlyDebt: 0,
  debtRatio: 0,
  heldSourceRows: [31, 56, 74, 75, 142, 147, 148, 157, 159, 163, 218],   // no home insurance (8) → proposed by the plan
  properties: [],
  cashflowPressure: "low",
};

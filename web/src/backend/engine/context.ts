// T1 · ③ Persistent context: stable, combinable attributes computed from the facts (+ disruption signals).
import type { CustomerFacts, PersistentContext, Signal } from "../types";
import { monthsBetween } from "./events";

const COUPLE = new Set(["married", "cohabiting"]);
const SAVINGS_KINDS = new Set(["savings", "term_deposit"]);
const LIQUID_KINDS = new Set(["current", "business_current"]);

/**
 * - age at `asOf`; household from the marital status (married / cohabiting → couple);
 * - monthlyIncome = declared net income, replaced by the observed income when an INCOME_DROP signal exists;
 * - savings = savings + term-deposit balances; monthlyDebt = active loan payments; debtRatio = debt ÷ income;
 * - heldSourceRows = active holdings + active loans + accounts (catalogue rows, for duplicate suppression);
 * - cashflowPressure: high if debtRatio > 0.45, an INCOME_DROP, or no buffer (current < ½ income and
 *   savings < 1 month of income); medium if debtRatio > 0.33 or a large unexpected expense; otherwise low.
 */
export function buildContext(facts: CustomerFacts, signals: Signal[]): PersistentContext {
  const { customer, employment, housing, asOf } = facts;
  const has = (code: Signal["code"]) => signals.find((s) => s.code === code);

  const incomeDrop = has("INCOME_DROP");
  const monthlyIncome = incomeDrop?.value !== undefined ? incomeDrop.value : employment.monthlyNetIncome;

  const savings = round2(facts.accounts.filter((a) => SAVINGS_KINDS.has(a.kind)).reduce((s, a) => s + a.balance, 0));
  const liquid = facts.accounts.filter((a) => LIQUID_KINDS.has(a.kind)).reduce((s, a) => s + a.balance, 0);
  const activeLoans = facts.loans.filter((l) => l.status === "active");
  const monthlyDebt = round2(activeLoans.reduce((s, l) => s + l.monthlyPayment, 0));
  const debtRatio = monthlyIncome > 0 ? Math.round((monthlyDebt / monthlyIncome) * 10_000) / 10_000 : monthlyDebt > 0 ? 1 : 0;

  const held = new Set<number>();
  for (const h of facts.holdings) if (h.status === "active") held.add(h.sourceRow);
  for (const l of activeLoans) if (l.sourceRow !== null) held.add(l.sourceRow);
  for (const a of facts.accounts) if (a.sourceRow !== null) held.add(a.sourceRow);

  const childAges = facts.children.map((c) => monthsBetween(c.birthDate, asOf));
  const noBuffer = liquid < 0.5 * monthlyIncome && savings < monthlyIncome;
  const cashflowPressure: PersistentContext["cashflowPressure"] =
    debtRatio > 0.45 || incomeDrop || noBuffer ? "high"
      : debtRatio > 0.33 || has("LARGE_UNEXPECTED_EXPENSE") ? "medium" : "low";

  return {
    customerId: customer.id,
    firstName: customer.firstName,
    age: ageYears(customer.birthDate, asOf),
    region: customer.region,
    language: customer.language,
    household: COUPLE.has(customer.maritalStatus) ? "couple" : "single",
    children: facts.children.length,
    youngestChildAgeMonths: childAges.length ? Math.min(...childAges) : null,
    employment: employment.status,
    monthlyIncome,
    housing: housing.status,
    monthlyRent: housing.monthlyRent ?? 0,
    savings,
    monthlyDebt,
    debtRatio,
    heldSourceRows: [...held].sort((a, b) => a - b),
    properties: facts.properties.map((p) => ({ kind: p.kind, buildYear: p.buildYear, epc: p.epcLabel, value: p.estimatedValue })),
    cashflowPressure,
  };
}

function ageYears(birthDate: string, asOf: string): number {
  return Math.floor(monthsBetween(birthDate, asOf) / 12);
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

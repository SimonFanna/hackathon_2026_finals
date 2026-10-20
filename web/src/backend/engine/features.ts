// T2 · Features: the ONE definition shared by training (scripts/ml) and serving (predict).
// Pure: same signals + context → same keys, same values, always in the same order, never NaN.
import type { PersistentContext, Signal } from "../types";
import { SIGNAL_CODES, type SignalCode } from "../vocabulary";

const AGE_BANDS: [string, number, number][] = [
  ["age_18_24", 0, 24], ["age_25_34", 25, 34], ["age_35_44", 35, 44], ["age_45_54", 45, 54], ["age_55_64", 55, 64], ["age_65_plus", 65, 200],
];
const EMPLOYMENT = ["employee", "self_employed", "business_owner", "student", "retired", "job_seeker"];
/** Catalogue rows whose ownership changes what a moment means (e.g. already insures an electric car). */
const HELD: [string, number][] = [
  ["holds_home_loan", 2], ["holds_business_account", 79], ["holds_ev_insurance", 32], ["holds_pension_savings", 56], ["holds_save_for_child", 75],
];

/** Human labels for the context features (signal features are relabelled by T3 from the signal itself). */
export const CONTEXT_FEATURE_LABELS: Record<string, string> = {
  age_18_24: "aged 18–24", age_25_34: "aged 25–34", age_35_44: "aged 35–44", age_45_54: "aged 45–54",
  age_55_64: "aged 55–64", age_65_plus: "aged 65 or more",
  is_tenant: "rents their home", is_owner: "owns their home", with_parents: "lives with their parents",
  household_couple: "lives as a couple", children: "number of children", has_baby: "has a child under 1",
  has_young_child: "has a child under 4",
  emp_employee: "is an employee", emp_self_employed: "is self-employed", emp_business_owner: "runs a company",
  emp_student: "is a student", emp_retired: "is retired", emp_job_seeker: "is looking for a job",
  savings_k_log: "savings level", debt_ratio: "share of income going to loans", has_old_property: "owns a home built before 1990",
  holds_home_loan: "already has a home loan", holds_business_account: "already has a business account",
  holds_ev_insurance: "already insures an electric car", holds_pension_savings: "already saves for retirement",
  holds_save_for_child: "already saves for a child",
};

export const sigFeature = (code: SignalCode) => `sig_${code}`;
export const cntFeature = (code: SignalCode) => `cnt_${code}`;

/**
 * - `sig_<CODE>` = signal strength (0 when absent), for every SignalCode;
 * - `cnt_<CODE>` = log1p(count), for every SignalCode;
 * - context: age band (one-hot), housing, household, children, employment (one-hot),
 *   savings (log of k€), debt ratio (capped at 1), old property, a few products already held.
 */
export function features(signals: Signal[], ctx: PersistentContext): Record<string, number> {
  const byCode = new Map(signals.map((s) => [s.code, s]));
  const x: Record<string, number> = {};
  for (const code of SIGNAL_CODES) x[sigFeature(code)] = finite(byCode.get(code)?.strength);
  for (const code of SIGNAL_CODES) x[cntFeature(code)] = Math.log1p(finite(byCode.get(code)?.count));

  for (const [name, lo, hi] of AGE_BANDS) x[name] = ctx.age >= lo && ctx.age <= hi ? 1 : 0;
  x.is_tenant = ctx.housing === "tenant" ? 1 : 0;
  x.is_owner = ctx.housing === "owner" ? 1 : 0;
  x.with_parents = ctx.housing === "with_parents" ? 1 : 0;
  x.household_couple = ctx.household === "couple" ? 1 : 0;
  x.children = Math.min(4, ctx.children);
  x.has_baby = ctx.youngestChildAgeMonths !== null && ctx.youngestChildAgeMonths < 12 ? 1 : 0;
  x.has_young_child = ctx.youngestChildAgeMonths !== null && ctx.youngestChildAgeMonths < 48 ? 1 : 0;
  for (const e of EMPLOYMENT) x[`emp_${e}`] = ctx.employment === e ? 1 : 0;
  x.savings_k_log = Math.log1p(Math.max(0, finite(ctx.savings)) / 1000);
  x.debt_ratio = Math.min(1, Math.max(0, finite(ctx.debtRatio)));
  x.has_old_property = ctx.properties.some((p) => p.buildYear < 1990) ? 1 : 0;
  const held = new Set(ctx.heldSourceRows);
  for (const [name, row] of HELD) x[name] = held.has(row) ? 1 : 0;
  return x;
}

/** Feature names in their canonical order (the CSV header of the training export). */
export const FEATURE_NAMES: string[] = Object.keys(
  features([], { customerId: 0, firstName: "", age: 30, region: "", language: "nl", household: "single", children: 0,
                 youngestChildAgeMonths: null, employment: "employee", monthlyIncome: 0, housing: "tenant", monthlyRent: 0,
                 savings: 0, monthlyDebt: 0, debtRatio: 0, heldSourceRows: [], properties: [], cashflowPressure: "low" }),
);

function finite(v: number | undefined): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

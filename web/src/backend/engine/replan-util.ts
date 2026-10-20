// T6 helpers shared by disruption.ts, replan.ts, scenarios.ts and arbitration.ts. Pure.
import type { CapabilityCode, Disruption, Goal, Plan, PlanStep } from "../types";

/** Fields T6 adds to `Disruption.delta` (optional, see backend/T6-disruption-replan.md). */
export type DisruptionDelta = Disruption["delta"] & { rateDeltaPct?: number; sourceRow?: number };

const DAY_MS = 86_400_000;

export function addDays(iso: string, days: number): string {
  return new Date(Date.parse(iso) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `a` to `b` (positive when b is later). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / DAY_MS);
}

export function clamp(x: number, lo = 0, hi = 1): number {
  return Math.min(hi, Math.max(lo, x));
}

export function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

/** Deep copy for plain JSON data (goals, plans, contexts). */
export function clone<T>(x: T): T {
  return structuredClone(x);
}

/** Steps that still count: not skipped, hidden or already covered. */
export function isActive(s: PlanStep): boolean {
  return s.status !== "skipped" && s.display !== "HIDDEN" && s.display !== "ALREADY_COVERED";
}

export function isFinished(s: PlanStep): boolean {
  return s.status === "done";
}

/** Σ new monthly payments of the plan (home loan + renovation loan…). */
export function monthlyPayment(plan: Plan): number {
  return Math.round(plan.steps.filter(isActive).reduce((sum, s) => sum + (s.estimates.monthlyPayment ?? 0), 0));
}

/** Latest ETA of the active steps, or null. */
export function lastEta(plan: Plan): string | null {
  const etas = plan.steps.filter(isActive).map((s) => s.eta).filter((e): e is string => !!e);
  return etas.length ? etas.reduce((a, b) => (a > b ? a : b)) : null;
}

/** The step and every step that (transitively) depends on it. */
export function withDependents(plan: Plan, stepId: string): Set<string> {
  const out = new Set([stepId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const s of plan.steps) {
      if (!out.has(s.id) && s.dependsOn.some((d) => out.has(d))) {
        out.add(s.id);
        grew = true;
      }
    }
  }
  return out;
}

/** The unfinished step a disruption points to (by capability, then provider), or the first unfinished partner step. */
export function disruptedStep(plan: Plan, delta: DisruptionDelta): PlanStep | undefined {
  const open = plan.steps.filter((s) => isActive(s) && !isFinished(s));
  return (
    (delta.capability && open.find((s) => s.capability === delta.capability)) ||
    (delta.sourceRow !== undefined && open.find((s) => s.provider.sourceRow === delta.sourceRow)) ||
    open.find((s) => s.provider.isPartner)
  );
}

export function eur(n: number): string {
  return `€${Math.round(n).toLocaleString("en-GB")}`;
}

export const ENERGY_CAPABILITIES: CapabilityCode[] = [
  "estimate_renovation", "identify_grants", "quote_insulation", "quote_heating", "quote_windows", "evaluate_solar", "finance_renovation",
];

/** Constraint keys whose value changed between two goals (new values). */
export function patchOf(before: Goal, after: Goal): Partial<Goal["constraints"]> {
  const out: Record<string, unknown> = {};
  const a = before.constraints as Record<string, unknown>;
  const b = after.constraints as Record<string, unknown>;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) out[k] = b[k];
  }
  return out as Partial<Goal["constraints"]>;
}

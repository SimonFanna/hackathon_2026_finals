import type { Consent, Plan, StepStatus } from "../types";

export type StepAction = "accept" | "skip" | "start" | "done" | "block";

const NEXT: Record<StepAction, StepStatus> = { accept: "accepted", skip: "skipped", start: "in_progress", done: "done", block: "blocked" };

/** ⑨ The customer (or a partner callback) moves a step. `done` is final; unknown steps throw. */
export function applyStepAction(plan: Plan, stepId: string, action: StepAction): Plan {
  const target = plan.steps.find((s) => s.id === stepId);
  if (!target) throw new Error(`Unknown step: ${stepId}`);
  if (!(action in NEXT)) throw new Error(`Unknown action: ${action}`);
  if (target.status === "done") return plan;
  return { ...plan, steps: plan.steps.map((s) => (s.id === stepId ? { ...s, status: NEXT[action] } : s)) };
}

const key = (c: Pick<Consent, "goalId" | "stepId" | "partner" | "field">) => `${c.goalId}|${c.stepId}|${c.partner}|${c.field}`;

/**
 * Consent ledger: append-only, so every grant and revocation stays auditable.
 * The latest entry per (goal, step, partner, field) is the one that counts. No entry = not granted.
 */
export function setConsent(consents: Consent[], c: Omit<Consent, "at">, asOf: string): Consent[] {
  return [...consents, { ...c, at: asOf }];
}

/** Current state of the ledger: the latest entry per key. */
export function currentConsents(consents: Consent[]): Consent[] {
  const latest = new Map<string, Consent>();
  for (const c of consents) latest.set(key(c), c); // later entries win (ledger order)
  return [...latest.values()];
}

export function isGranted(consents: Consent[], goalId: string, stepId: string, partner: string, field: string): boolean {
  return currentConsents(consents).some((c) => key(c) === key({ goalId, stepId, partner, field }) && c.granted);
}

const ENGAGED: StepStatus[] = ["accepted", "in_progress", "done"];

/** What each partner actually receives: requested ∩ granted fields, on steps the customer accepted. */
export function sharedData(plan: Plan, consents: Consent[]): { partner: string; fields: string[] }[] {
  const byPartner = new Map<string, Set<string>>();
  for (const s of plan.steps) {
    if (!s.provider.isPartner || !ENGAGED.includes(s.status) || s.display === "HIDDEN") continue;
    for (const field of s.dataRequested) {
      if (!isGranted(consents, plan.goalId, s.id, s.provider.provider, field)) continue;
      if (!byPartner.has(s.provider.provider)) byPartner.set(s.provider.provider, new Set());
      byPartner.get(s.provider.provider)!.add(field);
    }
  }
  return [...byPartner.entries()].map(([partner, fields]) => ({ partner, fields: [...fields].sort() })).sort((a, b) => a.partner.localeCompare(b.partner));
}

/** A partner step is a lead only if accepted and at least one field is granted. */
export function isLead(plan: Plan, stepId: string, consents: Consent[]): boolean {
  const s = plan.steps.find((x) => x.id === stepId);
  if (!s || !s.provider.isPartner || !ENGAGED.includes(s.status) || s.display === "HIDDEN") return false;
  return s.dataRequested.some((f) => isGranted(consents, plan.goalId, s.id, s.provider.provider, f));
}

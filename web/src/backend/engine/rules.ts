import type { DecisionRule, Feedback, PersistentContext, Plan, PlanStep, RuleSet, StepDisplay } from "../types";
import { evalCondition } from "./condition";

const DAY_MS = 86_400_000;
const daysBetween = (from: string, to: string) => Math.floor((Date.parse(to.slice(0, 10)) - Date.parse(from.slice(0, 10))) / DAY_MS);

/** Days since the latest feedback of this kind on this capability, or null. */
function lastFeedbackDaysAgo(feedback: Feedback[], target: string, kind: Feedback["kind"], asOf: string): number | null {
  const at = feedback.filter((f) => f.target === target && f.kind === kind && f.at.slice(0, 10) <= asOf.slice(0, 10)).map((f) => f.at).sort().pop();
  return at ? daysBetween(at, asOf) : null;
}

/** The step as decision rules see it: the PlanStep plus a few derived facts. */
function stepScope(step: PlanStep, ctx: PersistentContext) {
  const p = step.provider;
  return {
    ...step,
    held: ctx.heldSourceRows.includes(p.sourceRow),
    commercial: (p.estimates.kbcRevenueEur ?? 0) > 0 || (p.estimates.partnerValueEur ?? 0) > 0 || (p.costEur ?? 0) > 0,
    optional: step.optional ?? false,
  };
}

/**
 * ⑧ Decision & suppression rules. Sets every step's `display` (+ `displayReason`):
 * the highest-priority matching rule with a display effect wins; `LOWER_PRIORITY` moves the step later.
 * Idempotent: it always starts again from `SHOW_STEP`.
 */
export function applyDecisionRules(plan: Plan, ctx: PersistentContext, feedback: Feedback[], rules: RuleSet): Plan {
  const ordered: DecisionRule[] = [...rules.decisionRules].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
  const asOf = plan.createdAt;
  const lowered = new Set<string>();

  const steps = plan.steps.map((original) => {
    // a held alternative covers the need: show that one instead of selling a new product
    let step = original;
    if (!ctx.heldSourceRows.includes(step.provider.sourceRow)) {
      const held = step.alternatives.find((a) => ctx.heldSourceRows.includes(a.sourceRow));
      if (held) step = { ...step, provider: held, alternatives: [step.provider, ...step.alternatives.filter((a) => a !== held)] };
    }
    const scope = {
      ctx,
      step: stepScope(step, ctx),
      fb: {
        notRelevantDaysAgo: lastFeedbackDaysAgo(feedback, step.capability, "not_relevant", asOf),
        notNowDaysAgo: lastFeedbackDaysAgo(feedback, step.capability, "not_now", asOf),
        noDaysAgo: lastFeedbackDaysAgo(feedback, step.capability, "no", asOf),
      },
    };
    let display: StepDisplay = "SHOW_STEP";
    let displayReason: string | undefined;
    for (const r of ordered) {
      if (!evalCondition(r.condition, scope)) continue;
      if (r.effect === "LOWER_PRIORITY") {
        lowered.add(step.id);
        continue;
      }
      display = r.effect;
      displayReason = r.reason;
      break;
    }
    return { ...step, display, displayReason };
  });

  // LOWER_PRIORITY: move to the end only steps nothing depends on, so the order stays valid
  const dependedOn = new Set(steps.flatMap((s) => s.dependsOn));
  const later = steps.filter((s) => lowered.has(s.id) && !dependedOn.has(s.id));
  const reordered = [...steps.filter((s) => !later.includes(s)), ...later].map((s, i) => ({ ...s, order: i + 1 }));
  return { ...plan, steps: reordered };
}

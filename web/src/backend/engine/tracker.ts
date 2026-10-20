import type { Consent, Goal, Outcome, Plan, StepStatus } from "../types";
import { isLead } from "./consent";

const ENGAGED: StepStatus[] = ["accepted", "in_progress", "done"];

/** ⑩ Progress and triple-win outcome from the plan state. Every figure is an estimate. */
export function trackOutcome(goal: Goal, plan: Plan, consents: Consent[]): Outcome {
  const visible = plan.steps.filter((s) => s.display !== "ALREADY_COVERED" && s.display !== "HIDDEN" && s.status !== "skipped");
  const engaged = visible.filter((s) => ENGAGED.includes(s.status));
  const sum = (k: keyof (typeof plan.steps)[number]["estimates"], steps = engaged) => steps.reduce((t, s) => t + (s.estimates[k] ?? 0), 0);

  const kbcSteps = engaged.filter((s) => !s.provider.isPartner && s.display !== "SHOW_GUIDANCE");
  const leads = engaged.filter((s) => isLead(plan, s.id, consents));
  const partnersCoordinated = new Set(visible.filter((s) => s.provider.isPartner).map((s) => s.provider.provider));
  const allCoordinated = new Set(visible.map((s) => s.provider.provider));

  return {
    goalId: goal.id,
    progressPct: visible.length ? Math.round((engaged.length / visible.length) * 100) : 0,
    stepsDone: engaged.length,
    stepsTotal: visible.length,
    customer: {
      eurOneOff: Math.round(sum("customerEurOneOff")),
      eurPerYear: Math.round(sum("customerEurPerYear")),
      kwhPerYear: Math.round(sum("kwhPerYear")),
      co2KgPerYear: Math.round(sum("co2KgPerYear")),
      handoffsAvoided: Math.max(0, allCoordinated.size - 1),
    },
    kbc: { productsActivated: kbcSteps.length, revenueEur: Math.round(sum("kbcRevenueEur", kbcSteps)) },
    partners: {
      leads: leads.length,
      valueEur: Math.round(sum("partnerValueEur", leads)),
      providersCoordinated: partnersCoordinated.size,
    },
    estimated: true,
  };
}

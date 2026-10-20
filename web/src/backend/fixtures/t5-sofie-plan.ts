/**
 * T5 output for T6 / T8: Sofie's confirmed goal, her plan after the decision rules, and the outcome.
 * Computed from the T5 engine on the T5 inputs, so it always matches the current planner.
 */
import { buildPlan, createGoal } from "../engine/orchestrator";
import { applyDecisionRules } from "../engine/rules";
import { trackOutcome } from "../engine/tracker";
import type { Consent, Feedback, Goal, Outcome, PersistentContext, Plan } from "../types";
import { ASOF, lucasCtx, sofieCtx, t5Rules } from "./t5-inputs";

export { ASOF, lucasCtx, sofieCtx, t5Rules };

/** Constraints Kate confirms with Sofie (backend.md ⑥). */
export const sofieGoal: Goal = createGoal(
  {
    customerId: sofieCtx.customerId,
    type: "BUY_AND_PREPARE_HOME",
    constraints: { budget: 250_000, ownFunds: 30_000, maxMonthlyPayment: 1100, deadline: "2027-04-01" },
    priorities: ["affordability", "energy_efficiency"],
  },
  sofieCtx,
  t5Rules,
  ASOF,
);

const noFeedback: Feedback[] = [];
export const sofiePlan: Plan = applyDecisionRules(buildPlan(sofieGoal, sofieCtx, t5Rules, ASOF), sofieCtx, noFeedback, t5Rules);
export const sofieConsents: Consent[] = [];
export const sofieOutcome: Outcome = trackOutcome(sofieGoal, sofiePlan, sofieConsents);

/** Sofie after an income drop (e.g. reduced hours): for T6 impact / replan tests. */
export const sofieCtxIncomeDrop: PersistentContext = { ...sofieCtx, monthlyIncome: 1800, cashflowPressure: "high" };

export const lucasGoal: Goal = createGoal({ customerId: lucasCtx.customerId, type: "START_BUSINESS", constraints: {}, priorities: ["speed"] }, lucasCtx, t5Rules, ASOF);
export const lucasPlan: Plan = applyDecisionRules(buildPlan(lucasGoal, lucasCtx, t5Rules, ASOF), lucasCtx, noFeedback, t5Rules);

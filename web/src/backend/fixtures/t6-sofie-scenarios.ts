/**
 * T6 output for T8 (Kate) / T7 (API): Sofie's income drop → impact → scenarios A/B → choice,
 * plus the "What if the house costs €280k?" simulation. Computed by the real engine, never hand-written.
 */
import { assessImpact, detectDisruptions } from "../engine/disruption";
import { chooseScenario, replan } from "../engine/replan";
import { simulate } from "../engine/scenarios";
import type { Disruption, Goal, Impact, Plan, Scenario } from "../types";
import { AT, ASOF, incomeDropSignals, sofieCtx, sofieCtxIncomeDrop, sofieGoal, sofiePlan, t6Rules } from "./t6-inputs";

export { sofieGoal, sofiePlan, t6Rules };

export const incomeDrop: Disruption = detectDisruptions(incomeDropSignals, sofieCtx, sofieCtxIncomeDrop, t6Rules, AT)[0];
export const incomeDropImpact: Impact = assessImpact(incomeDrop, sofieGoal, sofiePlan, sofieCtxIncomeDrop);

/** Ranked: [A, B, …others]. Kate shows the first two. */
export const incomeDropScenarios: Scenario[] = replan(sofieGoal, sofiePlan, sofieCtxIncomeDrop, incomeDropImpact, t6Rules, AT, incomeDrop);
export const [scenarioA, scenarioB] = incomeDropScenarios;

/** Sofie picks A: new plan version, goal `replanned`. */
export const afterChoiceA: { goal: Goal; plan: Plan } = chooseScenario(sofieGoal, scenarioA);

/** "What if the house costs €280k?" → [as asked, fix 1, fix 2]. Nothing committed. */
export const whatIf280k: Scenario[] = simulate(sofieGoal, sofiePlan, sofieCtx, { budget: 280_000 }, t6Rules, ASOF);

/** Kate template for the disruption (fill {firstName}, {goal}, {delta}). */
export const incomeDropKateTemplate = t6Rules.disruptionTypes.find((t) => t.code === "INCOME_DROP")!.kateTemplate;

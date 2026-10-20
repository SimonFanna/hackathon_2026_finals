import { describe, expect, it } from "vitest";
import { applyDecisionRules } from "./rules";
import { buildPlan, createGoal } from "./orchestrator";
import { ASOF, sofieCtx, t5Rules } from "../fixtures/t5-inputs";
import type { Feedback, Plan } from "../types";

const goal = createGoal({ customerId: 1, type: "BUY_AND_PREPARE_HOME", constraints: { budget: 250_000, ownFunds: 30_000, maxMonthlyPayment: 1100 }, priorities: ["affordability", "energy_efficiency"] }, sofieCtx, t5Rules, ASOF);
const plan = buildPlan(goal, sofieCtx, t5Rules, ASOF);
const step = (p: Plan, code: string) => p.steps.find((s) => s.capability === code)!;

describe("applyDecisionRules", () => {
  const ruled = applyDecisionRules(plan, sofieCtx, [], t5Rules);

  it("marks products she already holds as ALREADY_COVERED (home insurance, row 8)", () => {
    expect(step(ruled, "insure_property").display).toBe("ALREADY_COVERED");
    expect(step(ruled, "insure_property").displayReason).toMatch(/already have/);
  });
  it("shows partner steps as SHOW_PARTNER and advice as SHOW_GUIDANCE", () => {
    expect(step(ruled, "estimate_renovation").display).toBe("SHOW_PARTNER");
    expect(step(ruled, "inspect_property").display).toBe("SHOW_PARTNER");
    expect(step(ruled, "estimate_budget").display).toBe("SHOW_GUIDANCE");
    expect(step(ruled, "finance_property").display).toBe("SHOW_STEP");
  });
  it("covers the need with a held alternative", () => {
    const r = applyDecisionRules(plan, { ...sofieCtx, heldSourceRows: [9] }, [], t5Rules);
    expect(step(r, "insure_property").provider.sourceRow).toBe(9);
    expect(step(r, "insure_property").display).toBe("ALREADY_COVERED");
  });
  it("puts commercial non-essential steps on WAIT under high cashflow pressure", () => {
    const r = applyDecisionRules(plan, { ...sofieCtx, cashflowPressure: "high" }, [], t5Rules);
    expect(step(r, "evaluate_solar").display).toBe("WAIT");
    expect(step(r, "quote_windows").display).toBe("WAIT");
    expect(step(r, "finance_property").display).toBe("SHOW_STEP");
    expect(step(r, "quote_insulation").display).toBe("SHOW_PARTNER");
  });
  it("hides a capability flagged not relevant in the last 90 days, but not older feedback", () => {
    const fb = (at: string): Feedback[] => [{ customerId: 1, target: "evaluate_solar", kind: "not_relevant", at }];
    expect(step(applyDecisionRules(plan, sofieCtx, fb("2026-08-01"), t5Rules), "evaluate_solar").display).toBe("HIDDEN");
    expect(step(applyDecisionRules(plan, sofieCtx, fb("2026-01-01"), t5Rules), "evaluate_solar").display).toBe("SHOW_STEP");
  });
  it("moves a 'not now' step with no dependents to the end", () => {
    const r = applyDecisionRules(plan, sofieCtx, [{ customerId: 1, target: "evaluate_solar", kind: "not_now", at: "2026-09-25" }], t5Rules);
    expect(r.steps.at(-1)!.capability).toBe("evaluate_solar");
    expect(r.steps.map((s) => s.order)).toEqual(r.steps.map((_, i) => i + 1));
  });
  it("is idempotent", () => {
    expect(applyDecisionRules(ruled, sofieCtx, [], t5Rules)).toEqual(ruled);
  });
});

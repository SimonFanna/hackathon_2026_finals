import { describe, expect, it } from "vitest";
import { applyStepAction, currentConsents, isLead, setConsent, sharedData } from "./consent";
import { trackOutcome } from "./tracker";
import { applyDecisionRules } from "./rules";
import { buildPlan, createGoal } from "./orchestrator";
import { ASOF, sofieCtx, t5Rules } from "../fixtures/t5-inputs";
import type { Consent, Plan } from "../types";

const goal = createGoal({ customerId: 1, type: "BUY_AND_PREPARE_HOME", constraints: { budget: 250_000, ownFunds: 30_000, maxMonthlyPayment: 1100 }, priorities: ["affordability", "energy_efficiency"] }, sofieCtx, t5Rules, ASOF);
const plan = applyDecisionRules(buildPlan(goal, sofieCtx, t5Rules, ASOF), sofieCtx, [], t5Rules);
const id = (code: string) => plan.steps.find((s) => s.capability === code)!.id;
const acceptAll = (p: Plan) => p.steps.reduce((acc, s) => applyStepAction(acc, s.id, "accept"), p);

describe("applyStepAction", () => {
  it("moves a step without touching the others, and never mutates", () => {
    const p = applyStepAction(plan, id("estimate_renovation"), "accept");
    expect(p.steps.find((s) => s.id === id("estimate_renovation"))!.status).toBe("accepted");
    expect(plan.steps.every((s) => s.status === "todo")).toBe(true);
    expect(applyStepAction(applyStepAction(p, id("estimate_renovation"), "done"), id("estimate_renovation"), "skip").steps.find((s) => s.id === id("estimate_renovation"))!.status).toBe("done");
  });
  it("throws on an unknown step", () => {
    expect(() => applyStepAction(plan, "nope", "accept")).toThrow();
  });
});

describe("consent", () => {
  const setle = { goalId: goal.id, stepId: id("estimate_renovation"), partner: "Setle" };
  it("defaults to not granted, is revocable and keeps the history", () => {
    let c: Consent[] = [];
    const accepted = applyStepAction(plan, setle.stepId, "accept");
    expect(sharedData(accepted, c)).toEqual([]);
    c = setConsent(c, { ...setle, field: "postal_code", granted: true }, "2026-10-01");
    c = setConsent(c, { ...setle, field: "epc", granted: true }, "2026-10-01");
    expect(sharedData(accepted, c)).toEqual([{ partner: "Setle", fields: ["epc", "postal_code"] }]);
    c = setConsent(c, { ...setle, field: "epc", granted: false }, "2026-10-02");
    expect(sharedData(accepted, c)).toEqual([{ partner: "Setle", fields: ["postal_code"] }]);
    expect(c).toHaveLength(3);
    expect(currentConsents(c)).toHaveLength(2);
  });
  it("shares nothing before the step is accepted, and ignores fields the step did not request", () => {
    const c = setConsent([], { ...setle, field: "postal_code", granted: true }, ASOF);
    expect(sharedData(plan, c)).toEqual([]);
    const odd = setConsent([], { ...setle, field: "salary", granted: true }, ASOF);
    expect(sharedData(applyStepAction(plan, setle.stepId, "accept"), odd)).toEqual([]);
    expect(isLead(applyStepAction(plan, setle.stepId, "accept"), setle.stepId, c)).toBe(true);
  });
});

describe("trackOutcome", () => {
  it("starts at 0% and excludes covered steps from the total", () => {
    const o = trackOutcome(goal, plan, []);
    expect(o.progressPct).toBe(0);
    expect(o.stepsTotal).toBe(plan.steps.filter((s) => s.display !== "ALREADY_COVERED").length);
    expect(o.estimated).toBe(true);
  });
  it("no consent → no partner lead, even with every step accepted", () => {
    const o = trackOutcome(goal, acceptAll(plan), []);
    expect(o.progressPct).toBe(100);
    expect(o.partners.leads).toBe(0);
    expect(o.partners.valueEur).toBe(0);
    expect(o.partners.providersCoordinated).toBeGreaterThanOrEqual(3);
    expect(o.customer.handoffsAvoided).toBeGreaterThanOrEqual(3);
    expect(o.customer.kwhPerYear).toBeGreaterThan(10_000);
    expect(o.customer.eurOneOff).toBe(8000);
    expect(o.kbc.productsActivated).toBeGreaterThanOrEqual(4);
  });
  it("a consented, accepted partner step is a lead with its value", () => {
    const c = setConsent([], { goalId: goal.id, stepId: id("estimate_renovation"), partner: "Setle", field: "postal_code", granted: true }, ASOF);
    const o = trackOutcome(goal, applyStepAction(plan, id("estimate_renovation"), "accept"), c);
    expect(o.partners.leads).toBe(1);
    expect(o.partners.valueEur).toBe(100);
    expect(o.progressPct).toBeGreaterThan(0);
  });
  it("skipped steps leave the total", () => {
    const o = trackOutcome(goal, applyStepAction(plan, id("evaluate_solar"), "skip"), []);
    expect(o.stepsTotal).toBe(trackOutcome(goal, plan, []).stepsTotal - 1);
  });
});

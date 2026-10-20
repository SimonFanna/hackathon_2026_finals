// Kate on the real T5 planner output (fixtures/t5-sofie-plan.ts) with the real T5 sharedData / affordability.
import { describe, expect, it } from "vitest";
import { ASOF, sofieCtx, sofieGoal, sofiePlan, t5Rules } from "../../fixtures/t5-sofie-plan";
import { applyStepAction, setConsent, sharedData } from "../consent";
import { affordability } from "../finance";
import { draftAnswer, type QaInput } from "./answers";
import { routeQuestion } from "./router";

const setle = sofiePlan.steps.find((s) => s.provider.provider === "Setle")!;
const plan = applyStepAction(sofiePlan, setle.id, "accept");
const consents = setConsent([], { goalId: plan.goalId, stepId: setle.id, partner: "Setle", field: "property_type", granted: true }, ASOF);
const input: QaInput = { ctx: sofieCtx, goal: sofieGoal, plan, consents, rules: t5Rules, asOf: ASOF };
const ask = (q: string) => draftAnswer(routeQuestion(q, plan), q, input, { sharedData, affordability }).text;

describe("Kate × T5 plan", () => {
  it("Why Setle before the loan?", () => {
    const t = ask("Why Setle before the loan?");
    // T5 (b795fc9): finance_property depends on identify_grants, so the home loan waits for Setle.
    expect(t).toContain("Setle comes first because your home loan needs its result");
    expect(t).toContain("sized once the works and grants are known");
  });
  it("What do you share with Setle? (T5 sharedData: accepted step ∩ granted fields)", () => {
    expect(ask("What do you share with Setle?")).toContain("Setle receives only: property type, because you approved it");
  });
  it("Can I do the solar panels later?", () => {
    expect(ask("Can I do the solar panels later?")).toContain("Nothing else in your plan waits for");
  });
  it("quotes the plan's own monthly payment", () => {
    expect(ask("How am I doing?")).toContain(`about €${plan.summary!.monthlyPayment.toLocaleString("en-US")}`);
  });
});

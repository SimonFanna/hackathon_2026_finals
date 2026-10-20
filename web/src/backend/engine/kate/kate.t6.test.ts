// Kate on the real T6 output: what-ifs through simulate(), and the scenario choice after Sofie's income drop.
import { describe, expect, it } from "vitest";
import { ASOF, sofieCtx } from "../../fixtures/t5-sofie-plan";
import { sofieCtxIncomeDrop, t6Rules } from "../../fixtures/t6-inputs";
import { incomeDropImpact, incomeDropScenarios, sofieGoal, sofiePlan, whatIf280k } from "../../fixtures/t6-sofie-scenarios";
import { sharedData } from "../consent";
import { simulate } from "../scenarios";
import { draftAnswer, type QaInput } from "./answers";
import { kateForScenarios } from "./messages";
import { routeQuestion } from "./router";

const input: QaInput = { ctx: sofieCtx, goal: sofieGoal, plan: sofiePlan, consents: [], rules: t6Rules, asOf: ASOF };
const ask = (q: string) => draftAnswer(routeQuestion(q, sofiePlan), q, input, { simulate, sharedData });
const eur = (n: number) => `€${Math.round(n).toLocaleString("en-US")}`;

describe("Kate × T6", () => {
  it("What if the house costs €280k? → the scenarios ARE T6's simulate() output", () => {
    const a = ask("What if the house costs €280k?");
    expect(a.scenarios?.map((s) => s.label)).toEqual(whatIf280k.map((s) => s.label));
    expect(a.text).toContain(`about ${eur(whatIf280k[0].monthlyPayment!)}`);
    expect(a.text).toContain(whatIf280k[1].label);
  });

  it("Can I do the solar panels later? → payment from simulate(dropCapabilities)", () => {
    const a = ask("Can I do the solar panels later?");
    expect(a.scenarios?.length).toBeGreaterThan(0);
    expect(a.text).toMatch(/Without it now, your monthly payment would be about|Your monthly payment doesn't change/);
  });

  it("income drop → A/B choice rendered from the T6 template and scenarios", () => {
    const dt = t6Rules.disruptionTypes.find((t) => t.code === "INCOME_DROP")!;
    const m = kateForScenarios(incomeDropImpact, incomeDropScenarios, sofieCtxIncomeDrop, dt, sofieGoal);
    expect(m.text).not.toMatch(/\{\w+\}/);
    expect(m.text).toContain(`A. ${incomeDropScenarios[0].label}`);
    expect(m.text).toContain(`B. ${incomeDropScenarios[1].label}`);
    expect(m.actions.map((x) => x.id)).toEqual([`choose:${incomeDropScenarios[0].id}`, `choose:${incomeDropScenarios[1].id}`, "advisor"]);
  });
});

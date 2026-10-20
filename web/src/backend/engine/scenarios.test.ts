import { describe, expect, it } from "vitest";
import * as F from "../fixtures/t6-inputs";
import { simulate } from "./scenarios";

describe("simulate (what-if)", () => {
  it("'What if the house costs €280k?' → payment and checks updated, then 2 ways to make it fit", () => {
    const before = JSON.stringify([F.sofieGoal, F.sofiePlan, F.sofieCtx]);
    const [asked, ...fixes] = simulate(F.sofieGoal, F.sofiePlan, F.sofieCtx, { budget: 280_000 }, F.t6Rules, F.ASOF);

    expect(asked.label).toBe("What if the budget is €280,000");
    expect(asked.monthlyPayment!).toBeGreaterThan(F.sofiePlan.summary!.monthlyPayment);
    expect(asked.plan.checks.find((c) => c.constraint === "maxMonthlyPayment")!.ok).toBe(false);
    expect(asked.goalPatch).toEqual({ budget: 280_000 });
    expect(asked.plan.reason).toBe("scenario");

    expect(fixes).toHaveLength(2);
    for (const f of fixes) {
      expect(f.plan.atRisk).toBe(false);
      expect(f.plan.reason).toBe("scenario");
    }
    expect(fixes.some((f) => f.goalPatch.termYears === 30 && f.goalPatch.budget === 280_000)).toBe(true);

    expect(JSON.stringify([F.sofieGoal, F.sofiePlan, F.sofieCtx])).toBe(before); // nothing committed
  });

  it("a change that still fits returns a single scenario", () => {
    const out = simulate(F.sofieGoal, F.sofiePlan, F.sofieCtx, { budget: 240_000 }, F.t6Rules, F.ASOF);
    expect(out).toHaveLength(1);
    expect(out[0].plan.atRisk).toBe(false);
    expect(out[0].monthlyPayment!).toBeLessThan(F.sofiePlan.summary!.monthlyPayment);
  });

  it("an income drop what-if is repaired like a real disruption", () => {
    const [asked, ...fixes] = simulate(F.sofieGoal, F.sofiePlan, F.sofieCtx, { incomeDeltaPct: -35 }, F.t6Rules, F.ASOF);
    expect(asked.label).toBe("What if your income drops 35%");
    expect(asked.plan.atRisk).toBe(true);
    expect(fixes.length).toBeGreaterThan(0);
    expect(fixes.every((f) => !f.plan.atRisk)).toBe(true);
  });

  it("a rate rise re-prices the loan", () => {
    const [asked] = simulate(F.sofieGoal, F.sofiePlan, F.sofieCtx, { rateDeltaPct: 1 }, F.t6Rules, F.ASOF);
    expect(asked.goalPatch.ratePct).toBeCloseTo(4.2);
    expect(asked.monthlyPayment!).toBeGreaterThan(F.sofiePlan.summary!.monthlyPayment);
  });
});

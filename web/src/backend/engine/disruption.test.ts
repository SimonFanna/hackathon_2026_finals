import { describe, expect, it } from "vitest";
import * as F from "../fixtures/t6-inputs";
import { assessImpact, detectDisruptions, severityOf } from "./disruption";

const id = (cap: string) => `${F.sofieGoal.id}:${cap}`;

describe("detectDisruptions", () => {
  it("finds an income drop from the benefits signal and the context diff, once", () => {
    const ds = detectDisruptions(F.incomeDropSignals, F.sofieCtx, F.sofieCtxIncomeDrop, F.t6Rules, F.AT);
    expect(ds).toHaveLength(1);
    expect(ds[0].code).toBe("INCOME_DROP");
    expect(ds[0].evidence).toEqual(["tx-benefits-1"]);
    expect(ds[0].delta.monthlyIncome).toBe(1800);
  });

  it("sees an income drop and a savings hit from the context alone", () => {
    const after = { ...F.sofieCtx, monthlyIncome: 2000, savings: 20_000 };
    const codes = detectDisruptions([], F.sofieCtx, after, F.t6Rules, F.AT).map((d) => d.code);
    expect(codes).toEqual(["INCOME_DROP", "UNEXPECTED_EXPENSE"]);
  });

  it("ignores small changes", () => {
    const after = { ...F.sofieCtx, monthlyIncome: 2500, savings: 29_000 };
    expect(detectDisruptions([], F.sofieCtx, after, F.t6Rules, F.AT)).toEqual([]);
  });

  it("reads the partner event behind a delay signal", () => {
    const [d] = detectDisruptions(F.partnerDelaySignals, F.sofieCtx, F.sofieCtx, F.t6Rules, F.AT, [F.partnerDelayEvent]);
    expect(d).toMatchObject({ code: "PARTNER_DELAY", delta: { capability: "quote_insulation", sourceRow: 131, delayDays: 120 } });
  });

  it("falls back to the signal value without the event", () => {
    const [d] = detectDisruptions(F.costOverrunSignals, F.sofieCtx, F.sofieCtx, F.t6Rules, F.AT);
    expect(d.delta.costOverrunEur).toBe(9000);
  });
});

describe("assessImpact", () => {
  it("income drop breaks the monthly payment, high severity, on the loan steps", () => {
    const [d] = detectDisruptions(F.incomeDropSignals, F.sofieCtx, F.sofieCtxIncomeDrop, F.t6Rules, F.AT);
    const impact = assessImpact(d, F.sofieGoal, F.sofiePlan, F.sofieCtxIncomeDrop);
    expect(impact.broken.map((c) => c.constraint)).toEqual(["maxMonthlyPayment"]);
    expect(impact.broken[0].limit).toBe(750);
    expect(impact.severity).toBe("high");
    expect(impact.affectedStepIds).toEqual(expect.arrayContaining([id("finance_property"), id("finance_renovation")]));
  });

  it("cost overrun breaks the budget by the overrun (the house price is pinned)", () => {
    const [d] = detectDisruptions(F.costOverrunSignals, F.sofieCtx, F.sofieCtx, F.t6Rules, F.AT, [F.costOverrunEvent]);
    const impact = assessImpact(d, F.sofieGoal, F.sofiePlan, F.sofieCtx);
    const budget = impact.broken.find((c) => c.constraint === "budget")!;
    expect(Number(budget.actual) - Number(budget.limit)).toBe(9000);
    expect(impact.affectedStepIds).toContain(id("quote_heating"));
  });

  it("partner delay pushes the late step and its dependents past the deadline", () => {
    const [d] = detectDisruptions(F.partnerDelaySignals, F.sofieCtx, F.sofieCtx, F.t6Rules, F.AT, [F.partnerDelayEvent]);
    const impact = assessImpact(d, F.sofieGoal, F.sofiePlan, F.sofieCtx);
    expect(impact.broken.map((c) => c.constraint)).toEqual(["deadline"]);
    expect(impact.affectedStepIds).toEqual(expect.arrayContaining([id("quote_insulation"), id("finance_renovation")]));
  });

  it("never mutates its inputs", () => {
    const before = JSON.stringify([F.sofieGoal, F.sofiePlan]);
    for (const [sig, ev] of [[F.costOverrunSignals, F.costOverrunEvent], [F.partnerDelaySignals, F.partnerDelayEvent]] as const) {
      const [d] = detectDisruptions(sig, F.sofieCtx, F.sofieCtx, F.t6Rules, F.AT, [ev]);
      assessImpact(d, F.sofieGoal, F.sofiePlan, F.sofieCtx);
    }
    expect(JSON.stringify([F.sofieGoal, F.sofiePlan])).toBe(before);
  });
});

describe("severityOf", () => {
  const check = (actual: number, limit: number) => ({ constraint: "maxMonthlyPayment" as const, ok: actual <= limit, actual, limit, message: "" });
  it("grades by how far over the limit", () => {
    expect(severityOf([])).toBe("low");
    expect(severityOf([check(1020, 1000)])).toBe("low");
    expect(severityOf([check(1100, 1000)])).toBe("medium");
    expect(severityOf([check(1300, 1000)])).toBe("high");
  });
});

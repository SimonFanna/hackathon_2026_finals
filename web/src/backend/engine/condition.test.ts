import { describe, expect, it } from "vitest";
import type { PersistentContext } from "../types";
import { evalCondition, resolvePath } from "./condition";

const ctx: PersistentContext = {
  customerId: 1, firstName: "Sofie", age: 29, region: "Antwerp", language: "nl",
  household: "single", children: 0, youngestChildAgeMonths: null,
  employment: "employee", monthlyIncome: 2900, housing: "tenant", monthlyRent: 950,
  savings: 31000, monthlyDebt: 0, debtRatio: 0, heldSourceRows: [3, 12],
  properties: [{ kind: "house", buildYear: 1965, epc: "E", value: 310000 }],
  cashflowPressure: "low",
};
const scope = { ctx };

describe("evalCondition", () => {
  it("treats null and {} as true", () => {
    expect(evalCondition(null, scope)).toBe(true);
    expect(evalCondition({}, scope)).toBe(true);
  });

  it("resolves dotted paths, including array indexes", () => {
    expect(resolvePath(scope, "ctx.properties.0.epc")).toBe("E");
    expect(resolvePath(scope, "ctx.properties.3.epc")).toBeUndefined();
    expect(resolvePath(scope, "goal.constraints.budget")).toBeUndefined();
  });

  it("supports every comparison op", () => {
    expect(evalCondition({ field: "ctx.housing", value: "tenant" }, scope)).toBe(true); // default eq
    expect(evalCondition({ field: "ctx.housing", op: "neq", value: "owner" }, scope)).toBe(true);
    expect(evalCondition({ field: "ctx.age", op: "gt", value: 29 }, scope)).toBe(false);
    expect(evalCondition({ field: "ctx.age", op: "gte", value: 29 }, scope)).toBe(true);
    expect(evalCondition({ field: "ctx.debtRatio", op: "lt", value: 0.35 }, scope)).toBe(true);
    expect(evalCondition({ field: "ctx.savings", op: "lte", value: 30000 }, scope)).toBe(false);
    expect(evalCondition({ field: "ctx.properties.0.epc", op: "in", value: ["D", "E", "F"] }, scope)).toBe(true);
    expect(evalCondition({ field: "ctx.heldSourceRows", op: "contains", value: 12 }, scope)).toBe(true);
    expect(evalCondition({ field: "ctx.heldSourceRows", op: "in", value: [99, 3] }, scope)).toBe(true);
    expect(evalCondition({ field: "ctx.region", op: "contains", value: "werp" }, scope)).toBe(true);
  });

  it("handles exists and missing fields safely", () => {
    expect(evalCondition({ field: "ctx.properties.0.epc", op: "exists" }, scope)).toBe(true);
    expect(evalCondition({ field: "ctx.youngestChildAgeMonths", op: "exists" }, scope)).toBe(false);
    expect(evalCondition({ field: "ctx.youngestChildAgeMonths", op: "exists", value: false }, scope)).toBe(true);
    expect(evalCondition({ field: "goal.constraints.budget", op: "gt", value: 0 }, scope)).toBe(false);
    expect(evalCondition({ field: "ctx.region", op: "gt", value: 3 }, scope)).toBe(false); // type mismatch
  });

  it("combines all / any / not", () => {
    const tenantWithSavings = { all: [{ field: "ctx.housing", value: "tenant" }, { field: "ctx.savings", op: "gte" as const, value: 20000 }] };
    expect(evalCondition(tenantWithSavings, scope)).toBe(true);
    expect(evalCondition({ any: [{ field: "ctx.age", op: "gt", value: 60 }, { field: "ctx.children", value: 0 }] }, scope)).toBe(true);
    expect(evalCondition({ not: tenantWithSavings }, scope)).toBe(false);
    expect(evalCondition({ all: [] }, scope)).toBe(true);
    expect(evalCondition({ any: [] }, scope)).toBe(false);
  });

  it("evaluates goal fields and extra scope roots", () => {
    const goal = { id: "g1", customerId: 1, type: "BUY_AND_PREPARE_HOME" as const, status: "confirmed" as const,
      constraints: { budget: 300000 }, priorities: [], dependsOn: [], createdAt: "2026-10-01" };
    expect(evalCondition({ field: "goal.constraints.budget", op: "lte", value: 320000 }, { ctx, goal })).toBe(true);
    expect(evalCondition({ field: "signals.RENOVATION_VIEW", op: "exists" }, { ctx, signals: { RENOVATION_VIEW: 0.4 } })).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import * as F from "../fixtures/t6-inputs";
import type { Goal } from "../types";
import { arbitrate } from "./arbitration";

const ev: Goal = {
  id: "goal-1-switch_to_ev", customerId: 1, type: "SWITCH_TO_EV", status: "confirmed",
  constraints: { maxMonthlyPayment: 250, deadline: "2027-09-01" }, priorities: ["affordability"], dependsOn: [], createdAt: F.ASOF,
};

describe("arbitrate", () => {
  it("serves the earlier goal first and explains what does not fit", () => {
    const { allocations, conflicts } = arbitrate([ev, F.sofieGoal], [F.sofiePlan], F.sofieCtx);
    expect(allocations.map((a) => a.goalId)).toEqual([F.sofieGoal.id, ev.id]);
    expect(allocations[0]).toMatchObject({ maxMonthlyPayment: F.sofiePlan.summary!.monthlyPayment, ownFunds: 30_000, priority: 1 });
    const left = 1100 - F.sofiePlan.summary!.monthlyPayment;
    expect(allocations[1].maxMonthlyPayment).toBe(left);
    expect(conflicts).toEqual([`EV purchase and home purchase together exceed your monthly capacity by €${250 - left}.`]);
  });

  it("a goal that depends on another waits for it, whatever its deadline", () => {
    const early = { ...ev, constraints: { ...ev.constraints, deadline: "2026-12-01" }, dependsOn: [F.sofieGoal.id] };
    const { allocations } = arbitrate([early, F.sofieGoal], [F.sofiePlan], F.sofieCtx);
    expect(allocations.map((a) => a.goalId)).toEqual([F.sofieGoal.id, ev.id]);
  });

  it("ignores paused or finished goals and reports no conflict when everything fits", () => {
    const { allocations, conflicts } = arbitrate([{ ...ev, status: "paused" }, F.sofieGoal], [F.sofiePlan], F.sofieCtx);
    expect(allocations).toHaveLength(1);
    expect(conflicts).toEqual([]);
  });

  it("re-runs after an income drop: the home plan alone no longer fits", () => {
    const { conflicts } = arbitrate([F.sofieGoal], [F.sofiePlan], F.sofieCtxIncomeDrop);
    expect(conflicts[0]).toMatch(/^Home purchase alone exceed/);
  });
});

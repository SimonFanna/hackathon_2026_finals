import { describe, expect, it } from "vitest";
import * as F from "../fixtures/t6-inputs";
import { lucasCtx, lucasGoal, lucasPlan } from "../fixtures/t5-sofie-plan";
import type { Event, Provider, RuleSet, Signal } from "../types";
import { assessImpact, detectDisruptions } from "./disruption";
import { checkSafety, chooseScenario, replan } from "./replan";

function run(signals: Signal[], after = F.sofieCtx, events: Event[] = [], rules: RuleSet = F.t6Rules) {
  const [d] = detectDisruptions(signals, F.sofieCtx, after, rules, F.AT, events);
  const impact = assessImpact(d, F.sofieGoal, F.sofiePlan, after);
  return { d, impact, scenarios: replan(F.sofieGoal, F.sofiePlan, after, impact, rules, F.AT, d) };
}
const caps = (s: { plan: { steps: { capability: string }[] } }) => s.plan.steps.map((x) => x.capability);

describe("replan — income drop (hero demo)", () => {
  const { scenarios, impact } = run(F.incomeDropSignals, F.sofieCtxIncomeDrop);
  const [a, b] = scenarios;
  const newMax = Number(impact.broken[0].limit);

  it("offers 2 feasible scenarios with different strategies and payments, both under the new max", () => {
    expect(a.plan.atRisk).toBe(false);
    expect(b.plan.atRisk).toBe(false);
    expect(a.strategies[0]).not.toBe(b.strategies[0]);
    expect(a.monthlyPayment).not.toBe(b.monthlyPayment);
    for (const s of [a, b]) expect(s.monthlyPayment!).toBeLessThanOrEqual(newMax);
  });

  it("A/B are a longer protected loan and a smaller scope", () => {
    const byStrategy = Object.fromEntries([a, b].map((s) => [s.strategies.join("+"), s]));
    const longer = byStrategy["EXTEND_TERM+ADD_PROTECTION"];
    const smaller = byStrategy["REDUCE_SCOPE"];
    expect(longer.goalPatch.termYears).toBe(30);
    expect(caps(longer)).toContain("insure_loan");
    expect(smaller.goalPatch.budget!).toBeLessThan(F.sofieGoal.constraints.budget!);
    expect(caps(smaller)).not.toContain("evaluate_solar");
    expect(caps(smaller)).not.toContain("quote_windows");
    expect(smaller.label).toMatch(/2 phases/);
  });

  it("scores and explains each scenario", () => {
    for (const s of scenarios) {
      expect(s.score).toBeGreaterThan(0);
      expect(s.probabilityOfSuccess).toBeGreaterThanOrEqual(0);
      expect(s.probabilityOfSuccess).toBeLessThanOrEqual(1);
      expect(s.tradeoffs.length).toBeGreaterThan(0);
      expect(s.plan.version).toBe(F.sofiePlan.version + 1);
      expect(s.plan.reason).toBe("replan");
    }
  });

  it("commercial non-urgent steps WAIT under cashflow pressure (T5 decision rules)", () => {
    expect(a.plan.steps.find((s) => s.capability === "quote_windows")?.display ?? "WAIT").toBe("WAIT");
    expect(scenarios.some((s) => s.plan.steps.some((x) => x.display === "WAIT"))).toBe(true);
  });

  it("is deterministic", () => {
    expect(JSON.stringify(run(F.incomeDropSignals, F.sofieCtxIncomeDrop).scenarios)).toBe(JSON.stringify(scenarios));
  });
});

describe("replan — partner delay", () => {
  it("REORDER keeps the deadline: the late quote and its dependents wait, the rest moves on", () => {
    const { scenarios } = run(F.partnerDelaySignals, F.sofieCtx, [F.partnerDelayEvent]);
    const best = scenarios[0];
    expect(best.strategies).toContain("REORDER");
    expect(best.plan.checks.find((c) => c.constraint === "deadline")!.ok).toBe(true);
    const paused = best.plan.steps.filter((s) => s.status === "paused").map((s) => s.capability);
    expect(paused).toEqual(expect.arrayContaining(["quote_insulation", "finance_renovation"]));
  });

  it("SWAP_PROVIDER moves to a faster alternative when the registry has one", () => {
    const faster: Provider = { ...F.t6Rules.providers.find((p) => p.sourceRow === 131)!, sourceRow: 999, provider: "Fast Insulation", leadTimeDays: 14, priority: 5 };
    const rules = { ...F.t6Rules, providers: [...F.t6Rules.providers, faster] };
    const [d] = detectDisruptions(F.partnerDelaySignals, F.sofieCtx, F.sofieCtx, rules, F.AT, [F.partnerDelayEvent]);
    const impact = assessImpact(d, F.sofieGoal, F.sofiePlan, F.sofieCtx);
    const swap = replan(F.sofieGoal, F.sofiePlan, F.sofieCtx, impact, rules, F.AT, d).find((s) => s.strategies[0] === "SWAP_PROVIDER")!;
    expect(swap.plan.steps.find((s) => s.capability === "quote_insulation")!.provider.sourceRow).toBe(999);
    expect(swap.plan.checks.every((c) => c.ok)).toBe(true);
    expect(swap.label).toMatch(/Fast Insulation/);
  });
});

describe("replan — cost overrun", () => {
  const { scenarios } = run(F.costOverrunSignals, F.sofieCtx, [F.costOverrunEvent]);
  it("best scenario fits the budget again, the 2nd uses another strategy", () => {
    expect(scenarios[0].plan.checks.every((c) => c.ok)).toBe(true);
    expect(scenarios[1].strategies[0]).not.toBe(scenarios[0].strategies[0]);
  });
  it("keeps the overrun on the late quote", () => {
    const heat = scenarios[0].plan.steps.find((s) => s.capability === "quote_heating")!;
    expect(heat.provider.costEur).toBe(14_000 + 9000);
  });
});

describe("chooseScenario", () => {
  const { scenarios } = run(F.incomeDropSignals, F.sofieCtxIncomeDrop);
  it("makes the scenario the active plan and marks the goal replanned, inputs untouched", () => {
    const before = JSON.stringify([F.sofieGoal, scenarios[0]]);
    const { goal, plan } = chooseScenario(F.sofieGoal, scenarios[0]);
    expect(goal.status).toBe("replanned");
    expect(goal.constraints).toMatchObject(scenarios[0].goalPatch);
    expect(plan.version).toBe(F.sofiePlan.version + 1);
    expect(JSON.stringify([F.sofieGoal, scenarios[0]])).toBe(before);
  });
  it("PAUSE pauses the goal", () => {
    const pause = scenarios.find((s) => s.strategies.includes("PAUSE"))!;
    expect(chooseScenario(F.sofieGoal, pause).goal.status).toBe("paused");
  });
});

describe("checkSafety", () => {
  const c = (actual: number, limit: number) => ({ constraint: "maxMonthlyPayment" as const, ok: actual <= limit, actual, limit, message: "" });
  it("rewards margin and punishes overshoot", () => {
    expect(checkSafety(c(850, 1000))).toBe(1);
    expect(checkSafety(c(990, 1000))).toBeCloseTo(0.813, 2);
    expect(checkSafety(c(1100, 1000))).toBeCloseTo(0.25, 2);
    expect(checkSafety(c(1300, 1000))).toBe(0);
  });
});

describe("replan — other disruptions, same code", () => {
  it("rate +1 pt: the loan is re-priced and a scenario fits again", () => {
    const signals: Signal[] = [{ code: "RATE_CHANGE", customerId: 1, strength: 1, at: F.AT, count: 1, value: 1, evidence: [], isDisruption: true }];
    const tight = { ...F.sofieCtx, monthlyIncome: 2500 }; // max €1,050: the re-priced loan no longer fits
    const [d] = detectDisruptions(signals, tight, tight, F.t6Rules, F.AT);
    const impact = assessImpact(d, F.sofieGoal, F.sofiePlan, tight);
    expect(impact.broken.map((c) => c.constraint)).toContain("maxMonthlyPayment");
    const [best] = replan(F.sofieGoal, F.sofiePlan, tight, impact, F.t6Rules, F.AT, d);
    expect(best.plan.atRisk).toBe(false);
    expect(best.plan.summary!.ratePct).toBeCloseTo(4.2);
  });

  it("unexpected expense: own funds follow the savings left, and the plan fits again", () => {
    const after = { ...F.sofieCtx, savings: 16_000 };
    const [d] = detectDisruptions([], F.sofieCtx, after, F.t6Rules, F.AT);
    expect(d.code).toBe("UNEXPECTED_EXPENSE");
    const impact = assessImpact(d, F.sofieGoal, F.sofiePlan, after);
    expect(impact.broken.map((c) => c.constraint)).toEqual(["ownFunds"]);
    const [best, second] = replan(F.sofieGoal, F.sofiePlan, after, impact, F.t6Rules, F.AT, d);
    expect(best.plan.atRisk).toBe(false);
    expect(best.goalPatch.ownFunds).toBe(15_000);
    expect(second.strategies[0]).not.toBe(best.strategies[0]);
  });

  it("Lucas (business, no loan): an income drop is detected but breaks nothing, so there is nothing to replan", () => {
    const after = { ...lucasCtx, employment: "self_employed", monthlyIncome: 1500, cashflowPressure: "high" as const };
    const [d] = detectDisruptions([], lucasCtx, after, F.t6Rules, F.AT);
    expect(d.code).toBe("INCOME_DROP");
    const impact = assessImpact(d, lucasGoal, lucasPlan, after);
    expect(impact.broken).toEqual([]);
    expect(impact.severity).toBe("low");
  });
});

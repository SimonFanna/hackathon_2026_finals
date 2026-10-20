import { describe, expect, it } from "vitest";
import { buildPlan, checkConstraints, createGoal } from "./orchestrator";
import { ASOF, lucasCtx, sofieCtx, t5Rules } from "../fixtures/t5-inputs";
import type { Goal, Plan } from "../types";

const sofieGoal = (constraints: Goal["constraints"] = { budget: 250_000, ownFunds: 30_000, maxMonthlyPayment: 1100 }) =>
  createGoal({ customerId: 1, type: "BUY_AND_PREPARE_HOME", constraints, priorities: ["affordability", "energy_efficiency"] }, sofieCtx, t5Rules, ASOF);

const caps = (p: Plan) => p.steps.map((s) => s.capability);
const step = (p: Plan, code: string) => p.steps.find((s) => s.capability === code)!;

describe("createGoal", () => {
  it("fills missing constraints from affordability and assumes an old house for a buyer", () => {
    const g = sofieGoal({});
    expect(g.constraints.maxMonthlyPayment).toBe(1100);
    expect(g.constraints.ownFunds).toBe(30_000);
    expect(g.constraints.termYears).toBe(25);
    expect(g.constraints.budget).toBeGreaterThanOrEqual(250_000);
    expect(g.constraints.deadline).toBe("2027-04-01");
    expect(g.constraints.targetProperty).toMatchObject({ buildYear: 1975, epc: "E" });
    expect(g.status).toBe("confirmed");
  });
  it("keeps what the customer confirmed", () => {
    expect(sofieGoal().constraints).toMatchObject({ budget: 250_000, ownFunds: 30_000, maxMonthlyPayment: 1100 });
  });
  it("throws on an unknown goal type", () => {
    expect(() => createGoal({ customerId: 1, type: "NOPE" as never, constraints: {}, priorities: [] }, sofieCtx, t5Rules, ASOF)).toThrow();
  });
});

describe("buildPlan: Sofie", () => {
  const goal = sofieGoal();
  const plan = buildPlan(goal, sofieCtx, t5Rules, ASOF);

  it("has ≥ 12 steps, ≥ 4 providers and 3 partners, no bridging loan for a tenant", () => {
    expect(plan.steps.length).toBeGreaterThanOrEqual(12);
    expect(caps(plan)).not.toContain("bridge_finance");
    const providers = new Set(plan.steps.map((s) => s.provider.provider));
    expect(providers.size).toBeGreaterThanOrEqual(4);
    expect(new Set(plan.steps.filter((s) => s.provider.isPartner).map((s) => s.provider.provider)).size).toBeGreaterThanOrEqual(3);
  });

  it("orders steps after their dependencies, with increasing ETAs along the chain", () => {
    const pos = new Map(plan.steps.map((s, i) => [s.id, i]));
    for (const s of plan.steps) for (const d of s.dependsOn) expect(pos.get(d)!).toBeLessThan(pos.get(s.id)!);
    for (const s of plan.steps) for (const d of s.dependsOn) expect(plan.steps.find((x) => x.id === d)!.eta! <= s.eta!).toBe(true);
    expect(plan.steps.map((s) => s.order)).toEqual(plan.steps.map((_, i) => i + 1));
  });

  it("fits her default constraints (not at risk)", () => {
    expect(plan.atRisk).toBe(false);
    expect(plan.checks.map((c) => c.constraint).sort()).toEqual(["budget", "deadline", "maxMonthlyPayment", "ownFunds"]);
    expect(plan.summary!.homeLoan + plan.summary!.renovationLoan).toBeLessThanOrEqual(220_000);
  });

  it("computes the home loan payment with the annuity and fills the why text", () => {
    const fin = step(plan, "finance_property");
    expect(fin.estimates.monthlyPayment).toBeGreaterThan(800);
    expect(fin.why).not.toMatch(/\{/);
    expect(step(plan, "inspect_property").why).toContain("EPC E");
  });

  it("asks partner data only for partner steps", () => {
    expect(step(plan, "estimate_renovation").dataRequested).toContain("postal_code");
    expect(step(plan, "finance_property").dataRequested).toEqual([]);
  });

  it("skips renovation for a recent, efficient home", () => {
    const g = sofieGoal({ budget: 250_000, ownFunds: 30_000, maxMonthlyPayment: 1100, targetProperty: { buildYear: 2015, epc: "A" } });
    const p = buildPlan(g, sofieCtx, t5Rules, ASOF);
    expect(caps(p)).not.toContain("estimate_renovation");
    expect(caps(p)).toContain("evaluate_solar");
  });

  it("is at risk when the house costs €280k", () => {
    const g = sofieGoal({ budget: 250_000, ownFunds: 30_000, maxMonthlyPayment: 1100, targetProperty: { buildYear: 1975, epc: "E", price: 280_000 } });
    const p = buildPlan(g, sofieCtx, t5Rules, ASOF);
    expect(p.atRisk).toBe(true);
    expect(p.checks.find((c) => c.constraint === "budget")!.ok).toBe(false);
    expect(p.checks.find((c) => c.constraint === "maxMonthlyPayment")!.ok).toBe(false);
  });
});

describe("buildPlan options (for T6)", () => {
  const goal = sofieGoal();
  it("excludes and forces providers", () => {
    const p = buildPlan(goal, sofieCtx, t5Rules, ASOF, { excludeProviders: [17] });
    expect(step(p, "value_property").provider.sourceRow).toBe(16);
    const f = buildPlan(goal, sofieCtx, t5Rules, ASOF, { forceProviders: { finance_renovation: 4 } });
    expect(step(f, "finance_renovation").provider.sourceRow).toBe(4);
    expect(step(f, "finance_renovation").alternatives.map((a) => a.sourceRow)).toEqual([128]);
  });
  it("drops and includes capabilities, sets version and reason", () => {
    const p = buildPlan(goal, sofieCtx, t5Rules, ASOF, { dropCapabilities: ["evaluate_solar", "quote_windows"], includeCapabilities: ["bridge_finance"], version: 2, reason: "replan" });
    expect(caps(p)).not.toContain("evaluate_solar");
    expect(caps(p)).toContain("bridge_finance");
    expect(p.version).toBe(2);
    expect(p.reason).toBe("replan");
    expect(p.id).not.toBe(buildPlan(goal, sofieCtx, t5Rules, ASOF).id);
  });
  it("cost overrides and partner delays move money and dates", () => {
    const base = buildPlan(goal, sofieCtx, t5Rules, ASOF);
    const pinned = { ...goal, constraints: { ...goal.constraints, targetProperty: { ...goal.constraints.targetProperty, price: base.summary!.purchasePrice } } };
    const over = buildPlan(pinned, sofieCtx, t5Rules, ASOF, { costOverrides: { quote_heating: 30_000 } });
    expect(over.summary!.renovationCost).toBe(base.summary!.renovationCost + 16_000);
    expect(over.checks.find((c) => c.constraint === "budget")!.ok).toBe(false);
    const late = buildPlan(goal, sofieCtx, t5Rules, ASOF, { extraLeadDays: { estimate_renovation: 200 } });
    expect(late.atRisk).toBe(true);
    expect(late.checks.find((c) => c.constraint === "deadline")!.ok).toBe(false);
  });
  it("is deterministic", () => {
    expect(buildPlan(goal, sofieCtx, t5Rules, ASOF)).toEqual(buildPlan(goal, sofieCtx, t5Rules, ASOF));
  });
});

describe("checkConstraints", () => {
  const goal = sofieGoal();
  const plan = buildPlan(goal, sofieCtx, t5Rules, ASOF);
  it("breaks the monthly check when income drops", () => {
    const checks = checkConstraints(plan, goal, { ...sofieCtx, monthlyIncome: 1800 });
    const m = checks.find((c) => c.constraint === "maxMonthlyPayment")!;
    expect(m.ok).toBe(false);
    expect(m.message).toContain("current income");
  });
  it("breaks the own-funds check after a large expense", () => {
    expect(checkConstraints(plan, goal, { ...sofieCtx, savings: 12_000 }).find((c) => c.constraint === "ownFunds")!.ok).toBe(false);
  });
});

describe("buildPlan: Lucas, same code", () => {
  it("builds START_BUSINESS", () => {
    const g = createGoal({ customerId: 2, type: "START_BUSINESS", constraints: {}, priorities: ["speed"] }, lucasCtx, t5Rules, ASOF);
    const p = buildPlan(g, lucasCtx, t5Rules, ASOF);
    expect(p.steps.length).toBe(9);
    expect(p.steps[0].capability).toBe("get_startup_support");
    expect(step(p, "get_startup_support").provider.sourceRow).toBe(107); // registry priority outweighs a 4-day lead-time gain
    expect(p.atRisk).toBe(false);
    expect(p.summary!.homeLoan).toBe(0);
  });
});

describe("fixture t5-sofie-plan", () => {
  it("matches the acceptance criteria", async () => {
    const f = await import("../fixtures/t5-sofie-plan");
    expect(f.sofiePlan.atRisk).toBe(false);
    expect(f.sofiePlan.steps.find((s) => s.capability === "insure_property")!.display).toBe("ALREADY_COVERED");
    expect(f.sofieOutcome.partners.leads).toBe(0);
    expect(checkConstraints(f.sofiePlan, f.sofieGoal, f.sofieCtxIncomeDrop).some((c) => !c.ok)).toBe(true);
    expect(f.lucasPlan.steps.length).toBe(9);
  });
});

describe("Setle before the loan", () => {
  it("sizes the home loan after the renovation and grants estimate, when there is one", async () => {
    const f = await import("../fixtures/t5-sofie-plan");
    const pos = (c: string) => f.sofiePlan.steps.findIndex((s) => s.capability === c);
    expect(pos("estimate_renovation")).toBeLessThan(pos("finance_property"));
    expect(pos("identify_grants")).toBeLessThan(pos("finance_property"));
    const g = { ...f.sofieGoal, constraints: { ...f.sofieGoal.constraints, targetProperty: { buildYear: 2015, epc: "A" } } };
    const p = buildPlan(g, f.sofieCtx, f.t5Rules, f.ASOF);
    expect(p.steps.find((s) => s.capability === "finance_property")!.dependsOn.sort()).toEqual([`${g.id}:estimate_budget`, `${g.id}:value_property`]);
  });
});

describe("why texts (Kate quotes them verbatim)", () => {
  it("never contain a raw placeholder, and partner steps list the data requested", async () => {
    const f = await import("../fixtures/t5-sofie-plan");
    for (const s of [...f.sofiePlan.steps, ...f.lucasPlan.steps]) {
      expect(s.why).not.toMatch(/[{}]/);
      if (s.provider.isPartner) expect(s.dataRequested.length).toBeGreaterThan(0);
    }
    const rules = { ...f.t5Rules, templates: f.t5Rules.templates.map((t) => ({ ...t, steps: t.steps.map((s) => ({ ...s, why: `${s.why} {unknownKey}` })) })) };
    expect(buildPlan(f.sofieGoal, f.sofieCtx, rules, f.ASOF).steps.every((s) => !s.why.includes("{"))).toBe(true);
  });
});

// T6 builds on these behaviours: change them only after pinging T6.
describe("contract with T6 (replanning)", () => {
  const goal = sofieGoal();
  const base = buildPlan(goal, sofieCtx, t5Rules, ASOF);
  it("step ids are `${goalId}:${capability}` and summary.purchasePrice exists", () => {
    for (const s of base.steps) expect(s.id).toBe(`${goal.id}:${s.capability}`);
    expect(typeof base.summary!.purchasePrice).toBe("number");
  });
  it("check keys, and ownFunds.actual is the savings", () => {
    expect(base.checks.map((c) => c.constraint).sort()).toEqual(["budget", "deadline", "maxMonthlyPayment", "ownFunds"]);
    expect(base.checks.find((c) => c.constraint === "ownFunds")!.actual).toBe(sofieCtx.savings);
  });
  it("costOverrides are absolute, extraLeadDays are a delta", () => {
    const o = buildPlan(goal, sofieCtx, t5Rules, ASOF, { costOverrides: { quote_heating: 20_000 } });
    expect(step(o, "quote_heating").provider.costEur).toBe(20_000);
    const l = buildPlan(goal, sofieCtx, t5Rules, ASOF, { extraLeadDays: { quote_heating: 10 } });
    expect(step(l, "quote_heating").provider.leadTimeDays).toBe(step(base, "quote_heating").provider.leadTimeDays + 10);
  });
  it("is pure and cheap (100 builds well under a second, inputs untouched)", () => {
    const before = JSON.stringify([goal, sofieCtx, t5Rules]);
    const t0 = performance.now();
    for (let i = 0; i < 100; i++) buildPlan(goal, sofieCtx, t5Rules, ASOF, { costOverrides: { quote_heating: i * 100 } });
    expect(performance.now() - t0).toBeLessThan(1000);
    expect(JSON.stringify([goal, sofieCtx, t5Rules])).toBe(before);
  });
});

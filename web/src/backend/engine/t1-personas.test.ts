// T1 acceptance on the real synthetic data of the 6 demo personas (backend/T1-signals-context.md).
import { describe, expect, it } from "vitest";
import { T1_SIGNAL_RULES, demoFactsFor } from "../fixtures/t1-helpers";
import type { CustomerFacts, Event, SignalCode } from "../types";
import { buildContext } from "./context";
import { toEvents } from "./events";
import { extractSignals } from "./signals";

const HOME: SignalCode[] = ["MORTGAGE_SIMULATION", "HOUSING_BUDGET_VIEW", "PROPERTY_VALUATION_VIEW", "HOME_SEARCH_IN_APP",
  "RENOVATION_VIEW", "HOME_LOAN_VIEW", "HOME_LOAN_KATE_QUESTION", "HOME_LOAN_APPLICATION", "SAVING_FOR_DOWN_PAYMENT", "NOTARY_PAYMENT"];
const BUSINESS: SignalCode[] = ["FREELANCE_INCOME", "SALARY_STOPPED", "START_IT_VIEW", "BUSINESS_ACCOUNT_VIEW", "BUSINESS_TOOLS_VIEW",
  "BUSINESS_PROTECTION_VIEW", "BUSINESS_KATE_QUESTION", "ACCOUNTING_TOOL_PAYMENT"];

function run(facts: CustomerFacts) {
  const signals = extractSignals(toEvents(facts), T1_SIGNAL_RULES, facts.asOf);
  return { signals, ctx: buildContext(facts, signals), by: new Map(signals.map((s) => [s.code, s])) };
}
const strongest = (signals: { code: SignalCode; strength: number }[], codes: SignalCode[]) =>
  Math.max(0, ...signals.filter((s) => codes.includes(s.code)).map((s) => s.strength));

describe("T1 on the demo personas", () => {
  it("Sofie: ≥ 4 home signals incl. her 4 simulations, tenant, low pressure", () => {
    const { signals, ctx, by } = run(demoFactsFor("sofie"));
    expect(signals.filter((s) => HOME.includes(s.code)).length).toBeGreaterThanOrEqual(4);
    expect(by.get("MORTGAGE_SIMULATION")).toMatchObject({ count: 4, value: 476000 });
    for (const code of ["HOUSING_BUDGET_VIEW", "PROPERTY_VALUATION_VIEW", "RENOVATION_VIEW", "HOME_LOAN_KATE_QUESTION", "SAVING_FOR_DOWN_PAYMENT"] as const) {
      expect(by.has(code), code).toBe(true);
    }
    expect(ctx).toMatchObject({ housing: "tenant", cashflowPressure: "low", household: "couple", children: 1, age: 32, monthlyDebt: 0 });
    expect(ctx.savings).toBeCloseTo(30935.15, 2);
    expect(ctx.heldSourceRows).not.toContain(8); // no home insurance yet
  });

  it("Lucas: freelance income from several clients and a stopped salary, no income drop", () => {
    const { by } = run(demoFactsFor("lucas"));
    expect(by.has("FREELANCE_INCOME")).toBe(true);
    expect(by.has("SALARY_STOPPED")).toBe(true);
    expect(by.has("BUSINESS_KATE_QUESTION")).toBe(true);
    expect(by.has("INCOME_DROP")).toBe(false);
  });

  it("Els: no strong home or business signal", () => {
    const { signals, ctx } = run(demoFactsFor("els"));
    expect(strongest(signals, HOME)).toBeLessThan(0.1);
    expect(strongest(signals, BUSINESS)).toBeLessThan(0.1);
    expect(ctx.housing).toBe("owner");
  });

  it("Thomas (hard negative): home signals present but weaker than Sofie's, no simulation", () => {
    const thomas = run(demoFactsFor("thomas"));
    const sofie = run(demoFactsFor("sofie"));
    expect(thomas.signals.some((s) => HOME.includes(s.code))).toBe(true);
    expect(thomas.by.has("MORTGAGE_SIMULATION")).toBe(false);
    const total = (r: ReturnType<typeof run>) => r.signals.filter((s) => HOME.includes(s.code)).reduce((a, s) => a + s.strength, 0);
    expect(total(thomas)).toBeLessThan(total(sofie) / 2);
  });

  it("Sofie + injected income drop: INCOME_DROP disruption and higher cashflow pressure", () => {
    const facts = demoFactsFor("sofie");
    const salary = facts.employment.monthlyNetIncome;
    facts.transactions = facts.transactions.filter((t) => !(t.category === "salary" && t.bookedOn.startsWith("2026-09")));
    const benefits: Event = { id: "inj:income_drop", customerId: facts.customer.id, at: "2026-09-28", source: "transaction",
      kind: "tx:benefits", detail: { amount: 0.6 * salary, inflow: 0.6 * salary, outflow: 0, counterparty: "RVA/ONEM", category: "benefits" } };
    facts.injectedEvents = [benefits];
    const { by, ctx } = run(facts);
    expect(by.get("INCOME_DROP")).toMatchObject({ isDisruption: true });
    expect(by.get("BENEFITS_INFLOW")).toMatchObject({ isDisruption: true });
    expect(ctx.monthlyIncome).toBeLessThan(0.75 * salary);
    expect(ctx.cashflowPressure).toBe("high");
  });

  it("every demo persona runs deterministically", () => {
    for (const slug of ["sofie", "lucas", "nadia", "pieter", "els", "thomas"]) {
      expect(run(demoFactsFor(slug)).signals).toEqual(run(demoFactsFor(slug)).signals);
    }
  });
});

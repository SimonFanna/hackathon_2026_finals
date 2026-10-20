import { describe, expect, it } from "vitest";
import { T1_SIGNAL_RULES, makeFacts } from "../fixtures/t1-helpers";
import type { CustomerFacts, Event, SignalRule } from "../types";
import { SIGNAL_CODES } from "../vocabulary";
import { toEvents } from "./events";
import { decay, extractSignals, saturation } from "./signals";

const AS_OF = "2026-10-01";
const rule = (code: string): SignalRule => T1_SIGNAL_RULES.find((r) => r.code === code)!;
const signalsOf = (facts: CustomerFacts, rules = T1_SIGNAL_RULES) => extractSignals(toEvents(facts), rules, facts.asOf);
const app = (id: string, day: string, eventType: string, sourceRow: number | null, detail: Record<string, unknown> = {}) =>
  ({ id, occurredAt: `${day}T12:00:00+00:00`, channel: "kbc_mobile", eventType, sourceRow, detail });
const tx = (id: string, bookedOn: string, amount: number, category: string, counterparty = "X") =>
  ({ id, bookedOn, amount, category, counterparty });
const salaries = (months: string[], amount = 3000) => months.map((m, i) => tx(`sal${i}`, `${m}-26`, amount, "salary", "Employer NV"));

describe("signal rules seed", () => {
  it("declares exactly one rule per SignalCode", () => {
    expect(T1_SIGNAL_RULES.map((r) => r.code).sort()).toEqual([...SIGNAL_CODES].sort());
  });
});

describe("saturation and decay", () => {
  it("has diminishing returns and a half-life", () => {
    expect(saturation(0)).toBe(0);
    expect(saturation(1)).toBe(0.5);
    expect(saturation(3)).toBe(0.875);
    expect(decay(30, 30)).toBe(0.5);
    expect(decay(-5, 30)).toBe(1);
  });
});

describe("extractSignals: event rules", () => {
  it("computes strength = strength × saturation × decay, value = max simulation amount", () => {
    const facts = makeFacts({ appEvents: [app("1", "2026-09-01", "simulation", 2, { amount: 250000 }),
                                          app("2", "2026-09-16", "simulation", 2, { amount: 310000 })] });
    const s = signalsOf(facts).find((x) => x.code === "MORTGAGE_SIMULATION")!;
    const age = 15 - 0.5; // 2026-09-16T12:00 → 2026-10-01T00:00
    expect(s).toMatchObject({ count: 2, value: 310000, evidence: ["app:1", "app:2"], isDisruption: false, customerId: 42 });
    expect(s.strength).toBeCloseTo(0.45 * 0.75 * 0.5 ** (age / 45), 4);
  });

  it("only counts events inside the window, on the right catalogue rows, never in the future", () => {
    const facts = makeFacts({ appEvents: [app("1", "2026-03-01", "page_view", 18), app("2", "2026-09-20", "page_view", 99),
                                          app("3", "2026-10-05", "page_view", 18)] });
    expect(signalsOf(facts).find((x) => x.code === "HOUSING_BUDGET_VIEW")).toBeUndefined();
  });

  it("matches Kate questions by keyword, case-insensitively", () => {
    const facts = makeFacts({ appEvents: [app("1", "2026-09-24", "kate_question", null, { question: "Can I combine a Home Loan with a renovation loan?" }),
                                          app("2", "2026-09-25", "kate_question", null, { question: "Block my debit card" })] });
    const s = signalsOf(facts).find((x) => x.code === "HOME_LOAN_KATE_QUESTION")!;
    expect(s.evidence).toEqual(["app:1"]);
  });

  it("applies the detail condition (equipment ≥ €800)", () => {
    const facts = makeFacts({ transactions: [tx("1", "2026-09-10", -1450, "electronics", "Coolblue"), tx("2", "2026-09-12", -60, "electronics")] });
    const s = signalsOf(facts).find((x) => x.code === "EQUIPMENT_PURCHASE")!;
    expect(s).toMatchObject({ count: 1, value: 1450, evidence: ["tx:1"] });
  });

  it("reads profile events: car loan ending, child born", () => {
    const facts = makeFacts({ loans: [{ kind: "car", monthlyPayment: 450, outstanding: 1800, status: "active", sourceRow: 25 }],
                              children: [{ birthDate: "2026-08-10" }, { birthDate: "2019-01-01" }] });
    const codes = signalsOf(facts);
    expect(codes.find((x) => x.code === "CAR_LOAN_ENDING")).toMatchObject({ value: 4 });
    expect(codes.find((x) => x.code === "CHILD_BORN")).toMatchObject({ count: 1, value: 1 });
  });
});

describe("extractSignals: patterns", () => {
  const months = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"];
  const savings = (amounts: number[]) =>
    amounts.map((a, i) => tx(`sv${i}`, `${months[i]}-27`, -a, "savings_transfer", "Own savings account"));

  it("SAVING_FOR_DOWN_PAYMENT when monthly saving grows ≥ 20%", () => {
    const up = signalsOf(makeFacts({ transactions: savings([217, 217, 217, 217, 315, 315]) }));
    expect(up.find((x) => x.code === "SAVING_FOR_DOWN_PAYMENT")).toMatchObject({ count: 2, value: 315 });
    const flat = signalsOf(makeFacts({ transactions: savings([217, 217, 217, 217, 217, 217]) }));
    expect(flat.find((x) => x.code === "SAVING_FOR_DOWN_PAYMENT")).toBeUndefined();
  });

  it("ignores the savings-account leg of a transfer", () => {
    const legs = [...savings([200, 200, 200, 200, 400, 400]),
                  ...months.map((m, i) => tx(`in${i}`, `${m}-27`, 400, "savings_transfer", "Own current account"))];
    expect(signalsOf(makeFacts({ transactions: legs })).find((x) => x.code === "SAVING_FOR_DOWN_PAYMENT")).toMatchObject({ value: 400 });
  });

  it("FREELANCE_INCOME needs ≥ 2 payments from ≥ 2 clients", () => {
    const one = signalsOf(makeFacts({ transactions: [tx("1", "2026-08-20", 900, "freelance_income", "Brabo NV"), tx("2", "2026-09-20", 900, "freelance_income", "Brabo NV")] }));
    expect(one.find((x) => x.code === "FREELANCE_INCOME")).toBeUndefined();
    const two = signalsOf(makeFacts({ transactions: [tx("1", "2026-08-20", 900, "freelance_income", "Brabo NV"), tx("2", "2026-09-20", 1500, "freelance_income", "Duin BV")] }));
    expect(two.find((x) => x.code === "FREELANCE_INCOME")).toMatchObject({ count: 2, value: 800 });
  });

  it("SALARY_STOPPED without INCOME_DROP when freelance income replaces the salary", () => {
    const facts = makeFacts({ transactions: [...salaries(months.slice(0, 5)), tx("f1", "2026-09-02", 1700, "freelance_income", "A"),
                                             tx("f2", "2026-09-15", 1600, "freelance_income", "B")] });
    const codes = signalsOf(facts).map((s) => s.code);
    expect(codes).toContain("SALARY_STOPPED");
    expect(codes).not.toContain("INCOME_DROP");
  });

  it("INCOME_DROP (disruption) when the salary stops and only benefits come in", () => {
    const benefits: Event = { id: "inj:benefits", customerId: 42, at: "2026-09-28", source: "transaction", kind: "tx:benefits",
      detail: { amount: 1800, inflow: 1800, outflow: 0, counterparty: "RVA/ONEM", category: "benefits" } };
    const facts = makeFacts({ transactions: salaries(months.slice(0, 5)), injectedEvents: [benefits] });
    const s = signalsOf(facts);
    expect(s.find((x) => x.code === "INCOME_DROP")).toMatchObject({ isDisruption: true, value: 1800 });
    expect(s.find((x) => x.code === "BENEFITS_INFLOW")).toMatchObject({ isDisruption: true, evidence: ["inj:benefits"] });
  });

  it("no salary signal while the salary keeps arriving, nor for irregular salaries", () => {
    expect(signalsOf(makeFacts({ transactions: salaries(months) })).map((s) => s.code)).not.toContain("SALARY_STOPPED");
    const irregular = makeFacts({ transactions: salaries(["2026-04", "2026-06", "2026-08"]) });
    expect(signalsOf(irregular).map((s) => s.code)).not.toContain("SALARY_STOPPED");
  });

  it("child benefits are not a BENEFITS_INFLOW disruption", () => {
    const facts = makeFacts({ transactions: [tx("1", "2026-09-08", 175, "benefits", "Fons")] });
    expect(signalsOf(facts).map((s) => s.code)).not.toContain("BENEFITS_INFLOW");
  });
});

describe("extractSignals: injected partner events", () => {
  it("detects cost overruns above 10% and partner delays", () => {
    const injected: Event[] = [
      { id: "inj:q", customerId: 42, at: AS_OF, source: "partner", kind: "partner:quote_received", detail: { overrunPct: 40, overrunEur: 4800 } },
      { id: "inj:d", customerId: 42, at: AS_OF, source: "partner", kind: "partner:delayed", detail: { delayDays: 60 } },
    ];
    const s = signalsOf(makeFacts({ injectedEvents: injected }));
    expect(s.find((x) => x.code === "COST_OVERRUN")).toMatchObject({ value: 4800, isDisruption: true });
    expect(s.find((x) => x.code === "PARTNER_DELAY")).toMatchObject({ value: 60, isDisruption: true });
    expect(rule("COST_OVERRUN").strength).toBe(0.9);
  });
});

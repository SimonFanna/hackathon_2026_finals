import { describe, expect, it } from "vitest";
import { makeFacts } from "../fixtures/t1-helpers";
import type { Signal } from "../types";
import { buildContext } from "./context";

const drop: Signal = { code: "INCOME_DROP", customerId: 42, strength: 0.8, at: "2026-09-28", count: 4, value: 1800, evidence: [], isDisruption: true };

describe("buildContext", () => {
  const facts = makeFacts({
    customer: { id: 42, slug: null, firstName: "An", birthDate: "1994-02-15", region: "flanders", maritalStatus: "cohabiting", segment: "private", language: "nl" },
    children: [{ birthDate: "2023-05-28" }, { birthDate: "2026-07-01" }],
    accounts: [{ kind: "current", balance: 2300, sourceRow: 142 }, { kind: "savings", balance: 30000, sourceRow: 74 },
               { kind: "term_deposit", balance: 5000, sourceRow: 78 }],
    loans: [{ kind: "car", monthlyPayment: 450, outstanding: 9000, status: "active", sourceRow: 25 },
            { kind: "personal", monthlyPayment: 200, outstanding: 0, status: "repaid", sourceRow: 151 }],
    holdings: [{ sourceRow: 147, status: "active" }, { sourceRow: 8, status: "cancelled" }],
    properties: [{ kind: "house", buildYear: 1975, epcLabel: "E", estimatedValue: 310000 }],
  });

  it("derives the stable attributes", () => {
    const ctx = buildContext(facts, []);
    expect(ctx).toMatchObject({
      customerId: 42, firstName: "An", age: 32, household: "couple", children: 2, youngestChildAgeMonths: 3,
      employment: "employee", monthlyIncome: 3000, housing: "tenant", monthlyRent: 900,
      savings: 35000, monthlyDebt: 450, debtRatio: 0.15, heldSourceRows: [25, 74, 78, 142, 147],
      properties: [{ kind: "house", buildYear: 1975, epc: "E", value: 310000 }], cashflowPressure: "low",
    });
  });

  it("raises cashflow pressure with debt, missing buffer or an income drop", () => {
    const heavy = makeFacts({ loans: [{ kind: "home", monthlyPayment: 1100, outstanding: 200000, status: "active", sourceRow: 2 }] });
    expect(buildContext(heavy, []).cashflowPressure).toBe("medium");          // 1100 / 3000 = 0.37
    const broke = makeFacts({ accounts: [{ kind: "current", balance: 400, sourceRow: 142 }, { kind: "savings", balance: 900, sourceRow: 74 }] });
    expect(buildContext(broke, []).cashflowPressure).toBe("high");
    const crushing = { kind: "home", monthlyPayment: 1500, outstanding: 250000, status: "active" as const, sourceRow: 2 };
    const thin = makeFacts({ loans: [crushing], accounts: [{ kind: "current", balance: 2500, sourceRow: 142 },
                                                           { kind: "savings", balance: 5000, sourceRow: 74 }] });
    expect(buildContext(thin, []).cashflowPressure).toBe("high");                                       // 0.5, €5k saved
    const cushioned = makeFacts({ loans: [crushing], accounts: [{ kind: "current", balance: 3000, sourceRow: 142 },
                                                                { kind: "savings", balance: 36000, sourceRow: 74 }] });
    expect(buildContext(cushioned, []).cashflowPressure).toBe("medium");                                 // 0.5, €36k saved
    const dropped = buildContext(facts, [drop]);
    expect(dropped).toMatchObject({ monthlyIncome: 1800, debtRatio: 0.25, cashflowPressure: "high" });
  });

  it("handles a customer without income", () => {
    const ctx = buildContext(makeFacts({ employment: { status: "student", monthlyNetIncome: 0, since: "2024-09-01" } }), []);
    expect(ctx.debtRatio).toBe(0);
  });
});

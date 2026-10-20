import { describe, expect, it } from "vitest";
import { makeFacts } from "../fixtures/t1-helpers";
import { ageDays, monthsBetween, toEvents } from "./events";

describe("toEvents", () => {
  const facts = makeFacts({
    appEvents: [{ id: "7", occurredAt: "2026-09-05T10:00:00+00:00", channel: "kbc_mobile", eventType: "simulation",
                  sourceRow: 2, detail: { amount: 250000 } }],
    transactions: [{ id: "9", bookedOn: "2026-09-03", amount: -120.5, category: "groceries", counterparty: "Colruyt" }],
    loans: [{ kind: "car", monthlyPayment: 500, outstanding: 2400, status: "active", sourceRow: 25 },
            { kind: "personal", monthlyPayment: 100, outstanding: 0, status: "repaid", sourceRow: 151 }],
    children: [{ birthDate: "2026-07-20" }],
    injectedEvents: [{ id: "inj:1", customerId: 42, at: "2026-09-30", source: "partner", kind: "partner:delayed", detail: { delayDays: 60 } }],
  });
  const events = toEvents(facts);
  const byId = Object.fromEntries(events.map((e) => [e.id, e]));

  it("normalises an app event", () => {
    expect(byId["app:7"]).toMatchObject({ source: "app", kind: "simulation", sourceRow: 2, customerId: 42,
                                          detail: { amount: 250000, channel: "kbc_mobile" } });
  });

  it("normalises a transaction with outflow and income multiple", () => {
    expect(byId["tx:9"]).toMatchObject({ source: "transaction", kind: "tx:groceries", at: "2026-09-03",
                                         detail: { amount: -120.5, outflow: 120.5, inflow: 0, counterparty: "Colruyt", incomeMultiple: 0.04 } });
  });

  it("emits profile events for active loans and children", () => {
    expect(byId["profile:loan:0"]).toMatchObject({ kind: "profile:loan", at: "2026-10-01", sourceRow: 25,
                                                   detail: { loanKind: "car", monthsLeft: 5 } });
    expect(byId["profile:loan:1"]).toBeUndefined(); // repaid
    expect(byId["profile:child:0"]).toMatchObject({ kind: "profile:child", at: "2026-07-20", detail: { ageMonths: 2 } });
    expect(byId["profile:employment"]).toMatchObject({ detail: { status: "employee", monthlyNetIncome: 3000 } });
  });

  it("appends injected events as is, and sorts everything by date", () => {
    expect(byId["inj:1"]).toEqual(facts.injectedEvents[0]);
    const dates = events.map((e) => e.at);
    expect([...dates].sort()).toEqual(dates);
  });

  it("is deterministic", () => {
    expect(toEvents(facts)).toEqual(events);
  });
});

describe("date helpers", () => {
  it("counts whole months and days", () => {
    expect(monthsBetween("1994-02-15", "2026-10-01")).toBe(391);
    expect(monthsBetween("2026-09-15", "2026-10-01")).toBe(0);
    expect(ageDays("2026-09-21", "2026-10-01")).toBe(10);
  });
});

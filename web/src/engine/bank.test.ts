import { describe, expect, it } from "vitest";
import { mapBankProfile, type BankCustomerRow, type BankEventRow } from "./bank";
import { buildJourney, detectIntents } from "./engine";

const row: BankCustomerRow = {
  id: 7, first_name: "Ann", birth_date: "1990-11-01", city: "Leuven", marital_status: "married",
  customer_children: [{ count: 2 }],
};

const ev = (event_type: string, item: string | null, occurred_at: string, detail: Record<string, unknown> = {}, channel = "kbc_mobile"): BankEventRow =>
  ({ event_type, channel, occurred_at, detail, ecosystem_items: item ? { name: item } : null });

describe("mapBankProfile", () => {
  it("maps the customer row, computing age on the given day", () => {
    const { customer } = mapBankProfile(row, [], "2026-10-20");
    expect(customer).toEqual({ id: "7", name: "Ann", age: 35, city: "Leuven", household: "Couple, 2 children" });
  });

  it("turns home-loan simulations into one signal carrying the latest amount", () => {
    const { signals } = mapBankProfile(row, [
      ev("simulation", "Home loan", "2026-08-24T12:00:00Z", { amount: 255000 }, "kbc_touch"),
      ev("simulation", "Home loan", "2026-09-11T08:00:00Z", { amount: 251000 }),
    ], "2026-10-20");
    expect(signals).toEqual([{
      id: "7-mortgage_simulation", customerId: "7", type: "mortgage_simulation",
      label: "Ran 2 home loan simulations, the latest for €251k", source: "KBC Mobile · KBC Touch",
      observedAt: "2026-09-11", amountEur: 251000,
    }]);
  });

  it("reads property valuations and renovation interest, and ignores unrelated events", () => {
    const { signals } = mapBankProfile(row, [
      ev("page_view", "Indicative online property valuation", "2026-09-21T10:00:00Z"),
      ev("page_view", "Indicative online property valuation", "2026-09-25T10:00:00Z"),
      ev("page_view", "Estimate renovation costs and grants", "2026-09-26T10:00:00Z"),
      ev("kate_question", null, "2026-09-24T10:00:00Z", { question: "Can I combine a home loan with a renovation loan?" }, "kate"),
      ev("kate_question", "Make transfers via Kate", "2026-05-20T10:00:00Z", { question: "Transfer 50 euros to my savings account" }, "kate"),
      ev("page_view", "Home insurance", "2026-09-07T10:00:00Z"),
    ], "2026-10-20");
    expect(signals.map((s) => [s.type, s.label])).toEqual([
      ["property_search", "Checked an online property valuation 2 times"],
      ["renovation_research", "Looked at renovation costs and grants"],
      ["renovation_research", "Asked Kate: “Can I combine a home loan with a renovation loan?”"],
    ]);
  });

  it("feeds the engine: the loan amount personalises the budget step", () => {
    const { customer, signals } = mapBankProfile(row, [
      ev("simulation", "Home loan", "2026-09-11T08:00:00Z", { amount: 251000 }),
    ], "2026-10-20");
    const [intent] = detectIntents(customer, signals);
    expect(intent.confidence).toBeCloseTo(0.4, 2);
    const budget = buildJourney("buy_house", customer, signals).steps.find((s) => s.id === "budget");
    expect(budget?.why).toContain("€251k");
  });
});

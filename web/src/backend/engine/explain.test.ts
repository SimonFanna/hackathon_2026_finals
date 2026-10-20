import { describe, expect, it } from "vitest";
import type { ActiveMoment, Decision } from "../types";
import { describeSignal, explainMoment, explainNoAction, formatEur } from "./explain";

describe("explain", () => {
  it("formats euros", () => {
    expect(formatEur(476000)).toBe("€476k");
    expect(formatEur(1200)).toBe("€1,200");
    expect(formatEur(950)).toBe("€950");
  });

  it("describes a signal with its count and value, with fallbacks", () => {
    expect(describeSignal({ code: "MORTGAGE_SIMULATION", count: 4, value: 476000 })).toBe("You ran 4 home-loan simulations (up to €476k)");
    expect(describeSignal({ code: "MORTGAGE_SIMULATION", count: 1 })).toBe("You ran 1 home-loan simulation");
    expect(describeSignal({ code: "PROPERTY_VALUATION_VIEW", count: 3 })).toBe("You looked up property values (3 times)");
  });

  it("explainMoment: strongest positive contributions first, no duplicates", () => {
    const m: ActiveMoment = {
      type: "HOME_BUYING", confidence: 0.8, evidence: ["MORTGAGE_SIMULATION"], since: "2026-09-01", expiresAt: "2027-03-01", source: "rules",
      contributions: [
        { feature: "a", value: 0.1, weight: 3, label: "small" },
        { feature: "b", value: 0.3, weight: 6, label: "big" },
        { feature: "c", value: 0.5, weight: -2, label: "negative" },
        { feature: "d", value: 0.3, weight: 6, label: "big" },
      ],
    };
    expect(explainMoment(m)).toEqual(["big", "small"]);
    expect(explainMoment({ ...m, contributions: [] })).toEqual(["You ran 1 home-loan simulation"]);
  });

  it("explainNoAction: the decision's own explanation, a default per reason, nothing for speakers", () => {
    const d: Decision = { intent: "BUY_HOME", level: "NO_ACTION", reason: "below_threshold", explanation: [] };
    expect(explainNoAction(d)).toEqual(["The signals are too weak to bother you."]);
    expect(explainNoAction({ ...d, explanation: ["custom"] })).toEqual(["custom"]);
    expect(explainNoAction({ ...d, level: "ASK", reason: "ask" })).toEqual([]);
  });
});

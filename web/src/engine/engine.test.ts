import { describe, expect, it } from "vitest";
import {
  buildJourney, decide, demoCustomer, demoSignals, detectIntents, initState, scoreboard, setConsent,
} from "./index";

describe("detectIntents", () => {
  it("detects buy_house from demo signals and asks for confirmation below threshold", () => {
    const [intent] = detectIntents(demoCustomer, demoSignals);
    expect(intent.intentId).toBe("buy_house");
    expect(intent.confidence).toBeCloseTo(0.69, 2);
    expect(intent.needsConfirmation).toBe(true);
    expect(intent.reasons).toHaveLength(3);
  });

  it("is confident without confirmation once a notary contact is observed", () => {
    const signals = [...demoSignals, { ...demoSignals[0], id: "s4", type: "notary_contact" as const }];
    const [intent] = detectIntents(demoCustomer, signals);
    expect(intent.needsConfirmation).toBe(false);
  });

  it("ignores other customers' signals", () => {
    expect(detectIntents({ ...demoCustomer, id: "other" }, demoSignals)).toEqual([]);
  });
});

describe("journey state", () => {
  const journey = buildJourney("buy_house", demoCustomer);

  it("builds an ordered 11-step journey with every consent off", () => {
    expect(journey.steps.map((s) => s.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    const st = initState(journey);
    expect(Object.values(st.decisions).every((d) => d === "pending")).toBe(true);
    expect(Object.values(st.consents).flatMap(Object.values).some(Boolean)).toBe(false);
  });

  it("is immutable", () => {
    const st = initState(journey);
    decide(st, "home-loan", "accepted");
    setConsent(st, "grants", "EPC label", true);
    expect(st.decisions["home-loan"]).toBe("pending");
    expect(st.consents.grants["EPC label"]).toBe(false);
  });

  it("rejects unknown steps and fields", () => {
    const st = initState(journey);
    expect(() => decide(st, "nope", "accepted")).toThrow();
    expect(() => setConsent(st, "grants", "nope", true)).toThrow();
  });
});

describe("scoreboard", () => {
  const journey = buildJourney("buy_house", demoCustomer);

  it("counts only accepted steps", () => {
    let st = initState(journey);
    st = decide(st, "home-loan", "accepted");
    st = decide(st, "energy-loan", "skipped");
    const b = scoreboard(st);
    expect(b.kbc).toEqual({ productsActivated: 1, revenueEur: 9000 });
  });

  it("gives a partner a lead only with consent", () => {
    let st = decide(initState(journey), "insulation", "accepted");
    expect(scoreboard(st).partners.leads).toBe(0);
    expect(scoreboard(st).customer.co2KgPerYear).toBe(1200);
    st = setConsent(st, "insulation", "EPC label", true);
    expect(scoreboard(st).partners).toEqual({ leads: 1, valueEur: 300 });
  });
});

describe("chapters and euros", () => {
  const journey = buildJourney("buy_house", demoCustomer);

  it("groups steps into chapters in path order", () => {
    const chapters = [...new Set(journey.steps.map((s) => s.chapter))];
    expect(chapters).toEqual(["find", "finance", "renovate", "protect"]);
  });

  it("keeps one-off and yearly customer euros apart", () => {
    let st = initState(journey);
    st = decide(st, "grants", "accepted");
    st = decide(st, "insulation", "accepted");
    expect(scoreboard(st).customer).toMatchObject({ eurOneOff: 8000, eurPerYear: 900 });
  });
});

describe("decision levels", () => {
  const one = (type: (typeof demoSignals)[number]["type"]) => [{ ...demoSignals[0], type }];

  it("does nothing on weak evidence", () => {
    const [intent] = detectIntents(demoCustomer, one("savings_transfer"));
    expect(intent.level).toBe("none");
  });

  it("asks on medium evidence (demo case)", () => {
    expect(detectIntents(demoCustomer, demoSignals)[0].level).toBe("ask");
  });

  it("suggests proactively on strong evidence", () => {
    const signals = [...demoSignals, { ...demoSignals[0], id: "s4", type: "notary_contact" as const }];
    expect(detectIntents(demoCustomer, signals)[0].level).toBe("suggest");
  });
});

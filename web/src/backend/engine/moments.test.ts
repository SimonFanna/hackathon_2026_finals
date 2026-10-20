import { describe, expect, it } from "vitest";
import * as F from "../fixtures/t3-inputs";
import type { Prediction } from "../types";
import { detectMoments, type MomentModel } from "./moments";

const moment = (ms: ReturnType<typeof detectMoments>, type: string) => ms.find((m) => m.type === type);

describe("detectMoments (rules fallback)", () => {
  it("Sofie: HOME_BUYING ≥ 0.6 with the simulations as top evidence", () => {
    const ms = detectMoments(F.sofieSignals, F.sofieCtx, F.t3Rules, F.ASOF);
    const home = moment(ms, "HOME_BUYING")!;
    expect(home.confidence).toBeGreaterThanOrEqual(0.6);
    expect(home.source).toBe("rules");
    expect(home.evidence[0]).toBe("MORTGAGE_SIMULATION");
    expect(home.contributions.map((c) => c.label)).toContain("You ran 4 home-loan simulations (up to €476k)");
    expect(home.since).toBe("2026-09-09");
    expect(home.expiresAt).toBe("2027-03-08");
    expect(ms[0].type).toBe("HOME_BUYING"); // sorted by confidence
  });

  it("Lucas: STARTING_BUSINESS is his strongest moment", () => {
    const ms = detectMoments(F.lucasSignals, F.lucasCtx, F.t3Rules, F.ASOF);
    expect(ms[0].type).toBe("STARTING_BUSINESS");
    expect(ms[0].confidence).toBeGreaterThan(0.85);
  });

  it("Els: no life moment, only the cashflow brake (high debt ratio, from context alone)", () => {
    const ms = detectMoments(F.elsSignals, F.elsCtx, F.t3Rules, F.ASOF);
    expect(ms.map((m) => m.type)).toEqual(["CASHFLOW_PRESSURE"]);
    expect(ms[0].evidence).toEqual([]);
  });

  it("Thomas (hard negative): HOME_BUYING clearly below Sofie", () => {
    const thomas = moment(detectMoments(F.thomasSignals, F.thomasCtx, F.t3Rules, F.ASOF), "HOME_BUYING");
    const sofie = moment(detectMoments(F.sofieSignals, F.sofieCtx, F.t3Rules, F.ASOF), "HOME_BUYING")!;
    expect(thomas?.confidence ?? 0).toBeLessThan(0.4);
    expect(sofie.confidence - (thomas?.confidence ?? 0)).toBeGreaterThan(0.4);
  });

  it("context gate: RETIREMENT_PREP needs age ≥ 45", () => {
    expect(moment(detectMoments(F.pieterSignals, F.pieterCtx, F.t3Rules, F.ASOF), "RETIREMENT_PREP")).toBeDefined();
    expect(moment(detectMoments(F.pieterSignals, { ...F.pieterCtx, age: 40 }, F.t3Rules, F.ASOF), "RETIREMENT_PREP")).toBeUndefined();
  });

  it("INCOME_DROP opens CASHFLOW_PRESSURE", () => {
    const cp = moment(detectMoments(F.sofieIncomeDropSignals, F.sofieIncomeDropCtx, F.t3Rules, F.ASOF), "CASHFLOW_PRESSURE")!;
    expect(cp.confidence).toBeGreaterThan(0.9);
    expect(cp.evidence).toContain("INCOME_DROP");
  });

  it("drops expired moments and moments without any signal", () => {
    expect(detectMoments(F.sofieSignals, F.sofieCtx, F.t3Rules, "2027-06-01").find((m) => m.type === "HOME_BUYING")).toBeUndefined();
    expect(detectMoments([], F.sofieCtx, F.t3Rules, F.ASOF)).toEqual([]);
  });

  it("is deterministic", () => {
    expect(detectMoments(F.sofieSignals, F.sofieCtx, F.t3Rules, F.ASOF)).toEqual(detectMoments(F.sofieSignals, F.sofieCtx, F.t3Rules, F.ASOF));
  });
});

describe("detectMoments (ml path)", () => {
  const model: MomentModel = {
    features: (signals) => Object.fromEntries(signals.map((s) => [`sig_${s.code}`, s.strength])),
    predict: (m, x): Prediction | null =>
      m === "HOME_BUYING"
        ? { confidence: 0.91, modelVersion: "test", contributions: [{ feature: "sig_MORTGAGE_SIMULATION", value: x.sig_MORTGAGE_SIMULATION, weight: 4, label: "raw" }] }
        : null,
  };

  it("uses T2's prediction when there is one, and relabels its contributions", () => {
    const ms = detectMoments(F.sofieSignals, F.sofieCtx, F.t3Rules, F.ASOF, model);
    const home = moment(ms, "HOME_BUYING")!;
    expect(home.source).toBe("ml");
    expect(home.confidence).toBe(0.91);
    expect(home.contributions[0].label).toBe("You ran 4 home-loan simulations (up to €476k)");
    expect(home.evidence[0]).toBe("MORTGAGE_SIMULATION");
  });

  it("falls back to rules for moments the model has no weights for", () => {
    const ms = detectMoments(F.sofieSignals, F.sofieCtx, F.t3Rules, F.ASOF, model);
    expect(moment(ms, "NEW_PARENT")?.source).toBe("rules");
  });
});

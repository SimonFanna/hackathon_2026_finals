import { describe, expect, it } from "vitest";
import { t1SofieContext, t1SofieSignals } from "../fixtures/t1-sofie";
import { T1_SIGNAL_RULES, demoFactsFor } from "../fixtures/t1-helpers";
import type { ModelWeight, MomentCode } from "../types";
import { MOMENT_CODES } from "../vocabulary";
import { buildContext } from "./context";
import { toEvents } from "./events";
import { FEATURE_NAMES, features } from "./features";
import metrics from "./model-metrics.json";
import { momentModel, predict } from "./model";
import { extractSignals } from "./signals";
import trained from "./weights.json";

const WEIGHTS = trained as ModelWeight[];
const ML_MOMENTS = MOMENT_CODES.filter((m) => m !== "CASHFLOW_PRESSURE");

function scores(slug: string): Record<string, ReturnType<typeof predict>> {
  const facts = demoFactsFor(slug);
  const signals = extractSignals(toEvents(facts), T1_SIGNAL_RULES, facts.asOf);
  const x = features(signals, buildContext(facts, signals));
  return Object.fromEntries(ML_MOMENTS.map((m) => [m, predict(m, x, WEIGHTS)]));
}

describe("features", () => {
  it("has stable keys in the canonical order, no NaN, same output for the same input", () => {
    const x = features(t1SofieSignals, t1SofieContext);
    expect(Object.keys(x)).toEqual(FEATURE_NAMES);
    expect(Object.values(x).every(Number.isFinite)).toBe(true);
    expect(features(t1SofieSignals, t1SofieContext)).toEqual(x);
    expect(x.sig_MORTGAGE_SIMULATION).toBe(0.31);
    expect(x.cnt_MORTGAGE_SIMULATION).toBeCloseTo(Math.log1p(4), 10);
    expect(x).toMatchObject({ is_tenant: 1, is_owner: 0, household_couple: 1, age_25_34: 1, emp_employee: 1, sig_NOTARY_PAYMENT: 0 });
  });
});

describe("predict", () => {
  const w = (feature: string, weight: number): ModelWeight => ({ modelVersion: "t", moment: "HOME_BUYING", feature, weight });

  it("is a sigmoid of bias + Σ w·x, with positive contributions sorted and labelled", () => {
    const p = predict("HOME_BUYING", { a: 1, b: 2, c: 1 }, [w("__bias__", -1), w("a", 0.5), w("b", 1), w("c", -2)])!;
    expect(p.confidence).toBeCloseTo(1 / (1 + Math.exp(-(-1 + 0.5 + 2 - 2))), 4);
    expect(p.contributions.map((c) => c.feature)).toEqual(["b", "a"]);
    expect(p.modelVersion).toBe("t");
  });

  it("returns null without weights for the moment, and uses the latest model version", () => {
    expect(predict("NEW_PARENT", {}, [w("__bias__", 1)])).toBeNull();
    const versions: ModelWeight[] = [{ modelVersion: "a-old", moment: "HOME_BUYING", feature: "__bias__", weight: -5 },
                                     { modelVersion: "b-new", moment: "HOME_BUYING", feature: "__bias__", weight: 0 }];
    expect(predict("HOME_BUYING", {}, versions)).toMatchObject({ confidence: 0.5, modelVersion: "b-new" });
  });

  it("never claims certainty: confidence is capped at 0.95", () => {
    expect(predict("HOME_BUYING", { a: 1 }, [w("__bias__", 0), w("a", 50)])!.confidence).toBe(0.95);
  });

  it("keeps at most 5 contributions", () => {
    const ws = [w("__bias__", 0), ...["a", "b", "c", "d", "e", "f", "g"].map((f, i) => w(f, i + 1))];
    const p = predict("HOME_BUYING", { a: 1, b: 1, c: 1, d: 1, e: 1, f: 1, g: 1 }, ws)!;
    expect(p.contributions.map((c) => c.feature)).toEqual(["g", "f", "e", "d", "c"]);
  });

  it("is fast enough to score millions of customers (< 5 µs per call)", () => {
    const x = features(t1SofieSignals, t1SofieContext);
    const n = 50_000;
    const perCall: number[] = [];
    for (let run = 0; run < 5; run++) {                      // best of 5: robust to a busy test runner
      const t0 = performance.now();
      for (let i = 0; i < n; i++) predict(ML_MOMENTS[i % ML_MOMENTS.length], x, WEIGHTS);
      perCall.push(((performance.now() - t0) * 1000) / n);
    }
    expect(Math.min(...perCall)).toBeLessThan(5);
  });

  it("exposes the MomentModel T3 injects", () => {
    expect(momentModel.predict).toBe(predict);
    expect(momentModel.features).toBe(features);
  });
});

describe("trained model (weights.json) on the demo personas", () => {
  it("reports AUC and AP for every ML moment", () => {
    expect(metrics.map((m) => m.moment).sort()).toEqual([...ML_MOMENTS].sort());
    for (const m of metrics) expect(m.auc).toBeGreaterThan(0.8);
  });

  it("Sofie: HOME_BUYING ≥ 0.6 with her mortgage simulations among the top contributions", () => {
    const p = scores("sofie").HOME_BUYING!;
    expect(p.confidence).toBeGreaterThanOrEqual(0.6);
    expect(p.contributions.map((c) => c.feature).some((f) => f.endsWith("MORTGAGE_SIMULATION"))).toBe(true);
  });

  it("each moment persona is recognised by its own model", () => {
    const expected: [string, MomentCode][] = [["lucas", "STARTING_BUSINESS"], ["nadia", "NEW_PARENT"], ["pieter", "EV_PURCHASE"]];
    for (const [slug, moment] of expected) expect(scores(slug)[moment]!.confidence, slug).toBeGreaterThanOrEqual(0.5);
  });

  it("Thomas (hard negative) is clearly below Sofie; Els is below 0.3 everywhere", () => {
    expect(scores("thomas").HOME_BUYING!.confidence).toBeLessThan(scores("sofie").HOME_BUYING!.confidence - 0.3);
    for (const [moment, p] of Object.entries(scores("els"))) expect(p!.confidence, moment).toBeLessThan(0.3);
  });
});

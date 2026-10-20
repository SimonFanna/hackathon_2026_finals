import { describe, expect, it } from "vitest";
import { t1SofieContext, t1SofieSignals, T1_SOFIE_AS_OF } from "../fixtures/t1-sofie";
import { t3Rules } from "../fixtures/t3-inputs";
import type { ModelWeight, Prediction, RuleSet } from "../types";
import { decide } from "./decision";
import { deriveIntents } from "./intents";
import { detectMoments, type MomentModel } from "./moments";
import weights from "./weights.json";

// T3 on T1's real Sofie output (not T3's own estimates), on both paths.
// The model below is a stand-in for T2's predict() over weights.json until model.ts lands.
const standInModel: MomentModel = {
  features: (signals, ctx) => ({
    ...Object.fromEntries(signals.map((s) => [`sig_${s.code}`, s.strength])),
    is_tenant: ctx.housing === "tenant" ? 1 : 0,
    is_owner: ctx.housing === "owner" ? 1 : 0,
  }),
  predict: (moment, x, ws): Prediction | null => {
    const mine = ws.filter((w) => w.moment === moment);
    if (mine.length === 0) return null;
    const terms = mine.filter((w) => w.feature !== "__bias__").map((w) => ({ feature: w.feature, value: x[w.feature] ?? 0, weight: w.weight, label: w.feature }));
    const z = (mine.find((w) => w.feature === "__bias__")?.weight ?? 0) + terms.reduce((a, t) => a + t.value * t.weight, 0);
    return { confidence: 1 / (1 + Math.exp(-z)), contributions: terms.filter((t) => t.value * t.weight > 0), modelVersion: mine[0].modelVersion };
  },
};

function run(rules: RuleSet, model?: MomentModel) {
  const moments = detectMoments(t1SofieSignals, t1SofieContext, rules, T1_SOFIE_AS_OF, model);
  const intents = deriveIntents(moments, t1SofieContext, rules);
  return { moments, decisions: decide(intents, moments, t1SofieContext, [], [], rules, T1_SOFIE_AS_OF) };
}

describe("T3 on T1's Sofie fixture", () => {
  it.each([
    ["rules", t3Rules, undefined],
    ["ml (weights.json)", { ...t3Rules, modelWeights: weights as ModelWeight[] }, standInModel],
  ] as const)("%s: HOME_BUYING ≥ 0.6 and BUY_HOME at ASK/SUGGEST, explained by the simulations", (_name, rules, model) => {
    const { moments, decisions } = run(rules, model);
    const home = moments.find((m) => m.type === "HOME_BUYING")!;
    expect(home.confidence).toBeGreaterThanOrEqual(0.6);
    expect(home.source).toBe(model ? "ml" : "rules");
    const d = decisions[0];
    expect(d.intent).toBe("BUY_HOME");
    expect(["ASK", "SUGGEST"]).toContain(d.level);
    expect(d.explanation[1]).toBe("You ran 4 home-loan simulations (up to €476k)");
  });
});

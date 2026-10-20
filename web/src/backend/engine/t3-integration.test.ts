import { describe, expect, it } from "vitest";
import { t1SofieContext, t1SofieSignals, T1_SOFIE_AS_OF } from "../fixtures/t1-sofie";
import { t3Rules } from "../fixtures/t3-inputs";
import type { ModelWeight, RuleSet } from "../types";
import { decide } from "./decision";
import { deriveIntents } from "./intents";
import { momentModel } from "./model";
import { detectMoments, type MomentModel } from "./moments";
import weights from "./weights.json";

// T3 on T1's real Sofie output (not T3's own estimates), on both paths.
// The ml path uses T2's real model (engine/model.ts) over the trained weights.json.
function run(rules: RuleSet, model?: MomentModel) {
  const moments = detectMoments(t1SofieSignals, t1SofieContext, rules, T1_SOFIE_AS_OF, model);
  const intents = deriveIntents(moments, t1SofieContext, rules);
  return { moments, decisions: decide(intents, moments, t1SofieContext, [], [], rules, T1_SOFIE_AS_OF) };
}

describe("T3 on T1's Sofie fixture", () => {
  it.each([
    ["rules", t3Rules, undefined],
    ["ml (weights.json)", { ...t3Rules, modelWeights: weights as ModelWeight[] }, momentModel],
  ] as const)("%s: HOME_BUYING ≥ 0.6 and BUY_HOME at ASK/SUGGEST, explained by the simulations", (_name, rules, model) => {
    const { moments, decisions } = run(rules, model);
    const home = moments.find((m) => m.type === "HOME_BUYING")!;
    expect(home.confidence).toBeGreaterThanOrEqual(0.6);
    expect(home.source).toBe(model ? "ml" : "rules");
    const d = decisions[0];
    expect(d.intent).toBe("BUY_HOME");
    expect(["ASK", "SUGGEST"]).toContain(d.level);
    // The order of the reasons follows the weights (the trained model ranks the savings growth first).
    expect(d.explanation.slice(1, 4)).toContain("You ran 4 home-loan simulations (up to €476k)");
  });
});

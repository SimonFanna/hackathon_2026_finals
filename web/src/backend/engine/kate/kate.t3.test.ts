// Kate on the real T3 decision gate output (fixtures/t3-sofie-decision.ts).
import { describe, expect, it } from "vitest";
import { ASOF } from "../../fixtures/t3-inputs";
import { t3Intents } from "../../fixtures/t3-rules";
import { elsT3, lucasT3, proactive, sofieIncomeDropT3, sofieT3, thomasT3, type T3Output } from "../../fixtures/t3-sofie-decision";
import { kateForDecision } from "./messages";

function kate(o: T3Output) {
  const d = proactive(o);
  if (!d) return null;
  const intent = t3Intents.find((i) => i.code === d.intent)!;
  const moment = o.moments.find((m) => m.type === (d.moment ?? o.intents.find((i) => i.code === d.intent)?.moment))!;
  return kateForDecision(d, intent, o.ctx, moment, ASOF);
}

describe("Kate × T3 decisions", () => {
  it("Sofie gets a BUY_HOME message with no raw placeholder", () => {
    const m = kate(sofieT3)!;
    expect(m.refs.intent).toBe("BUY_HOME");
    expect(m.text).toContain("Hi Sofie");
    expect(m.text).not.toMatch(/\{\w+\}/);
  });
  it("Lucas gets a START_BUSINESS message", () => {
    expect(kate(lucasT3)!.refs.intent).toBe("START_BUSINESS");
  });
  it("Els, Thomas and Sofie-after-income-drop get no proactive message", () => {
    for (const o of [elsT3, thomasT3, sofieIncomeDropT3]) expect(kate(o)).toBeNull();
  });
});

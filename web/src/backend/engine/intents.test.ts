import { describe, expect, it } from "vitest";
import * as F from "../fixtures/t3-inputs";
import { deriveIntents } from "./intents";
import { detectMoments } from "./moments";

const intentsFor = (signals: typeof F.sofieSignals, ctx: typeof F.sofieCtx) =>
  deriveIntents(detectMoments(signals, ctx, F.t3Rules, F.ASOF), ctx, F.t3Rules);

describe("deriveIntents", () => {
  it("Sofie: one moment → several intents, BUY_HOME first", () => {
    const intents = intentsFor(F.sofieSignals, F.sofieCtx);
    expect(intents.map((i) => i.code).slice(0, 3)).toEqual(["BUY_HOME", "RENOVATE_HOME", "REDUCE_ENERGY_COST"]);
    expect(intents[0]).toMatchObject({ moment: "HOME_BUYING", goalType: "BUY_AND_PREPARE_HOME" });
  });

  it("confidence = moment × weight; renovation pages raise RENOVATE_HOME (0.7 instead of 0.5)", () => {
    const moments = detectMoments(F.sofieSignals, F.sofieCtx, F.t3Rules, F.ASOF);
    const home = moments.find((m) => m.type === "HOME_BUYING")!;
    const reno = deriveIntents(moments, F.sofieCtx, F.t3Rules).find((i) => i.code === "RENOVATE_HOME")!;
    expect(reno.confidence).toBeCloseTo(home.confidence * 0.7, 2);

    const noReno = { ...home, evidence: home.evidence.filter((e) => e !== "RENOVATION_VIEW") };
    expect(deriveIntents([noReno], F.sofieCtx, F.t3Rules).find((i) => i.code === "RENOVATE_HOME")!.confidence).toBeCloseTo(home.confidence * 0.5, 2);
  });

  it("Lucas → START_BUSINESS with its goal type; CASHFLOW_PRESSURE produces no intent", () => {
    expect(intentsFor(F.lucasSignals, F.lucasCtx)[0]).toMatchObject({ code: "START_BUSINESS", goalType: "START_BUSINESS" });
    expect(intentsFor(F.elsSignals, F.elsCtx)).toEqual([]);
  });
});

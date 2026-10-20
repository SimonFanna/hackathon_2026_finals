import { describe, expect, it } from "vitest";
import { getPersona } from "../../engine";
import { buildPainRun, chapterFor, frameFor, readEntry } from "./model";

describe("pain story counterfactual", () => {
  it("keeps the original plan through every hit and exposes the resulting broken limits", () => {
    const snapshots = buildPainRun();
    expect(snapshots.map((snapshot) => snapshot.health)).toEqual([100, 79, 69, 46, 22]);
    const last = snapshots.at(-1)!;
    expect(last.checks.filter((check) => !check.ok).map((check) => check.key)).toEqual(["cost", "monthly", "finish"]);
    expect(last.run.plan.values).toEqual({ cost: 401800, monthly: 1910, finish: 14, buffer: 19150 });
    expect(last.run.plan.limits.monthly).toBe(1450);
    expect(last.run.history.every((entry) => entry.optionId === "keep")).toBe(true);
  });

  it("recalculates when engine scenario data changes, without mutating the shared model", () => {
    const model = structuredClone(getPersona("house").outcome);
    model.disruptions[0].delta = { values: { monthly: 300 } };
    const snapshots = buildPainRun(model);
    expect(snapshots.at(-1)!.run.plan.values.monthly).toBe(2020);
    expect(model.baseline.values.monthly).toBe(1720);
    expect(getPersona("house").outcome.disruptions[0].delta.values?.monthly).toBe(190);
  });
});

describe("presentation entry points", () => {
  it("preserves all existing demo and player links", () => {
    for (const search of ["?intro=0", "?demo=step&n=6", "?demo=finale", "?demo=weak", "?player=business"]) expect(readEntry(search).skip).toBe(true);
    expect(readEntry("").skip).toBe(false);
  });
  it("opens every chapter and each setback directly, including a static slide state", () => {
    for (let scene = 1; scene <= 7; scene++) expect(chapterFor(readEntry(`?pain=${scene}`).frame)).toBe(scene - 1);
    expect(readEntry("?pain=5&hit=3&still=1")).toEqual({ skip: false, frame: 6, still: true });
    expect(readEntry("?pain=7&intro=0").skip).toBe(false);
    expect(readEntry("?pain=5&hit=999").frame).toBe(7);
    expect(readEntry("?pain=oops").frame).toBe(0);
    expect(frameFor(5, 1)).toBe(4);
  });
});

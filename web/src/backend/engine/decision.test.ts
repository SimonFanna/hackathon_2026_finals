import { describe, expect, it } from "vitest";
import * as F from "../fixtures/t3-inputs";
import type { Feedback, Goal, PersistentContext, Signal } from "../types";
import { decide } from "./decision";
import { deriveIntents } from "./intents";
import { detectMoments } from "./moments";

function run(signals: Signal[], ctx: PersistentContext, feedback: Feedback[] = [], goals: Goal[] = [], asOf = F.ASOF) {
  const moments = detectMoments(signals, ctx, F.t3Rules, asOf);
  const intents = deriveIntents(moments, ctx, F.t3Rules);
  return decide(intents, moments, ctx, feedback, goals, F.t3Rules, asOf);
}
const forIntent = (ds: ReturnType<typeof run>, code: string) => ds.find((d) => d.intent === code)!;
const speakers = (ds: ReturnType<typeof run>) => ds.filter((d) => d.level === "ASK" || d.level === "SUGGEST");
const fb = (kind: Feedback["kind"], at: string): Feedback => ({ customerId: 1, target: "BUY_HOME", kind, at });
const goal = (status: Goal["status"]): Goal => ({ id: "g1", customerId: 1, type: "BUY_AND_PREPARE_HOME", status, constraints: {}, priorities: [], dependsOn: [], createdAt: "2026-09-30" });

describe("decide", () => {
  it("returns one decision per intent definition, speakers first", () => {
    const ds = run(F.sofieSignals, F.sofieCtx);
    expect(ds).toHaveLength(F.t3Rules.intents.length);
    expect(ds[0].intent).toBe("BUY_HOME");
  });

  it("Sofie: BUY_HOME at ASK or SUGGEST, explanation mentions the simulations", () => {
    const d = forIntent(run(F.sofieSignals, F.sofieCtx), "BUY_HOME");
    expect(["ASK", "SUGGEST"]).toContain(d.level);
    expect(d).toMatchObject({ moment: "HOME_BUYING", goalType: "BUY_AND_PREPARE_HOME" });
    expect(d.explanation.join(" ")).toMatch(/4 home-loan simulations/);
  });

  it("one Kate message at a time: other strong intents WAIT with one_at_a_time", () => {
    const ds = run(F.sofieSignals, F.sofieCtx);
    expect(speakers(ds)).toHaveLength(1);
    const reno = forIntent(ds, "RENOVATE_HOME");
    expect(reno).toMatchObject({ level: "WAIT", reason: "one_at_a_time" });
    expect(reno.explanation[0]).toMatch(/buying a home/);
  });

  it("Lucas: START_BUSINESS at ASK or SUGGEST", () => {
    expect(["ASK", "SUGGEST"]).toContain(forIntent(run(F.lucasSignals, F.lucasCtx), "START_BUSINESS").level);
  });

  it("Els: only NO_ACTION, each with a reason and an explanation", () => {
    const ds = run(F.elsSignals, F.elsCtx);
    expect(ds.every((d) => d.level === "NO_ACTION")).toBe(true);
    expect(ds.every((d) => d.reason && d.explanation.length > 0)).toBe(true);
  });

  it("Thomas: BUY_HOME is NO_ACTION, says what was seen and what is missing", () => {
    const d = forIntent(run(F.thomasSignals, F.thomasCtx), "BUY_HOME");
    expect(d).toMatchObject({ level: "NO_ACTION", reason: "below_threshold" });
    expect(d.explanation.join(" ")).toMatch(/searched for a home/);
    expect(d.explanation.join(" ")).toMatch(/home-loan simulation/);
    expect(speakers(run(F.thomasSignals, F.thomasCtx))).toEqual([]);
  });

  it("feedback 'no' → NO_ACTION for 180 days, then Kate may ask again", () => {
    expect(forIntent(run(F.sofieSignals, F.sofieCtx, [fb("no", "2026-09-20")]), "BUY_HOME")).toMatchObject({ level: "NO_ACTION", reason: "declined" });
    expect(forIntent(run(F.sofieSignals, F.sofieCtx, [fb("no", "2026-01-10")]), "BUY_HOME").level).not.toBe("NO_ACTION");
    expect(forIntent(run(F.sofieSignals, F.sofieCtx, [fb("not_relevant", "2026-09-20")]), "BUY_HOME").reason).toBe("not_relevant");
  });

  it("feedback 'not now' → WAIT for 30 days; the next intent may speak instead", () => {
    const ds = run(F.sofieSignals, F.sofieCtx, [fb("not_now", "2026-09-25")]);
    expect(forIntent(ds, "BUY_HOME")).toMatchObject({ level: "WAIT", reason: "snoozed" });
    expect(forIntent(ds, "BUY_HOME").explanation[0]).toMatch(/2026-10-25/);
    expect(forIntent(run(F.sofieSignals, F.sofieCtx, [fb("not_now", "2026-08-01")]), "BUY_HOME").level).not.toBe("WAIT");
  });

  it("the latest feedback wins", () => {
    const ds = run(F.sofieSignals, F.sofieCtx, [fb("no", "2026-09-01"), fb("yes", "2026-09-20")]);
    expect(forIntent(ds, "BUY_HOME").level).not.toBe("NO_ACTION");
  });

  it("an open goal → NO_ACTION goal_in_progress, also for sibling intents without a goal type", () => {
    const ds = run(F.sofieSignals, F.sofieCtx, [], [goal("confirmed")]);
    expect(forIntent(ds, "BUY_HOME")).toMatchObject({ level: "NO_ACTION", reason: "goal_in_progress" });
    expect(forIntent(ds, "RENOVATE_HOME").reason).toBe("goal_in_progress");
    expect(forIntent(run(F.sofieSignals, F.sofieCtx, [], [goal("abandoned")]), "BUY_HOME").reason).not.toBe("goal_in_progress");
  });

  it("a goal still 'proposed' means Kate is waiting for an answer: nothing new is raised", () => {
    const ds = run([...F.sofieSignals, ...F.lucasSignals.map((s) => ({ ...s, customerId: 1 }))], F.sofieCtx, [], [goal("proposed")]);
    expect(speakers(ds)).toEqual([]);
    expect(forIntent(ds, "START_BUSINESS")).toMatchObject({ level: "WAIT", reason: "one_at_a_time" });
  });

  it("INCOME_DROP → CASHFLOW_PRESSURE → commercial intents WAIT; protective ones may still speak", () => {
    const ds = run(F.sofieIncomeDropSignals, F.sofieIncomeDropCtx);
    expect(forIntent(ds, "BUY_HOME")).toMatchObject({ level: "WAIT", reason: "cashflow_pressure" });
    expect(forIntent(ds, "BUY_HOME").explanation.join(" ")).toMatch(/income dropped/);
    expect(speakers(ds)).toEqual([]);
    expect(forIntent(run(F.nadiaSignals, F.nadiaCtx), "PREPARE_FOR_BABY").level).toBe("SUGGEST"); // non-commercial
  });
});

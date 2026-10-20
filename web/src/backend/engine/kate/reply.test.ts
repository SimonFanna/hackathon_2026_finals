import { describe, expect, it } from "vitest";
import { ASOF, buyHomeIntent, sofieCtx, sofieDecision, sofieMoment, sofieSignals, t8Rules } from "../../fixtures/t8-inputs";
import { kateForDecision } from "./messages";
import { kateReply, parseMessageId, REPLY_ACTION } from "./reply";

const proactive = kateForDecision(sofieDecision, buyHomeIntent, sofieCtx, sofieMoment, ASOF)!;
const affordability = () => ({ maxMonthlyPayment: 1100, maxPrincipal: 228_000, ownFunds: 30_000 });
const reply = (action: Parameters<typeof kateReply>[0]["action"], messageId = proactive.id, goalId?: string) =>
  kateReply({ messageId, action, ctx: sofieCtx, rules: t8Rules, signals: sofieSignals, asOf: ASOF, deps: { affordability }, goalId });

describe("kateReply", () => {
  it("yes → stores feedback and opens the pre-filled goal set-up", () => {
    const r = reply("yes");
    if ("error" in r) throw new Error(r.error);
    expect(r.feedback).toMatchObject({ customerId: 1, target: "BUY_HOME", kind: "yes" });
    expect(r.message.kind).toBe("goal_setup");
    expect(r.questions?.map((q) => q.id)).toEqual(["budget", "maxMonthlyPayment", "priorities", "property"]);
  });

  it("not_now / no → feedback only", () => {
    for (const a of ["not_now", "no"] as const) {
      const r = reply(a);
      if ("error" in r) throw new Error(r.error);
      expect(r.feedback?.kind).toBe(a);
      expect(r.questions).toBeUndefined();
    }
  });

  it("choose:<id> → forwards to the T7 choose route, stores no feedback", () => {
    const r = reply("choose:sc-a", "kate:1:INCOME_DROP:goal-sofie-home:sc-a+sc-b");
    if ("error" in r) throw new Error(r.error);
    expect(r.forward).toEqual({ method: "POST", path: "/api/goals/goal-sofie-home/scenarios/sc-a/choose" });
    expect(r.feedback).toBeUndefined();
  });

  it("rejects another customer's message and unknown codes", () => {
    expect(reply("yes", "kate:2:BUY_HOME:2026-10-01")).toEqual({ error: "unknown_message" });
    expect(reply("yes", "kate:1:NOT_AN_INTENT:x")).toEqual({ error: "unknown_intent" });
    expect(reply("yes", "<script>")).toEqual({ error: "unknown_message" });
  });

  it("validates actions and ids", () => {
    expect(REPLY_ACTION.test("choose:sc-a")).toBe(true);
    expect(REPLY_ACTION.test("choose:../../x")).toBe(false);
    // REVIEW P0 #2: real T6 scenario ids contain ":" and "+"
    expect(REPLY_ACTION.test("choose:goal-1-buy_and_prepare_home:v1:extend_term+add_protection")).toBe(true);
    expect(REPLY_ACTION.test("delete")).toBe(false);
    expect(parseMessageId(proactive.id)).toMatchObject({ customerId: 1, code: "BUY_HOME" });
  });
});

/**
 * T3 output for T8 (Kate) and the UI, computed from T3's own inputs, so it always matches the engine.
 * Sofie: HOME_BUYING → BUY_HOME at ASK (the hero Kate message); the other intents WAIT or NO_ACTION.
 * Also: Lucas (START_BUSINESS SUGGEST), Thomas / Els (NO_ACTION + why not), Sofie after the income drop (WAIT).
 */
import type { ActiveMoment, Decision, Intent, PersistentContext, Signal } from "../types";
import { decide } from "../engine/decision";
import { deriveIntents } from "../engine/intents";
import { detectMoments } from "../engine/moments";
import * as F from "./t3-inputs";

export interface T3Output { ctx: PersistentContext; moments: ActiveMoment[]; intents: Intent[]; decisions: Decision[] }

function t3(signals: Signal[], ctx: PersistentContext): T3Output {
  const moments = detectMoments(signals, ctx, F.t3Rules, F.ASOF);
  const intents = deriveIntents(moments, ctx, F.t3Rules);
  return { ctx, moments, intents, decisions: decide(intents, moments, ctx, [], [], F.t3Rules, F.ASOF) };
}

export const sofieT3 = t3(F.sofieSignals, F.sofieCtx);
export const lucasT3 = t3(F.lucasSignals, F.lucasCtx);
export const thomasT3 = t3(F.thomasSignals, F.thomasCtx);
export const elsT3 = t3(F.elsSignals, F.elsCtx);
export const sofieIncomeDropT3 = t3(F.sofieIncomeDropSignals, F.sofieIncomeDropCtx);

/** The decision Kate acts on (ASK / SUGGEST), if any. */
export const proactive = (o: T3Output) => o.decisions.find((d) => d.level === "ASK" || d.level === "SUGGEST");

// T7 — a RuleSet assembled from every task's fixtures. Used by the snapshot script for the config
// tables that are not in Supabase yet, so the snapshot is always complete.
import weights from "../engine/weights.json";
import signalRules from "../fixtures/t1-signal-rules.json";
import { t3IntentRules, t3Intents, t3MomentRules } from "../fixtures/t3-rules";
import { t4Rules } from "../fixtures/t4-rules";
import { decisionRules } from "../fixtures/t5-inputs";
import { disruptionTypes, replanStrategies } from "../fixtures/t6-inputs";
import type { ModelWeight, RuleSet, SignalRule } from "../types";

export const fixtureRules: RuleSet = {
  signalRules: signalRules as SignalRule[],
  modelWeights: weights as ModelWeight[],
  momentRules: t3MomentRules,
  intents: t3Intents,
  intentRules: t3IntentRules,
  ...t4Rules,
  decisionRules,
  disruptionTypes,
  replanStrategies,
};

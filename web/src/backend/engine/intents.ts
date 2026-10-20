import type { ActiveMoment, Intent, IntentCode, PersistentContext, RuleSet } from "../types";
import { evalCondition } from "./condition";

/**
 * ④ Intents. `confidence = moment.confidence × rule.weight`; a rule's condition sees `{ ctx, moment }`
 * (e.g. `moment.evidence contains RENOVATION_VIEW`). Several rules can target one intent: the best wins.
 */
export function deriveIntents(moments: ActiveMoment[], ctx: PersistentContext, rules: RuleSet): Intent[] {
  const defs = new Map(rules.intents.map((d) => [d.code, d]));
  const best = new Map<IntentCode, Intent>();
  for (const moment of moments) {
    for (const rule of rules.intentRules) {
      if (rule.moment !== moment.type || !evalCondition(rule.condition, { ctx, moment })) continue;
      const def = defs.get(rule.intent);
      if (!def) continue;
      const confidence = Math.round(moment.confidence * rule.weight * 1000) / 1000;
      const prev = best.get(rule.intent);
      if (!prev || confidence > prev.confidence) best.set(rule.intent, { code: rule.intent, moment: moment.type, confidence, goalType: def.goalType });
    }
  }
  return [...best.values()].sort((a, b) => b.confidence - a.confidence);
}

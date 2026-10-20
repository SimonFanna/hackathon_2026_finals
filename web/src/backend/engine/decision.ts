import type { ActiveMoment, Decision, DecisionLevel, Feedback, Goal, Intent, IntentCode, IntentDef, MomentRule, PersistentContext, RuleSet, SignalCode } from "../types";
import { addDays } from "./moments";
import { describeMissing, explainMoment, pct } from "./explain";

/** Reason codes on every Decision (stable: the UI and Kate switch on them). */
export type DecisionReason =
  | "suggest" | "ask"
  | "no_signal" | "below_threshold" | "goal_in_progress" | "declined" | "not_relevant"
  | "snoozed" | "cashflow_pressure" | "one_at_a_time";

export const DECLINE_DAYS = 180;      // "no" / "not relevant" → silent for 6 months
export const SNOOZE_DAYS = 30;        // "not now" → wait a month
export const PRESSURE_THRESHOLD = 0.6; // CASHFLOW_PRESSURE confidence that pauses commercial intents

const DAY_MS = 86_400_000;
const CLOSED: Goal["status"][] = ["achieved", "abandoned"];
const LEVEL_RANK: Record<DecisionLevel, number> = { SUGGEST: 0, ASK: 1, WAIT: 2, NO_ACTION: 3 };

const daysBetween = (from: string, to: string) => (new Date(to).getTime() - new Date(from).getTime()) / DAY_MS;
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

function latestFeedback(feedback: Feedback[], target: string, asOf: string): Feedback | undefined {
  return feedback
    .filter((f) => f.target === target && f.at <= asOf)
    .sort((a, b) => (a.at < b.at ? 1 : -1))[0];
}

/** Strongest rule signals the customer has NOT shown: "what would change this". */
function missingEvidence(rule: MomentRule | undefined, moment: ActiveMoment | undefined, max = 2): string[] {
  if (!rule) return [];
  const seen = new Set(moment?.evidence ?? []);
  return (Object.entries(rule.weights) as [SignalCode, number][])
    .filter(([code, w]) => w > 0 && !seen.has(code))
    .sort(([, a], [, b]) => b - a)
    .slice(0, max)
    .map(([code]) => describeMissing(code));
}

/**
 * ⑤ Decision gate: should Kate speak? One Decision per intent definition, so every intent
 * has a "why / why not". Gates, in order:
 *  1. an open goal of the same type (or, for intents without a goal type, of a sibling intent) → NO_ACTION
 *  2. feedback "no" / "not relevant" in the last 180 days → NO_ACTION
 *  3. no intent, or confidence < askThreshold → NO_ACTION (nothing to wait for)
 *  4. feedback "not now" in the last 30 days → WAIT
 *  5. CASHFLOW_PRESSURE ≥ 0.6 and the intent is commercial → WAIT
 *  6. < suggestThreshold → ASK, otherwise SUGGEST
 * Then one at a time: only the strongest ASK/SUGGEST stays; the others WAIT. A goal still
 * "proposed" means Kate is already waiting for an answer, so nothing new is raised.
 */
export function decide(intents: Intent[], moments: ActiveMoment[], ctx: PersistentContext, feedback: Feedback[], goals: Goal[], rules: RuleSet, asOf: string): Decision[] {
  const openGoals = goals.filter((g) => !CLOSED.includes(g.status));
  const pressure = moments.find((m) => m.type === "CASHFLOW_PRESSURE");
  const underPressure = !!pressure && pressure.confidence >= PRESSURE_THRESHOLD;
  const momentRules = new Map(rules.momentRules.map((r) => [r.moment, r]));
  const goalTypeOf = new Map(rules.intents.map((d) => [d.code, d.goalType]));

  const whyById = new Map<IntentCode, string[]>();
  const gate = (def: IntentDef): Decision => {
    const intent = intents.find((i) => i.code === def.code);
    const moment = intent ? moments.find((m) => m.type === intent.moment) : undefined;
    const mRule = intent ? momentRules.get(intent.moment) : undefined;
    const momentLabel = mRule?.label ?? lower(def.label);
    const base = { intent: def.code, confidence: intent?.confidence ?? 0, moment: intent?.moment, goalType: def.goalType };
    const out = (level: DecisionLevel, reason: DecisionReason, explanation: string[]): Decision => ({ ...base, level, reason, explanation });

    // 1. already in progress
    const siblingTypes = intent && !def.goalType
      ? intents.filter((i) => i.moment === intent.moment).map((i) => goalTypeOf.get(i.code)).filter(Boolean)
      : [];
    const goal = openGoals.find((g) => g.type === def.goalType || siblingTypes.includes(g.type));
    if (goal) {
      return out("NO_ACTION", "goal_in_progress", [
        goal.status === "proposed"
          ? "Kate has already asked you about this. We're waiting for your answer."
          : "You're already working on this goal with Kate, so there's nothing new to suggest.",
      ]);
    }

    // 2. explicit refusal
    const fb = latestFeedback(feedback, def.code, asOf);
    if (fb && (fb.kind === "no" || fb.kind === "not_relevant") && daysBetween(fb.at, asOf) <= DECLINE_DAYS) {
      return out("NO_ACTION", fb.kind === "no" ? "declined" : "not_relevant", [
        `On ${fb.at.slice(0, 10)} you told Kate this isn't for you. We won't bring it up again before ${addDays(fb.at, DECLINE_DAYS)}.`,
      ]);
    }

    // 3. not enough evidence
    if (!intent || !moment) {
      return out("NO_ACTION", "no_signal", [`We haven't seen anything suggesting you want to ${lower(def.label)}.`]);
    }
    if (intent.confidence < def.askThreshold) {
      const seen = explainMoment(moment, 3);
      const missing = missingEvidence(mRule, moment);
      return out("NO_ACTION", "below_threshold", [
        `Not enough to go on: ${pct(intent.confidence)} confidence that you're ${momentLabel}, and Kate only asks from ${pct(def.askThreshold)}.`,
        ...(seen.length ? [`What we saw: ${seen.map(lower).join("; ")}.`] : []),
        ...(missing.length ? [`What would make it clearer: ${missing.join(" or ")}.`] : []),
      ]);
    }

    const why = explainMoment(moment);

    // 4. snoozed
    if (fb && fb.kind === "not_now" && daysBetween(fb.at, asOf) <= SNOOZE_DAYS) {
      return out("WAIT", "snoozed", [
        `You asked Kate to come back later. We'll wait until ${addDays(fb.at, SNOOZE_DAYS)}.`,
        ...why,
      ]);
    }

    // 5. budget under pressure → no commercial push
    if (underPressure && def.commercial !== false) {
      return out("WAIT", "cashflow_pressure", [
        "Your budget looks tighter right now, so we won't suggest new products for this. Kate can help with your budget instead.",
        ...explainMoment(pressure!, 2),
      ]);
    }

    // 6. speak
    const level: DecisionLevel = intent.confidence < def.suggestThreshold ? "ASK" : "SUGGEST";
    const what = def.goalType ? `be ${momentLabel}` : `want to ${lower(def.label)}`;
    const headline = `It looks like you may ${what} (${pct(intent.confidence)} confidence).`;
    whyById.set(def.code, [headline, ...why]);
    return out(level, level === "ASK" ? "ask" : "suggest", [
      headline,
      ...why,
      level === "ASK"
        ? "We're not sure yet, so Kate asks first. You decide."
        : "The signals are strong, so Kate proposes a plan. You can still say no or not now.",
    ]);
  };

  const decisions = rules.intents.map(gate);

  // One proactive Kate message at a time.
  const pendingGoal = openGoals.find((g) => g.status === "proposed");
  const speakers = decisions
    .filter((d) => d.level === "ASK" || d.level === "SUGGEST")
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
  const keep = pendingGoal ? undefined : speakers[0];
  for (const d of speakers) {
    if (d === keep) continue;
    const topic = keep ? (momentRules.get(keep.moment!)?.label ?? "something else") : "an open proposal";
    d.level = "WAIT";
    d.reason = "one_at_a_time";
    d.explanation = [`Kate is already talking to you about ${topic}. One thing at a time.`, ...(whyById.get(d.intent) ?? [])];
  }

  return decisions.sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || (b.confidence ?? 0) - (a.confidence ?? 0));
}

import type { ActiveMoment, Contribution, ModelWeight, MomentCode, MomentRule, PersistentContext, Prediction, RuleSet, Signal, SignalCode } from "../types";
import { evalCondition } from "./condition";
import { describeSignal } from "./explain";

/** T2's model, injected so T3 never breaks when there are no weights (rules fallback). */
export interface MomentModel {
  features(signals: Signal[], ctx: PersistentContext): Record<string, number>;
  predict(moment: MomentCode, x: Record<string, number>, weights: ModelWeight[]): Prediction | null;
}

/** Moments below this are dropped. Kept low so NO_ACTION can still be explained. */
export const MIN_MOMENT_CONFIDENCE = 0.2;

const DAY_MS = 86_400_000;
const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));
const round3 = (x: number) => Math.round(x * 1000) / 1000;

export function addDays(iso: string, days: number): string {
  return new Date(new Date(iso).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

/** ML contributions are keyed `sig_<CODE>` / `cnt_<CODE>`: rewrite their label with what we actually saw. */
function relabel(contributions: Contribution[], byCode: Map<SignalCode, Signal>, labels: Map<string, string>): Contribution[] {
  return contributions.map((c) => {
    const m = /^(?:sig|cnt)_(.+)$/.exec(c.feature);
    const s = m ? byCode.get(m[1] as SignalCode) : undefined;
    return s ? { ...c, label: describeSignal(s, labels.get(s.code)) } : c;
  });
}

function evidenceOf(rule: MomentRule, contributions: Contribution[], byCode: Map<SignalCode, Signal>): Signal[] {
  const fromContrib = contributions
    .filter((c) => c.value * c.weight > 0)
    .map((c) => /^(?:sig|cnt)_(.+)$/.exec(c.feature)?.[1] as SignalCode | undefined)
    .filter((code): code is SignalCode => !!code && byCode.has(code));
  const fromRule = (Object.entries(rule.weights) as [SignalCode, number][])
    .filter(([code, w]) => w > 0 && (byCode.get(code)?.strength ?? 0) > 0)
    .sort(([a, wa], [b, wb]) => wb * byCode.get(b)!.strength - wa * byCode.get(a)!.strength)
    .map(([code]) => code);
  return [...new Set([...fromContrib, ...fromRule])].map((code) => byCode.get(code)!);
}

function scoreWithRules(rule: MomentRule, ctx: PersistentContext, byCode: Map<SignalCode, Signal>, labels: Map<string, string>) {
  const contributions: Contribution[] = [];
  let z = rule.bias;
  for (const [code, weight] of Object.entries(rule.weights) as [SignalCode, number][]) {
    const s = byCode.get(code);
    if (!s || s.strength <= 0) continue;
    z += weight * s.strength;
    contributions.push({ feature: `sig_${code}`, value: round3(s.strength), weight, label: describeSignal(s, labels.get(code)) });
  }
  for (const cs of rule.contextScores ?? []) {
    if (!evalCondition(cs.condition, { ctx })) continue;
    z += cs.score;
    contributions.push({ feature: `ctx:${cs.label}`, value: 1, weight: cs.score, label: cs.label });
  }
  return { confidence: sigmoid(z), contributions };
}

/**
 * ③ Active moments. Per moment rule: T2's prediction when a model is given and has weights
 * (`source:"ml"`), otherwise `sigmoid(bias + Σ weight × strength + Σ context scores)` (`source:"rules"`).
 * CASHFLOW_PRESSURE always uses rules: it is a safety brake, not a sales signal.
 */
export function detectMoments(signals: Signal[], ctx: PersistentContext, rules: RuleSet, asOf: string, model?: MomentModel): ActiveMoment[] {
  const byCode = new Map<SignalCode, Signal>();
  for (const s of signals) {
    const prev = byCode.get(s.code);
    if (!prev || s.strength > prev.strength) byCode.set(s.code, s);
  }
  const labels = new Map(rules.signalRules.map((r) => [r.code as string, r.label]));
  const x = model ? model.features(signals, ctx) : null;
  const out: ActiveMoment[] = [];

  for (const rule of rules.momentRules) {
    if (!evalCondition(rule.context, { ctx })) continue;

    const rulesScore = scoreWithRules(rule, ctx, byCode, labels);
    const hasSignal = rulesScore.contributions.some((c) => c.feature.startsWith("sig_"));
    if (rule.requiresSignal !== false && !hasSignal) continue;
    if (rulesScore.contributions.length === 0) continue;

    const prediction = model && x && rule.moment !== "CASHFLOW_PRESSURE" ? model.predict(rule.moment, x, rules.modelWeights) : null;
    const confidence = prediction ? prediction.confidence : rulesScore.confidence;
    const contributions = prediction ? relabel(prediction.contributions, byCode, labels) : rulesScore.contributions;
    if (confidence < MIN_MOMENT_CONFIDENCE) continue;

    const evidence = evidenceOf(rule, contributions, byCode);
    const since = evidence.length > 0 ? evidence.map((s) => s.at).sort()[0].slice(0, 10) : asOf.slice(0, 10);
    const expiresAt = addDays(since, rule.expiryDays);
    if (expiresAt < asOf.slice(0, 10)) continue;

    out.push({
      type: rule.moment,
      confidence: round3(confidence),
      evidence: evidence.map((s) => s.code),
      contributions,
      since,
      expiresAt,
      source: prediction ? "ml" : "rules",
    });
  }
  return out.sort((a, b) => b.confidence - a.confidence);
}

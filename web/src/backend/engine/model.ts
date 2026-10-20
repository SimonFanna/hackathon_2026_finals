// T2 · Moment confidence: one explainable logistic regression per moment.
// confidence = sigmoid(bias + Σ wᵢ·xᵢ); the positive wᵢ·xᵢ terms are the "why am I seeing this?".
import type { Contribution, ModelWeight, MomentCode, Prediction } from "../types";
import type { MomentModel } from "./moments";
import { CONTEXT_FEATURE_LABELS, features } from "./features";

export const BIAS = "__bias__";
const TOP_CONTRIBUTIONS = 5;
/** A model trained on 2,000 synthetic customers never claims certainty: confidence is capped. */
export const MAX_CONFIDENCE = 0.95;

interface Compiled { version: string; bias: number; features: string[]; weights: Float64Array }

// predict() is called for every customer × moment: compile each weights array once (by identity).
const cache = new WeakMap<ModelWeight[], Map<MomentCode, Compiled | null>>();

function compile(moment: MomentCode, weights: ModelWeight[]): Compiled | null {
  let perMoment = cache.get(weights);
  if (!perMoment) cache.set(weights, (perMoment = new Map()));
  if (perMoment.has(moment)) return perMoment.get(moment)!;
  const mine = weights.filter((w) => w.moment === moment);
  let compiled: Compiled | null = null;
  if (mine.length) {
    const version = mine.map((w) => w.modelVersion).sort().at(-1)!;   // latest version wins
    const current = mine.filter((w) => w.modelVersion === version);
    const terms = current.filter((w) => w.feature !== BIAS);
    compiled = {
      version,
      bias: current.find((w) => w.feature === BIAS)?.weight ?? 0,
      features: terms.map((w) => w.feature),
      weights: Float64Array.from(terms.map((w) => w.weight)),
    };
  }
  perMoment.set(moment, compiled);
  return compiled;
}

export function featureLabel(feature: string): string {
  const m = /^(sig|cnt)_(.+)$/.exec(feature);
  if (m) return m[2].toLowerCase().replace(/_/g, " ");
  return CONTEXT_FEATURE_LABELS[feature] ?? feature;
}

/** `null` when there is no model for this moment (T3 then falls back to its rules). */
export function predict(moment: MomentCode, x: Record<string, number>, weights: ModelWeight[]): Prediction | null {
  const model = compile(moment, weights);
  if (!model) return null;
  const { features: names, weights: ws } = model;
  let z = model.bias;
  const top: number[] = [];   // indexes of the positive terms, kept sorted (largest first), at most 5
  const termOf = (i: number) => ws[i] * (x[names[i]] ?? 0);
  for (let i = 0; i < names.length; i++) {
    const value = x[names[i]];
    if (!value) continue;
    const term = ws[i] * value;
    z += term;
    if (term <= 0 || (top.length === TOP_CONTRIBUTIONS && term <= termOf(top[TOP_CONTRIBUTIONS - 1]))) continue;
    let j = top.length;
    while (j > 0 && termOf(top[j - 1]) < term) j--;
    top.splice(j, 0, i);
    if (top.length > TOP_CONTRIBUTIONS) top.pop();
  }
  const contributions: Contribution[] = top.map((i) => ({
    feature: names[i], value: Math.round(x[names[i]] * 1e4) / 1e4, weight: ws[i], label: featureLabel(names[i]),
  }));
  const p = 1 / (1 + Math.exp(-z));
  return { confidence: Math.round(Math.min(MAX_CONFIDENCE, p) * 1e4) / 1e4, contributions, modelVersion: model.version };
}

/** Batch path: confidence only, no explanation objects (scoring the whole customer base). Same value as predict(). */
export function score(moment: MomentCode, x: Record<string, number>, weights: ModelWeight[]): number | null {
  const model = compile(moment, weights);
  if (!model) return null;
  const { features: names, weights: ws } = model;
  let z = model.bias;
  for (let i = 0; i < names.length; i++) {
    const value = x[names[i]];
    if (value) z += ws[i] * value;
  }
  return Math.round(Math.min(MAX_CONFIDENCE, 1 / (1 + Math.exp(-z))) * 1e4) / 1e4;
}

/** What T3's detectMoments() takes as its injected model. */
export const momentModel: MomentModel = { features, predict };

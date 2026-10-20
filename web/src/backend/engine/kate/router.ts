// Routes a customer question about their plan. Pure, deterministic: the LLM never decides the route.
import type { CapabilityCode, Plan } from "../../types";
import type { WhatIf } from "./deps";
import { findStepsInText } from "./text";

export type Route =
  | { kind: "refuse"; reason: "approval" | "injection" }
  | { kind: "what_if"; change: WhatIf }
  | { kind: "later"; stepIds: string[] }
  | { kind: "why"; stepIds: string[] }
  | { kind: "share"; partner: string | null }
  | { kind: "general" };

/** Longest question we accept. Anything longer is cut before routing and before the LLM. */
export const MAX_QUESTION_CHARS = 300;

const INJECTION = [
  /ignore (all |your |the |any |previous |prior )*(rules|instructions|prompt)/i,
  /system prompt/i,
  /you are now/i,
  /pretend (to be|you)/i,
  /developer mode|jailbreak/i,
  /(reveal|print|show) (your|the) (prompt|instructions|rules)/i,
];
const APPROVAL = /\b(approve|approval|guarantee|promise|grant)\b.*\b(loan|mortgage|credit)\b|\b(loan|mortgage|credit)\b.*\b(approved|guaranteed)\b/i;

/** "€280k", "280,000", "280.000 euros", "280000" → 280000. Ignores numbers followed by "%" or "year". */
export function parseAmount(q: string): number | undefined {
  const m = q.match(/€?\s*(\d{1,3}(?:[.,\s]\d{3})+|\d+(?:[.,]\d+)?)\s*(k|thousand|000)?\b(?!\s*(%|percent|years?|y\b|months?))/i);
  if (!m) return undefined;
  const raw = m[1];
  const grouped = /^\d{1,3}([.,\s]\d{3})+$/.test(raw);
  let n = grouped ? Number(raw.replace(/[.,\s]/g, "")) : Number(raw.replace(",", "."));
  if (m[2]) n *= 1000;
  return Number.isFinite(n) && n >= 1000 ? Math.round(n) : undefined;
}

function parsePct(q: string): number | undefined {
  const m = q.match(/(\d+(?:[.,]\d+)?)\s*(%|percent)/i);
  return m ? Number(m[1].replace(",", ".")) : undefined;
}

/** Turn a what-if question into the T6 `WhatIf` change. Empty object when nothing parses. */
export function parseWhatIf(q: string): WhatIf {
  const change: WhatIf = {};
  const years = q.match(/(\d{1,2})\s*(years?|yrs?|-year)\b/i);
  if (years) change.termYears = Number(years[1]);
  const pct = parsePct(q);
  if (/income|salary|job|unemploy|earn/i.test(q)) {
    if (/lose|lost|without|no (more )?job|unemploy/i.test(q) && pct === undefined) change.incomeDeltaPct = -35;
    else if (pct !== undefined) change.incomeDeltaPct = /rise|raise|increase|more|up\b/i.test(q) ? pct : -pct;
  } else if (/rate|interest/i.test(q) && pct !== undefined) {
    change.rateDeltaPct = /drop|fall|lower|down|decrease/i.test(q) ? -pct : pct;
  }
  if (change.incomeDeltaPct === undefined && change.rateDeltaPct === undefined) {
    const amount = parseAmount(q);
    if (amount !== undefined) change.budget = amount;
  }
  return change;
}

/** Decide what kind of answer the question needs, and which steps it is about. */
export function routeQuestion(question: string, plan: Plan): Route {
  const q = question.slice(0, MAX_QUESTION_CHARS);
  if (INJECTION.some((r) => r.test(q))) return { kind: "refuse", reason: "injection" };
  if (APPROVAL.test(q)) return { kind: "refuse", reason: "approval" };

  const steps = findStepsInText(q, plan);
  if (/\b(share|shared|sharing|send|receive|data|privacy|know about me)\b/i.test(q)) {
    const partner = steps.find((s) => s.provider.isPartner)?.provider.provider
      ?? plan.steps.find((s) => s.provider.isPartner && q.toLowerCase().includes(s.provider.provider.toLowerCase()))?.provider.provider
      ?? null;
    return { kind: "share", partner };
  }
  if (/\b(later|postpone|delay|skip|wait with|not now|without)\b/i.test(q) && steps.length) {
    return { kind: "later", stepIds: steps.map((s) => s.id) };
  }
  if (/\bwhat if\b|\bwhat happens if\b|\bsuppose\b|\bimagine\b|\bif (the|my|i)\b/i.test(q)) {
    const change = parseWhatIf(q);
    if (Object.keys(change).length) return { kind: "what_if", change };
  }
  if (/\bwhy\b|\bbefore\b|\border\b|\bfirst\b/i.test(q) && steps.length) {
    return { kind: "why", stepIds: steps.map((s) => s.id) };
  }
  return { kind: "general" };
}

/** Capabilities a "later" route drops in the what-if. */
export function capabilitiesOf(plan: Plan, stepIds: string[]): CapabilityCode[] {
  return plan.steps.filter((s) => stepIds.includes(s.id)).map((s) => s.capability);
}

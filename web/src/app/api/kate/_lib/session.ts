// Loads what Kate needs for one customer. INTERIM: built from the real T5 planner on the T5 fixtures,
// with in-memory feedback, until T7's data layer (loadFacts / runPipeline / Repo) lands. Then swap the bodies, not the callers.
import { affordability } from "../../../../backend/engine/finance";
import { sharedData } from "../../../../backend/engine/consent";
import { simulate } from "../../../../backend/engine/scenarios";
import type { KateDeps } from "../../../../backend/engine/kate/deps";
import type { QaInput } from "../../../../backend/engine/kate/answers";
import { ASOF, lucasCtx, lucasGoal, lucasPlan, sofieCtx, sofieGoal, sofiePlan } from "../../../../backend/fixtures/t5-sofie-plan";
import { t6Rules } from "../../../../backend/fixtures/t6-inputs";
import { lucasSignals, sofieSignals } from "../../../../backend/fixtures/t3-inputs";
import { t3Intents } from "../../../../backend/fixtures/t3-rules";
import type { Feedback, Signal } from "../../../../backend/types";

/** Demo personas Kate can talk to. Anything else is rejected by the routes' zod schema. */
export const DEMO_SLUGS = ["sofie", "lucas", "nadia", "pieter", "els", "thomas"] as const;
export type DemoSlug = (typeof DEMO_SLUGS)[number];

const rules = { ...t6Rules, intents: t3Intents };

const sessions: Partial<Record<DemoSlug, { input: QaInput; signals: Signal[] }>> = {
  sofie: { input: { ctx: sofieCtx, goal: sofieGoal, plan: sofiePlan, consents: [], rules, asOf: ASOF }, signals: sofieSignals },
  lucas: { input: { ctx: lucasCtx, goal: lucasGoal, plan: lucasPlan, consents: [], rules, asOf: ASOF }, signals: lucasSignals },
};

/** Real engine functions: T6 what-ifs, T5 data sharing and affordability. */
export const kateDeps: KateDeps = { simulate, sharedData, affordability };

export function loadSession(slug: DemoSlug, goalId?: string): { input: QaInput; signals: Signal[] } | null {
  const s = sessions[slug];
  if (!s) return null;
  if (goalId && s.input.goal.id !== goalId) return null;
  return s;
}

const feedback: Feedback[] = [];
export function saveFeedback(f: Feedback): void {
  feedback.push(f);
}
export function listFeedback(customerId: number): Feedback[] {
  return feedback.filter((f) => f.customerId === customerId);
}

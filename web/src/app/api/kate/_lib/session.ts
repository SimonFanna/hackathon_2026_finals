// Loads what Kate needs for one customer, from T7's live state: the customer's context and signals
// (loadSituation, read-only), the goal's LATEST plan version and its consents (repo). So after a replan or a
// consent, Kate answers about the plan on screen. The T5 fixtures stay as the fallback when nothing is live.
import "server-only";
import { affordability } from "../../../../backend/engine/finance";
import { sharedData } from "../../../../backend/engine/consent";
import { simulate } from "../../../../backend/engine/scenarios";
import type { KateDeps } from "../../../../backend/engine/kate/deps";
import type { QaInput } from "../../../../backend/engine/kate/answers";
import { loadSituation } from "../../../../backend/pipeline";
import { serverDeps } from "../../../../backend/data/server";
import { ASOF, lucasCtx, lucasGoal, lucasPlan, sofieCtx, sofieGoal, sofiePlan } from "../../../../backend/fixtures/t5-sofie-plan";
import { t6Rules } from "../../../../backend/fixtures/t6-inputs";
import { lucasSignals, sofieSignals } from "../../../../backend/fixtures/t3-inputs";
import { t3Intents } from "../../../../backend/fixtures/t3-rules";
import type { Feedback, Signal } from "../../../../backend/types";

/** Demo personas Kate can talk to. Anything else is rejected by the routes' zod schema. */
export const DEMO_SLUGS = ["sofie", "lucas", "nadia", "pieter", "els", "thomas"] as const;
export type DemoSlug = (typeof DEMO_SLUGS)[number];

export interface Session { input: QaInput; signals: Signal[]; live: boolean }

const fixtureRules = { ...t6Rules, intents: t3Intents };
const fixtures: Partial<Record<DemoSlug, Session>> = {
  sofie: { input: { ctx: sofieCtx, goal: sofieGoal, plan: sofiePlan, consents: [], rules: fixtureRules, asOf: ASOF }, signals: sofieSignals, live: false },
  lucas: { input: { ctx: lucasCtx, goal: lucasGoal, plan: lucasPlan, consents: [], rules: fixtureRules, asOf: ASOF }, signals: lucasSignals, live: false },
};

/** Real engine functions: T6 what-ifs, T5 data sharing and affordability. */
export const kateDeps: KateDeps = { simulate, sharedData, affordability };

const ACTIVE = new Set(["proposed", "confirmed", "at_risk", "replanned", "paused"]);

/**
 * `needsPlan`: plan Q&A needs a goal with a plan; replies to a proactive message only need the context.
 * Live first; on any failure (or no live goal) the fixture, as before.
 */
export async function loadSession(slug: DemoSlug, goalId?: string, needsPlan = true): Promise<Session | null> {
  try {
    const deps = await serverDeps();
    const s = await loadSituation(slug, deps);
    const goals = s.goals.filter((g) => ACTIVE.has(g.status));
    const goal = goalId ? s.goals.find((g) => g.id === goalId) : goals[goals.length - 1];
    const plan = goal ? await deps.repo.getPlan(goal.id) : null;
    if (goal && plan) {
      const consents = await deps.repo.getConsents(goal.id);
      return { input: { ctx: s.ctx, goal, plan, consents, rules: s.rules, asOf: s.asOf }, signals: s.signals, live: true };
    }
    if (!needsPlan) {
      // No goal yet: the live context; the goal/plan slots are placeholders that replies never read.
      const base = fixtures[slug]?.input ?? fixtures.sofie!.input;
      return { input: { ...base, ctx: s.ctx, rules: s.rules, asOf: s.asOf }, signals: s.signals, live: true };
    }
  } catch {
    // fall through to the fixture
  }
  const fx = fixtures[slug];
  if (!fx) return null;
  if (goalId && fx.input.goal.id !== goalId) return null;
  return fx;
}

/** Kate's yes / not now / no feed the decision gate (T3) through the same repo as the rest of the API. */
export async function saveFeedback(f: Feedback): Promise<void> {
  try {
    const deps = await serverDeps();
    await deps.repo.saveFeedback(f);
  } catch {
    // feedback is best-effort: the reply itself already succeeded
  }
}

// T7 — the operations behind the API routes. Route handlers only validate input and call these,
// so every demo flow can also run offline in tests (snapshot + memory repo).
import { DEMO_AS_OF, EXCLUDE_TX_KIND } from "./data/facts";
import { BadRequest, NotFound } from "./errors";
import { customerIdOf } from "./data/load";
import { DEMO_SLUGS, type DemoSlug } from "./data/personas";
import { applyStepAction, currentConsents, setConsent, sharedData, type StepAction } from "./engine/consent";
import { buildPlan, createGoal } from "./engine/orchestrator";
import { chooseScenario } from "./engine/replan";
import { applyDecisionRules } from "./engine/rules";
import { simulate, type WhatIf } from "./engine/scenarios";
import { trackOutcome } from "./engine/tracker";
import { type Deps, loadSituation } from "./pipeline";
import type { Consent, Event, Feedback, Goal, GoalConstraints, GoalType, Outcome, Plan, Priority, Scenario } from "./types";


const slugOf = (customerId: number): DemoSlug => {
  const slug = DEMO_SLUGS.find((s) => customerIdOf(s) === customerId);
  if (!slug) throw new NotFound("customer");
  return slug;
};

async function goalAndPlan(goalId: string, deps: Deps): Promise<{ goal: Goal; plan: Plan }> {
  const [goal, plan] = await Promise.all([deps.repo.getGoal(goalId), deps.repo.getPlan(goalId)]);
  if (!goal || !plan) throw new NotFound("goal");
  return { goal, plan };
}

async function saveOutcome(goal: Goal, plan: Plan, deps: Deps, consents?: Consent[]): Promise<Outcome> {
  const outcome = trackOutcome(goal, plan, consents ?? (await deps.repo.getConsents(goal.id)));
  await deps.repo.saveOutcome(outcome);
  return outcome;
}

export async function createGoalFor(
  slug: DemoSlug,
  input: { type: GoalType; constraints: GoalConstraints; priorities: Priority[] },
  deps: Deps,
): Promise<{ goal: Goal; plan: Plan; outcome: Outcome }> {
  const s = await loadSituation(slug, deps);
  if (!s.rules.templates.some((t) => t.goalType === input.type)) throw new BadRequest(`no plan template for ${input.type} yet`);
  const goal = createGoal({ customerId: s.ctx.customerId, ...input }, s.ctx, s.rules, s.asOf);
  const plan = applyDecisionRules(buildPlan(goal, s.ctx, s.rules, s.asOf), s.ctx, s.feedback, s.rules);
  // Same goal again (no reset): start over, so old plan versions, consents and scenarios never resurface.
  if (await deps.repo.getGoal(goal.id)) await deps.repo.deleteGoal(goal.id);
  await deps.repo.saveGoal(goal);
  await deps.repo.savePlan(plan);
  return { goal, plan, outcome: await saveOutcome(goal, plan, deps) };
}

export async function stepActionFor(goalId: string, stepId: string, action: StepAction, deps: Deps): Promise<{ plan: Plan; outcome: Outcome }> {
  const { goal, plan } = await goalAndPlan(goalId, deps);
  if (!plan.steps.some((st) => st.id === stepId)) throw new NotFound("step");
  const next = applyStepAction(plan, stepId, action);
  await deps.repo.savePlan(next);
  return { plan: next, outcome: await saveOutcome(goal, next, deps) };
}

export async function consentFor(
  goalId: string,
  c: { stepId: string; partner: string; field: string; granted: boolean },
  deps: Deps,
): Promise<{ consents: Consent[]; sharedData: ReturnType<typeof sharedData>; outcome: Outcome }> {
  const { goal, plan } = await goalAndPlan(goalId, deps);
  if (!plan.steps.some((st) => st.id === c.stepId)) throw new NotFound("step");
  const all = setConsent(await deps.repo.getConsents(goalId), { goalId, ...c }, DEMO_AS_OF);
  await deps.repo.saveConsent(all[all.length - 1]);
  return { consents: currentConsents(all), sharedData: sharedData(plan, all), outcome: await saveOutcome(goal, plan, deps, all) };
}

export async function simulateFor(goalId: string, change: WhatIf, deps: Deps): Promise<Scenario[]> {
  const { goal, plan } = await goalAndPlan(goalId, deps);
  const s = await loadSituation(slugOf(goal.customerId), deps);
  return simulate(goal, plan, s.ctx, change, s.rules, s.asOf);
}

export async function chooseScenarioFor(goalId: string, scenarioId: string, deps: Deps): Promise<{ goal: Goal; plan: Plan; outcome: Outcome }> {
  const [{ goal }, scenario] = await Promise.all([goalAndPlan(goalId, deps), deps.repo.getScenario(scenarioId)]);
  if (!scenario || scenario.goalId !== goalId) throw new NotFound("scenario");
  const next = chooseScenario(goal, scenario);
  await deps.repo.saveGoal(next.goal);
  await deps.repo.savePlan(next.plan);
  return { ...next, outcome: await saveOutcome(next.goal, next.plan, deps) };
}

export async function feedbackFor(slug: DemoSlug, f: { target: string; kind: Feedback["kind"] }, deps: Deps): Promise<Feedback> {
  const feedback: Feedback = { customerId: customerIdOf(slug), ...f, at: DEMO_AS_OF };
  await deps.repo.saveFeedback(feedback);
  return feedback;
}

export async function getOutcome(goalId: string, deps: Deps): Promise<Outcome> {
  const { goal, plan } = await goalAndPlan(goalId, deps);
  return trackOutcome(goal, plan, await deps.repo.getConsents(goalId));
}

export async function resetFor(slug: DemoSlug, deps: Deps): Promise<void> {
  await deps.repo.reset(customerIdOf(slug));
}

// ---------- demo presets (shapes agreed with T1: backend/T7 "Injected presets") ----------

export const PRESETS = ["income_drop", "cost_overrun", "partner_delay"] as const;
export const PARTNER_DELAY_DAYS = 120;
export type Preset = (typeof PRESETS)[number];

const lastFullMonth = (asOf: string): string => {
  const d = new Date(`${asOf.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(0); // last day of the previous month
  return d.toISOString().slice(0, 7);
};

/** The events a preset injects, computed from the customer's real facts. */
export async function presetEvents(slug: DemoSlug, preset: Preset, deps: Deps): Promise<Event[]> {
  const s = await loadSituation(slug, { ...deps, repo: { ...deps.repo, getInjected: async () => [] } });
  const customerId = s.ctx.customerId;
  const id = (suffix: string) => `inj:${customerId}:${preset}:${suffix}`;
  if (preset === "income_drop") {
    const month = lastFullMonth(s.asOf);
    const salaries = s.facts.transactions.filter((t) => t.category === "salary" && t.bookedOn.startsWith(month));
    const salary = salaries.reduce((n, t) => n + t.amount, 0) || s.ctx.monthlyIncome;
    const benefits = Math.round(0.6 * salary * 100) / 100;
    return [
      { id: id("exclude"), customerId, at: `${month}-01`, source: "profile", kind: EXCLUDE_TX_KIND, detail: { transactionIds: salaries.map((t) => t.id) } },
      {
        id: id("benefits"),
        customerId,
        at: salaries[0]?.bookedOn ?? `${month}-25`,
        source: "transaction",
        kind: "tx:benefits",
        detail: { amount: benefits, inflow: benefits, outflow: 0, counterparty: "RVA/ONEM", category: "benefits" },
      },
    ];
  }
  const insulation = s.rules.providers.find((p) => p.capability === "quote_insulation" && p.sourceRow === 131);
  if (preset === "cost_overrun") {
    const overrunEur = Math.round(0.4 * (insulation?.costEur ?? 15_000));
    return [
      {
        id: id("quote"),
        customerId,
        at: s.asOf,
        source: "partner",
        kind: "partner:quote_received",
        sourceRow: 131,
        detail: { overrunPct: 40, overrunEur, capability: "quote_insulation", sourceRow: 131, partner: insulation?.provider ?? "Impact us today" },
      },
    ];
  }
  return [
    {
      id: id("delay"),
      customerId,
      at: s.asOf,
      source: "partner",
      kind: "partner:delayed",
      sourceRow: 131,
      // 120 days: beyond the default goal's slack (~85 days), so the delay visibly threatens the deadline.
      detail: { delayDays: PARTNER_DELAY_DAYS, capability: "quote_insulation", sourceRow: 131, partner: insulation?.provider ?? "Impact us today" },
    },
  ];
}

export async function injectFor(slug: DemoSlug, input: { preset: Preset } | { event: Omit<Event, "customerId"> }, deps: Deps): Promise<Event[]> {
  const customerId = customerIdOf(slug);
  const events = "preset" in input ? await presetEvents(slug, input.preset, deps) : [{ ...input.event, customerId }];
  for (const e of events) await deps.repo.injectEvent(customerId, e);
  return events;
}

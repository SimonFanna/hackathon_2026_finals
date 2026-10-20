// T7 — runPipeline: facts → events → signals → context → moments → intents → decision → plans → disruptions → Kate.
// Pure engine stages, wired to the data layer. Stages owned by T1 / T2 / T8 come from ./stages (stand-ins until they land).
import type { Db } from "./data/db";
import { DEMO_AS_OF, withInjected } from "./data/facts";
import { customerIdOf, loadFacts, loadRules, type Source } from "./data/load";
import type { DemoSlug } from "./data/personas";
import type { Repo } from "./data/repo";
import { decide } from "./engine/decision";
import { assessImpact, detectDisruptions } from "./engine/disruption";
import { deriveIntents } from "./engine/intents";
import { detectMoments } from "./engine/moments";
import { replan } from "./engine/replan";
import { applyDecisionRules } from "./engine/rules";
import { trackOutcome } from "./engine/tracker";
import { type Engine, engine as defaultEngine } from "./stages";
import type {
  ActiveMoment,
  CustomerFacts,
  Decision,
  Disruption,
  Event,
  Feedback,
  Goal,
  Impact,
  Intent,
  KateMessage,
  Outcome,
  PersistentContext,
  Plan,
  RuleSet,
  Scenario,
  Signal,
} from "./types";

export interface Deps {
  db: Db | null;
  repo: Repo;
  engine?: Engine;
}

export interface PipelineResult {
  facts: { customerId: number; firstName: string };
  events: number;
  signals: Signal[];
  context: PersistentContext;
  moments: ActiveMoment[];
  intents: Intent[];
  decisions: Decision[];
  goals: Goal[];
  plans: Plan[];
  outcomes: Outcome[];
  disruptions: Disruption[];
  impacts: Impact[];
  scenarios: Scenario[];
  kate: KateMessage | null;
  timings: Record<string, number>;
  source: { facts: Source; rules: Source; state: Repo["kind"] };
  asOf: string;
}

const ACTIVE: Goal["status"][] = ["proposed", "confirmed", "at_risk", "replanned"];

function stopwatch() {
  const timings: Record<string, number> = {};
  let last = performance.now();
  const lap = (stage: string) => {
    const now = performance.now();
    timings[stage] = Math.round((now - last) * 10) / 10;
    last = now;
  };
  return { timings, lap };
}

/** Everything up to the persistent context: shared by the pipeline and the goal / consent routes. */
export interface Situation {
  slug: DemoSlug;
  asOf: string;
  facts: CustomerFacts;
  rules: RuleSet;
  events: Event[];
  signals: Signal[];
  ctx: PersistentContext;
  /** Context without the injected demo events: "before" for disruption detection. */
  ctxBefore: PersistentContext;
  feedback: Feedback[];
  goals: Goal[];
  source: PipelineResult["source"];
}

export async function loadSituation(slug: DemoSlug, deps: Deps, asOf: string = DEMO_AS_OF, lap: (s: string) => void = () => {}): Promise<Situation> {
  const engine = deps.engine ?? defaultEngine;
  const customerId = customerIdOf(slug);
  const [f, r, injected, feedback, goals] = await Promise.all([
    loadFacts(slug, asOf, deps.db),
    loadRules(deps.db),
    deps.repo.getInjected(customerId),
    deps.repo.getFeedback(customerId),
    deps.repo.getGoals(customerId),
  ]);
  lap("load");
  const rules = r.rules;
  const facts = withInjected(f.facts, injected);
  const events = engine.toEvents(facts);
  lap("events");
  const signals = engine.extractSignals(events, rules.signalRules, asOf);
  lap("signals");
  const ctx = engine.buildContext(facts, signals);
  let ctxBefore = ctx;
  if (injected.length) {
    const plain = { ...f.facts, injectedEvents: [] };
    ctxBefore = engine.buildContext(plain, engine.extractSignals(engine.toEvents(plain), rules.signalRules, asOf));
  }
  lap("context");
  return { slug, asOf, facts, rules, events, signals, ctx, ctxBefore, feedback, goals, source: { facts: f.source, rules: r.source, state: deps.repo.kind } };
}

export async function runPipeline(slug: DemoSlug, deps: Deps, opts: { asOf?: string } = {}): Promise<PipelineResult> {
  const engine = deps.engine ?? defaultEngine;
  const { timings, lap } = stopwatch();
  const s = await loadSituation(slug, deps, opts.asOf ?? DEMO_AS_OF, lap);
  const { asOf, rules, ctx, signals, feedback } = s;

  const moments = detectMoments(signals, ctx, rules, asOf, engine.model);
  lap("moments");
  const intents = deriveIntents(moments, ctx, rules);
  lap("intents");
  const decisions = decide(intents, moments, ctx, feedback, s.goals, rules, asOf);
  lap("decision");

  const disruptions = detectDisruptions(signals, s.ctxBefore, ctx, rules, asOf, s.events);
  const goals: Goal[] = [];
  const plans: Plan[] = [];
  const outcomes: Outcome[] = [];
  const impacts: Impact[] = [];
  const scenarios: Scenario[] = [];
  for (const goal of s.goals.filter((g) => ACTIVE.includes(g.status))) {
    const stored = await deps.repo.getPlan(goal.id);
    if (!stored) continue;
    let plan = applyDecisionRules(stored, ctx, feedback, rules);
    const goalImpacts = disruptions.map((d) => ({ d, impact: assessImpact(d, goal, plan, ctx) }));
    const hit = goalImpacts.filter(({ impact }) => impact.broken.length > 0 || impact.affectedStepIds.length > 0);
    for (const { d, impact } of hit) {
      impacts.push(impact);
      scenarios.push(...replan(goal, plan, ctx, impact, rules, asOf, d));
    }
    if (hit.some(({ impact }) => impact.broken.length > 0)) plan = { ...plan, atRisk: true };
    goals.push(hit.length && goal.status !== "replanned" ? { ...goal, status: "at_risk" } : goal);
    plans.push(plan);
    outcomes.push(trackOutcome(goal, plan, await deps.repo.getConsents(goal.id)));
  }
  lap("plans");

  let kate: KateMessage | null = null;
  const dt = impacts[0] && rules.disruptionTypes.find((t) => t.code === impacts[0].disruption);
  if (impacts[0] && dt && scenarios.length) {
    kate = engine.kateForScenarios(impacts[0], scenarios.filter((x) => x.goalId === impacts[0].goalId), ctx, dt);
  } else {
    const speaker = decisions.find((d) => d.level === "ASK" || d.level === "SUGGEST");
    const intent = speaker && rules.intents.find((i) => i.code === speaker.intent);
    const moment = speaker && moments.find((m) => m.type === (speaker.moment ?? intents.find((i) => i.code === speaker.intent)?.moment));
    if (speaker && intent && moment) kate = engine.kateForDecision(speaker, intent, ctx, moment, asOf);
  }
  lap("kate");

  await Promise.all([
    deps.repo.saveRunOutput(ctx.customerId, signals, intents),
    deps.repo.saveScenarios(scenarios),
    ...outcomes.map((o) => deps.repo.saveOutcome(o)),
    kate ? deps.repo.saveKateMessage(kate) : null,
  ]);
  lap("persist");

  return {
    facts: { customerId: ctx.customerId, firstName: ctx.firstName },
    events: s.events.length,
    signals,
    context: ctx,
    moments,
    intents,
    decisions,
    goals,
    plans,
    outcomes,
    disruptions,
    impacts,
    scenarios,
    kate,
    timings,
    source: s.source,
    asOf,
  };
}

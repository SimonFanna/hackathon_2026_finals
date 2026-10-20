// T7 — load the whole RuleSet (every task's config tables) from Supabase, snake_case → contract types.
import type {
  Capability,
  DecisionRule,
  DisruptionType,
  GoalTemplate,
  IntentDef,
  IntentRule,
  ModelWeight,
  MomentRule,
  Provider,
  ReplanStrategy,
  RuleSet,
  SignalRule,
  TemplateStep,
} from "../types";
import { type Db, must, num, numOrNull, one } from "./db";

type Loader<K extends keyof RuleSet> = (db: Db) => Promise<RuleSet[K]>;

const signalRules: Loader<"signalRules"> = async (db) =>
  (await must(db.from("signal_rules").select("code, label, match, strength, window_days, half_life_days, is_disruption").order("code"))).map(
    (r): SignalRule => ({
      code: r.code,
      label: r.label,
      match: r.match,
      strength: num(r.strength),
      windowDays: num(r.window_days),
      halfLifeDays: num(r.half_life_days),
      isDisruption: r.is_disruption,
    }),
  );

const modelWeights: Loader<"modelWeights"> = async (db) =>
  (await must(db.from("model_weights").select("model_version, moment, feature, weight").order("model_version").order("moment").order("feature"))).map(
    (r): ModelWeight => ({ modelVersion: r.model_version, moment: r.moment, feature: r.feature, weight: num(r.weight) }),
  );

const momentRules: Loader<"momentRules"> = async (db) =>
  (
    await must(
      db.from("moment_rules").select("moment, label, weights, bias, context_condition, context_scores, requires_signal, expiry_days").order("moment"),
    )
  ).map(
    (r): MomentRule => ({
      moment: r.moment,
      label: r.label,
      weights: r.weights,
      bias: num(r.bias),
      context: r.context_condition,
      contextScores: r.context_scores,
      requiresSignal: r.requires_signal,
      expiryDays: num(r.expiry_days),
    }),
  );

const intents: Loader<"intents"> = async (db) =>
  (
    await must(db.from("intents").select("code, label, goal_type, ask_threshold, suggest_threshold, is_commercial, kate_ask, kate_suggest").order("code"))
  ).map(
    (r): IntentDef => ({
      code: r.code,
      label: r.label,
      goalType: r.goal_type,
      askThreshold: num(r.ask_threshold),
      suggestThreshold: num(r.suggest_threshold),
      kateAsk: r.kate_ask,
      kateSuggest: r.kate_suggest,
      commercial: r.is_commercial,
    }),
  );

const intentRules: Loader<"intentRules"> = async (db) =>
  (await must(db.from("intent_rules").select("moment, intent, weight, condition").order("id"))).map(
    (r): IntentRule => ({ moment: r.moment, intent: r.intent, weight: num(r.weight), condition: r.condition }),
  );

const capabilities: Loader<"capabilities"> = async (db) =>
  (await must(db.from("capabilities").select("code, label, ecosystem, what_it_solves, required_data, output").order("code"))).map(
    (r): Capability => ({ code: r.code, label: r.label, ecosystem: r.ecosystem, whatItSolves: r.what_it_solves, requiredData: r.required_data, output: r.output }),
  );

type ItemRel = { name: string; partners: { name: string } | { name: string }[] | null };
const providers: Loader<"providers"> = async (db) =>
  (
    await must(
      db
        .from("capability_providers")
        .select("capability_code, source_row, lead_time_days, cost_eur, priority, estimates, ecosystem_items(name, partners(name))")
        .order("capability_code")
        .order("source_row"),
    )
  ).map((r): Provider => {
    const item = one(r.ecosystem_items as ItemRel | ItemRel[] | null);
    const partner = one(item?.partners ?? null)?.name ?? null;
    return {
      capability: r.capability_code,
      sourceRow: r.source_row,
      itemName: item?.name ?? "",
      provider: partner ?? "KBC",
      isPartner: partner !== null,
      leadTimeDays: num(r.lead_time_days),
      costEur: numOrNull(r.cost_eur),
      priority: num(r.priority),
      estimates: r.estimates ?? {},
    };
  });

const templates: Loader<"templates"> = async (db) => {
  const [heads, steps] = await Promise.all([
    must(db.from("goal_templates").select("goal_type, label, default_constraints, outcome").order("goal_type")),
    must(db.from("template_steps").select("goal_type, capability_code, chapter, position, depends_on, condition, why, optional").order("goal_type").order("position")),
  ]);
  return heads.map(
    (t): GoalTemplate => ({
      goalType: t.goal_type,
      label: t.label,
      defaultConstraints: t.default_constraints ?? {},
      outcome: t.outcome,
      steps: steps
        .filter((s) => s.goal_type === t.goal_type)
        .map(
          (s): TemplateStep => ({
            goalType: s.goal_type,
            capability: s.capability_code,
            chapter: s.chapter,
            position: s.position,
            dependsOn: s.depends_on ?? [],
            condition: s.condition,
            why: s.why,
            optional: s.optional,
          }),
        ),
    }),
  );
};

const decisionRules: Loader<"decisionRules"> = async (db) =>
  (await must(db.from("decision_rules").select("id, condition, effect, priority, reason").order("priority", { ascending: false }))).map(
    (r): DecisionRule => ({ id: r.id, condition: r.condition, effect: r.effect, priority: num(r.priority), reason: r.reason }),
  );

const disruptionTypes: Loader<"disruptionTypes"> = async (db) =>
  (await must(db.from("disruption_types").select("code, signals, affects, kate_template").order("code"))).map(
    (r): DisruptionType => ({ code: r.code, signals: r.signals ?? [], affects: r.affects ?? [], kateTemplate: r.kate_template }),
  );

const replanStrategies: Loader<"replanStrategies"> = async (db) =>
  (await must(db.from("replan_strategies").select("code, applies_to, params").order("code"))).map(
    (r): ReplanStrategy => ({ code: r.code, appliesTo: r.applies_to ?? [], params: r.params ?? {} }),
  );

const LOADERS: { [K in keyof RuleSet]: Loader<K> } = {
  signalRules,
  modelWeights,
  momentRules,
  intents,
  intentRules,
  capabilities,
  providers,
  templates,
  decisionRules,
  disruptionTypes,
  replanStrategies,
};

/**
 * Every config table, in parallel. A table that is missing, unreadable or still empty falls back to
 * `fallback` (the snapshot), so one task's late migration never breaks the pipeline. `fromFallback`
 * lists the parts that did.
 */
export async function fetchRules(db: Db, fallback: RuleSet): Promise<{ rules: RuleSet; fromFallback: (keyof RuleSet)[] }> {
  const keys = Object.keys(LOADERS) as (keyof RuleSet)[];
  const results = await Promise.allSettled(keys.map((k) => (LOADERS[k] as Loader<typeof k>)(db)));
  const rules = { ...fallback };
  const fromFallback: (keyof RuleSet)[] = [];
  results.forEach((r, i) => {
    const k = keys[i];
    if (r.status === "fulfilled" && r.value.length > 0) (rules as Record<string, unknown>)[k] = r.value;
    else fromFallback.push(k);
  });
  return { rules, fromFallback };
}

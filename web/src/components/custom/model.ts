// "Your own" player (Demo V2 P5): base customer + life-signal toggles → the real moment model, client-side.
// Pure and browser-safe: the same snapshot, signal rules, features() and predict() + weights.json the backend uses.
import { snapshotFacts, snapshotRules } from "../../backend/data/snapshot";
import { DEMO_AS_OF } from "../../backend/data/facts";
import { buildContext } from "../../backend/engine/context";
import { toEvents } from "../../backend/engine/events";
import { featureLabel, predict } from "../../backend/engine/model";
import { features } from "../../backend/engine/features";
import { decay, extractSignals, saturation } from "../../backend/engine/signals";
import weightsJson from "../../backend/engine/weights.json";
import type { ModelWeight, PersistentContext, Signal } from "../../backend/types";
import type { MomentCode, SignalCode } from "../../backend/vocabulary";

const WEIGHTS = weightsJson as unknown as ModelWeight[];

export const BASES = ["sofie", "lucas", "nadia", "pieter", "els", "thomas"] as const;
export type BaseSlug = (typeof BASES)[number];

/** One line per base customer (docs/features/bank-data.md). */
export const BASE_SUMMARY: Record<BaseSlug, string> = {
  sofie: "Couple, one child, rents in Gent",
  lucas: "Single employee in Leuven",
  nadia: "Couple, owner in Antwerpen, new baby",
  pieter: "Two teenagers, owner in Mechelen",
  els: "Owner in Brugge, already well equipped",
  thomas: "Tenant in Kortrijk",
};

export interface Toggle {
  id: string;
  label: string;
  /** Every signal code the toggle stands for: switching it off removes them all. */
  codes: SignalCode[];
  /** Switched on for a customer who has none of `codes`: these are simulated as fresh signals. */
  adds: SignalCode[];
}

/** 8 human-readable life signals. Together they cover every non-disruption signal code of the model. */
export const TOGGLES: Toggle[] = [
  {
    id: "home_loan", label: "Simulated a home loan",
    codes: ["MORTGAGE_SIMULATION", "HOUSING_BUDGET_VIEW", "HOME_LOAN_VIEW", "HOME_LOAN_KATE_QUESTION", "HOME_LOAN_APPLICATION"],
    adds: ["MORTGAGE_SIMULATION", "HOUSING_BUDGET_VIEW", "HOME_LOAN_VIEW"],
  },
  {
    id: "down_payment", label: "Saving for a down payment",
    codes: ["SAVING_FOR_DOWN_PAYMENT", "PROPERTY_VALUATION_VIEW", "HOME_SEARCH_IN_APP", "RENOVATION_VIEW", "NOTARY_PAYMENT"],
    adds: ["SAVING_FOR_DOWN_PAYMENT", "PROPERTY_VALUATION_VIEW"],
  },
  {
    id: "freelance", label: "First freelance invoices",
    codes: ["FREELANCE_INCOME", "SALARY_STOPPED"],
    adds: ["FREELANCE_INCOME", "SALARY_STOPPED"],
  },
  {
    id: "start_it", label: "Read about starting a business",
    codes: ["START_IT_VIEW", "BUSINESS_ACCOUNT_VIEW", "BUSINESS_KATE_QUESTION", "BUSINESS_TOOLS_VIEW", "BUSINESS_PROTECTION_VIEW"],
    adds: ["START_IT_VIEW", "BUSINESS_ACCOUNT_VIEW", "BUSINESS_KATE_QUESTION"],
  },
  {
    id: "pro_tools", label: "Pays for pro tools and equipment",
    codes: ["ACCOUNTING_TOOL_PAYMENT", "EQUIPMENT_PURCHASE"],
    adds: ["ACCOUNTING_TOOL_PAYMENT", "EQUIPMENT_PURCHASE"],
  },
  {
    id: "baby", label: "Baby shop and family pages",
    codes: ["BABY_SPENDING", "CHILD_BORN", "CHILDCARE_PAYMENT", "FAMILY_PROTECTION_VIEW", "FAMILY_KATE_QUESTION"],
    adds: ["BABY_SPENDING", "FAMILY_PROTECTION_VIEW", "FAMILY_KATE_QUESTION"],
  },
  {
    id: "ev", label: "Looked at EV loans",
    codes: ["EV_LOAN_SIMULATION", "EV_PAGE_VIEW", "EV_KATE_QUESTION", "EV_CHARGING", "CAR_LOAN_ENDING"],
    adds: ["EV_LOAN_SIMULATION", "EV_PAGE_VIEW"],
  },
  {
    id: "pension", label: "Pension fund page views",
    codes: ["PENSION_VIEW", "RETIREMENT_KATE_QUESTION", "ESTATE_PLANNING_VIEW", "LUMP_SUM_INVESTMENT"],
    adds: ["PENSION_VIEW", "RETIREMENT_KATE_QUESTION", "ESTATE_PLANNING_VIEW"],
  },
];

/** own = the customer's real signals (start state) · sim = simulated on top of them · off = all removed. */
export type ToggleState = "own" | "sim" | "off";
export type Toggles = Record<string, ToggleState>;

/** A switch: on (own or sim) → off; off → sim. */
export const flip = (s: ToggleState | undefined): ToggleState => (s === "off" || !s ? "sim" : "off");

const RULES = new Map(snapshotRules.signalRules.map((r) => [r.code as string, r]));
/** A simulated signal: seen 3 times, the last one a week before the demo date (the real strength formula). */
const SIM_COUNT = 3;
const SIM_AGE_DAYS = 7;

export interface Base {
  slug: BaseSlug;
  name: string;
  age: number;
  signals: Signal[];
  ctx: PersistentContext;
}

const cache = new Map<BaseSlug, Base>();

/** The base customer exactly as the backend sees it offline: snapshot facts → events → signals → context. */
export function base(slug: BaseSlug): Base {
  const hit = cache.get(slug);
  if (hit) return hit;
  const facts = snapshotFacts(slug);
  const signals = extractSignals(toEvents(facts), snapshotRules.signalRules, DEMO_AS_OF).filter((s) => !s.isDisruption);
  const ctx = buildContext(facts, signals);
  const b = { slug, name: ctx.firstName, age: ctx.age, signals, ctx };
  cache.set(slug, b);
  return b;
}

/** A toggle starts on ("own") when the base customer already shows one of its signals. */
export function initialToggles(b: Base): Toggles {
  const have = new Set(b.signals.map((s) => s.code));
  return Object.fromEntries(TOGGLES.map((t) => [t.id, t.codes.some((c) => have.has(c)) ? "own" : "off"]));
}

function simulated(code: SignalCode, customerId: number): Signal {
  const rule = RULES.get(code);
  const strength = (rule?.strength ?? 0.3) * saturation(SIM_COUNT) * decay(SIM_AGE_DAYS, rule?.halfLifeDays ?? 30);
  const at = new Date(Date.parse(DEMO_AS_OF) - SIM_AGE_DAYS * 86_400_000).toISOString();
  return { code, customerId, strength: Math.round(strength * 1e4) / 1e4, at, count: SIM_COUNT, evidence: [], isDisruption: false };
}

/**
 * off → every code of the toggle is removed · own → the customer's own signals, untouched ·
 * sim → the own signals, with each `adds` code raised to a simulated fresh signal when that is stronger.
 */
export function applyToggles(b: Base, on: Toggles): Signal[] {
  const covered = new Set(TOGGLES.flatMap((t) => t.codes));
  const out = b.signals.filter((s) => !covered.has(s.code));
  for (const t of TOGGLES) {
    const state = on[t.id] ?? "off";
    if (state === "off") continue;
    const own = b.signals.filter((s) => t.codes.includes(s.code));
    if (state === "own") {
      out.push(...own);
      continue;
    }
    for (const code of t.codes) {
      const mine = own.find((s) => s.code === code);
      const sim = t.adds.includes(code) ? simulated(code, b.ctx.customerId) : undefined;
      const pick = mine && (!sim || mine.strength >= sim.strength) ? mine : sim;
      if (pick) out.push(pick);
    }
  }
  return out;
}

export type Level = "NO_ACTION" | "ASK" | "SUGGEST";

export interface MomentScore {
  moment: MomentCode;
  label: string;
  confidence: number;
  level: Level;
  goalType: string | null;
  why: { label: string; weight: number }[];
}

/** Moment → the intent whose thresholds and goal type the backend uses (rules.intentRules, weight 1). */
const INTENT_OF: Partial<Record<MomentCode, string>> = {
  HOME_BUYING: "BUY_HOME", STARTING_BUSINESS: "START_BUSINESS", NEW_PARENT: "PREPARE_FOR_BABY",
  EV_PURCHASE: "SWITCH_TO_EV", RETIREMENT_PREP: "PREPARE_RETIREMENT",
};
const INTENTS = new Map(snapshotRules.intents.map((d) => [d.code as string, d]));
const MOMENT_LABEL = new Map(snapshotRules.momentRules.map((r) => [r.moment as string, r.label]));
/** The moments the model scores (CASHFLOW_PRESSURE stays rule-based in the backend). */
export const SCORED: MomentCode[] = ["HOME_BUYING", "STARTING_BUSINESS", "NEW_PARENT", "EV_PURCHASE", "RETIREMENT_PREP"];
/** The goal types with a plan template today. */
export const PLANNABLE = new Set(snapshotRules.templates.map((t) => t.goalType as string));

function chipLabel(feature: string): string {
  const m = /^(sig|cnt)_(.+)$/.exec(feature);
  return m ? (RULES.get(m[2])?.label ?? featureLabel(feature)) : featureLabel(feature);
}

/** The model's confidence per moment (highest first), the decision level it implies and the top "why" terms. */
export function score(b: Base, signals: Signal[]): MomentScore[] {
  const x = features(signals, b.ctx);
  return SCORED.map((moment) => {
    const p = predict(moment, x, WEIGHTS);
    const def = INTENTS.get(INTENT_OF[moment] ?? "");
    const confidence = p?.confidence ?? 0;
    const level: Level = !def || confidence < def.askThreshold ? "NO_ACTION" : confidence < def.suggestThreshold ? "ASK" : "SUGGEST";
    // sig_X and cnt_X of the same signal read as one reason.
    const why: { label: string; weight: number }[] = [];
    for (const c of p?.contributions ?? []) {
      const label = chipLabel(c.feature);
      const term = c.weight * c.value;
      const same = why.find((w) => w.label === label);
      if (same) same.weight += term;
      else why.push({ label, weight: term });
    }
    return { moment, label: MOMENT_LABEL.get(moment) ?? moment, confidence, level, goalType: def?.goalType ?? null, why: why.slice(0, 3) };
  }).sort((a, b) => b.confidence - a.confidence);
}

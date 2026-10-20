// T7 — runtime state: Supabase tables (secret key, server only) or an in-memory store (offline / tests).
import type { Consent, Event, Feedback, Goal, Intent, KateMessage, Outcome, Plan, Scenario, Signal } from "../types";
import { type Db, must, type Row } from "./db";

export interface Repo {
  readonly kind: "supabase" | "memory";
  getGoals(customerId: number): Promise<Goal[]>;
  getGoal(goalId: string): Promise<Goal | null>;
  saveGoal(g: Goal): Promise<void>;
  /** Latest plan version of a goal. */
  getPlan(goalId: string): Promise<Plan | null>;
  savePlan(p: Plan): Promise<void>;
  getConsents(goalId: string): Promise<Consent[]>;
  saveConsent(c: Consent): Promise<void>;
  getFeedback(customerId: number): Promise<Feedback[]>;
  saveFeedback(f: Feedback): Promise<void>;
  saveScenarios(s: Scenario[]): Promise<void>;
  getScenario(id: string): Promise<Scenario | null>;
  injectEvent(customerId: number, e: Event): Promise<void>;
  getInjected(customerId: number): Promise<Event[]>;
  saveKateMessage(m: KateMessage): Promise<void>;
  listKateMessages(customerId: number): Promise<KateMessage[]>;
  saveOutcome(o: Outcome): Promise<void>;
  /** The latest signals and intents of a run (overwritten each time). */
  saveRunOutput(customerId: number, signals: Signal[], intents: Intent[]): Promise<void>;
  /** Wipe this persona's runtime state (demo reset). */
  reset(customerId: number): Promise<void>;
}

// ---------- memory ----------

interface Store {
  goals: Map<string, Goal>;
  plans: Map<string, Plan[]>;
  consents: Map<string, Consent[]>;
  feedback: Map<number, Feedback[]>;
  scenarios: Map<string, Scenario>;
  injected: Map<number, Event[]>;
  kate: Map<number, KateMessage[]>;
  outcomes: Map<string, Outcome>;
}

const emptyStore = (): Store => ({
  goals: new Map(),
  plans: new Map(),
  consents: new Map(),
  feedback: new Map(),
  scenarios: new Map(),
  injected: new Map(),
  kate: new Map(),
  outcomes: new Map(),
});

const clone = <T>(v: T): T => structuredClone(v);

export function memoryRepo(store: Store = emptyStore()): Repo {
  const push = <K, V>(m: Map<K, V[]>, k: K, v: V): void => void m.set(k, [...(m.get(k) ?? []), clone(v)]);
  return {
    kind: "memory",
    getGoals: async (customerId) => [...store.goals.values()].filter((g) => g.customerId === customerId).map(clone),
    getGoal: async (id) => clone(store.goals.get(id) ?? null),
    saveGoal: async (g) => void store.goals.set(g.id, clone(g)),
    getPlan: async (goalId) => clone((store.plans.get(goalId) ?? []).at(-1) ?? null),
    savePlan: async (p) => {
      const versions = (store.plans.get(p.goalId) ?? []).filter((v) => v.version !== p.version);
      store.plans.set(p.goalId, [...versions, clone(p)].sort((a, b) => a.version - b.version));
    },
    getConsents: async (goalId) => (store.consents.get(goalId) ?? []).map(clone),
    saveConsent: async (c) => push(store.consents, c.goalId, c),
    getFeedback: async (customerId) => (store.feedback.get(customerId) ?? []).map(clone),
    saveFeedback: async (f) => push(store.feedback, f.customerId, f),
    saveScenarios: async (s) => s.forEach((x) => store.scenarios.set(x.id, clone(x))),
    getScenario: async (id) => clone(store.scenarios.get(id) ?? null),
    injectEvent: async (customerId, e) => push(store.injected, customerId, e),
    getInjected: async (customerId) => (store.injected.get(customerId) ?? []).map(clone),
    saveKateMessage: async (m) => void store.kate.set(m.customerId, [...(store.kate.get(m.customerId) ?? []).filter((x) => x.id !== m.id), clone(m)]),
    listKateMessages: async (customerId) => (store.kate.get(customerId) ?? []).map(clone),
    saveOutcome: async (o) => void store.outcomes.set(o.goalId, clone(o)),
    saveRunOutput: async () => {},
    reset: async (customerId) => {
      for (const [id, g] of store.goals) {
        if (g.customerId !== customerId) continue;
        store.goals.delete(id);
        store.plans.delete(id);
        store.consents.delete(id);
        store.outcomes.delete(id);
        for (const [sid, s] of store.scenarios) if (s.goalId === id) store.scenarios.delete(sid);
      }
      store.feedback.delete(customerId);
      store.injected.delete(customerId);
      store.kate.delete(customerId);
    },
  };
}

// ---------- Supabase ----------

type Payload<T> = { payload: T };
const payloads = <T>(rows: Row[] | null): T[] => (rows ?? []).map((r) => (r as Payload<T>).payload);

export function supabaseRepo(db: Db): Repo {
  const ok = async (q: PromiseLike<{ error: { message: string } | null }>) => {
    const { error } = await q;
    if (error) throw new Error(error.message);
  };
  return {
    kind: "supabase",
    getGoals: async (customerId) =>
      payloads(await must(db.from("goals").select("payload").eq("customer_id", customerId).order("created_at"))),
    getGoal: async (id) => (await must<Row | null>(db.from("goals").select("payload").eq("id", id).maybeSingle()))?.payload ?? null,
    saveGoal: (g) =>
      ok(db.from("goals").upsert({ id: g.id, customer_id: g.customerId, payload: g, updated_at: new Date().toISOString() })),
    getPlan: async (goalId) =>
      (await must<Row | null>(db.from("plans").select("payload").eq("goal_id", goalId).order("version", { ascending: false }).limit(1).maybeSingle()))
        ?.payload ?? null,
    savePlan: (p) =>
      ok(db.from("plans").upsert({ id: p.id, goal_id: p.goalId, version: p.version, reason: p.reason, payload: p }, { onConflict: "id" })),
    getConsents: async (goalId) =>
      (await must(db.from("consents").select("goal_id, step_id, partner, field, granted, at").eq("goal_id", goalId).order("id"))).map(
        (r): Consent => ({ goalId: r.goal_id, stepId: r.step_id, partner: r.partner, field: r.field, granted: r.granted, at: r.at }),
      ),
    saveConsent: (c) =>
      ok(db.from("consents").insert({ goal_id: c.goalId, step_id: c.stepId, partner: c.partner, field: c.field, granted: c.granted, at: c.at })),
    getFeedback: async (customerId) =>
      (await must(db.from("feedback").select("customer_id, target, kind, at").eq("customer_id", customerId).order("id"))).map(
        (r): Feedback => ({ customerId: r.customer_id, target: r.target, kind: r.kind, at: r.at }),
      ),
    saveFeedback: (f) => ok(db.from("feedback").insert({ customer_id: f.customerId, target: f.target, kind: f.kind, at: f.at })),
    saveScenarios: async (s) => {
      if (s.length) await ok(db.from("scenarios").upsert(s.map((x) => ({ id: x.id, goal_id: x.goalId, payload: x }))));
    },
    getScenario: async (id) => (await must<Row | null>(db.from("scenarios").select("payload").eq("id", id).maybeSingle()))?.payload ?? null,
    injectEvent: (customerId, e) => ok(db.from("injected_events").upsert({ id: e.id, customer_id: customerId, payload: e })),
    getInjected: async (customerId) =>
      payloads(await must(db.from("injected_events").select("payload").eq("customer_id", customerId).order("created_at"))),
    saveKateMessage: (m) => ok(db.from("kate_messages").upsert({ id: m.id, customer_id: m.customerId, payload: m })),
    listKateMessages: async (customerId) =>
      payloads(await must(db.from("kate_messages").select("payload").eq("customer_id", customerId).order("created_at"))),
    saveOutcome: (o) => ok(db.from("outcomes").upsert({ goal_id: o.goalId, payload: o, computed_at: new Date().toISOString() })),
    saveRunOutput: async (customerId, signals, intents) => {
      await Promise.all([ok(db.from("signals").delete().eq("customer_id", customerId)), ok(db.from("customer_intents").delete().eq("customer_id", customerId))]);
      await Promise.all([
        signals.length ? ok(db.from("signals").upsert(signals.map((s) => ({ customer_id: customerId, code: s.code, payload: s })))) : null,
        intents.length ? ok(db.from("customer_intents").upsert(intents.map((i) => ({ customer_id: customerId, intent: i.code, payload: i })))) : null,
      ]);
    },
    reset: async (customerId) => {
      // goals cascade to plans, scenarios, consents and outcomes
      await Promise.all(
        ["goals", "feedback", "injected_events", "kate_messages", "signals", "customer_intents"].map((t) => ok(db.from(t).delete().eq("customer_id", customerId))),
      );
    },
  };
}

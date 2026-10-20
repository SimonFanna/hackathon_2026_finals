// T7 — loadFacts / loadRules: Supabase first, the offline snapshot when Supabase is missing or failing.
// Results are cached per server instance (facts 5 min, rules 1 min): the bank history does not change during the demo.
import type { CustomerFacts, RuleSet } from "../types";
import type { Db } from "./db";
import { DEMO_AS_OF, fetchFacts } from "./facts";
import type { DemoSlug } from "./personas";
import { fetchRules } from "./rules";
import { snapshotFacts, snapshotRules } from "./snapshot";

export type Source = "supabase" | "snapshot";

const FACTS_TTL_MS = 5 * 60_000;
const RULES_TTL_MS = 60_000;
const factsCache = new Map<string, { at: number; facts: CustomerFacts }>();
let rulesCache: { at: number; rules: RuleSet } | null = null;

const warned = new Set<string>();
function warnOnce(what: string, err: unknown) {
  if (warned.has(what)) return;
  warned.add(what);
  console.warn(`[backend] ${what}: using the offline snapshot (${err instanceof Error ? err.message : String(err)})`);
}

function nextDay(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Snapshot facts seen at `asOf` (the snapshot is taken at DEMO_AS_OF). */
function snapshotAt(slug: DemoSlug, asOf: string): CustomerFacts {
  const f = snapshotFacts(slug);
  if (asOf === f.asOf) return f;
  const until = nextDay(asOf);
  return { ...f, asOf, transactions: f.transactions.filter((t) => t.bookedOn <= asOf), appEvents: f.appEvents.filter((e) => e.occurredAt < until) };
}

/** The customer id of a demo persona (stable: the generator is deterministic). */
export const customerIdOf = (slug: DemoSlug): number => snapshotFacts(slug).customer.id;

export async function loadFacts(slug: DemoSlug, asOf: string = DEMO_AS_OF, db: Db | null): Promise<{ facts: CustomerFacts; source: Source }> {
  if (!db) return { facts: snapshotAt(slug, asOf), source: "snapshot" };
  const key = `${slug}@${asOf}`;
  const hit = factsCache.get(key);
  if (hit && Date.now() - hit.at < FACTS_TTL_MS) return { facts: structuredClone(hit.facts), source: "supabase" };
  try {
    const facts = await fetchFacts(db, slug, asOf);
    if (!facts) throw new Error(`persona ${slug} not found`);
    factsCache.set(key, { at: Date.now(), facts });
    return { facts: structuredClone(facts), source: "supabase" };
  } catch (err) {
    warnOnce(`facts for ${slug}`, err);
    return { facts: snapshotAt(slug, asOf), source: "snapshot" };
  }
}

export async function loadRules(db: Db | null): Promise<{ rules: RuleSet; source: Source }> {
  if (!db) return { rules: snapshotRules, source: "snapshot" };
  if (rulesCache && Date.now() - rulesCache.at < RULES_TTL_MS) return { rules: rulesCache.rules, source: "supabase" };
  try {
    const { rules } = await fetchRules(db, snapshotRules);
    rulesCache = { at: Date.now(), rules };
    return { rules, source: "supabase" };
  } catch (err) {
    warnOnce("rules", err);
    return { rules: snapshotRules, source: "snapshot" };
  }
}

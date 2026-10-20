// T7 — `npm run snapshot`: export the RuleSet and the 6 demo personas' facts to JSON, so the demo runs offline.
// Reads Supabase with SUPABASE_SECRET_KEY, or the publishable key (demo personas and config tables are public).
// Config tables that are missing or empty in Supabase are taken from the task fixtures (fixture-rules.ts).
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEMO_AS_OF, fetchFacts } from "../src/backend/data/facts";
import { fixtureRules } from "../src/backend/data/fixture-rules";
import { DEMO_SLUGS } from "../src/backend/data/personas";
import { fetchRules } from "../src/backend/data/rules";

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and a key (web/.env.local, see web/.env.example).");
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const dir = join(import.meta.dirname, "..", "src", "backend", "data", "snapshot");
const write = (name: string, value: unknown) => writeFileSync(join(dir, name), JSON.stringify(value, null, 1) + "\n");

const { rules, fromFallback } = await fetchRules(db, fixtureRules);
write("rules.json", rules);
console.log(`rules.json: ${Object.entries(rules).map(([k, v]) => `${k} ${(v as unknown[]).length}`).join(", ")}`);
if (fromFallback.length) console.log(`  from fixtures (not in Supabase yet): ${fromFallback.join(", ")}`);

for (const slug of DEMO_SLUGS) {
  const facts = await fetchFacts(db, slug, DEMO_AS_OF);
  if (!facts) throw new Error(`demo persona not found: ${slug}`);
  write(`facts-${slug}.json`, facts);
  console.log(`facts-${slug}.json: ${facts.transactions.length} transactions, ${facts.appEvents.length} app events`);
}

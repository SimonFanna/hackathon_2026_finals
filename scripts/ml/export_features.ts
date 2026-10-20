// T2 · Training export: every customer's facts → T1 (events, signals, context) → T2 features → CSV.
// Runs the exact serving code, so training and production can never compute features differently.
//
//   python3 scripts/bank_data/generate.py && python3 scripts/ml/export_facts.py
//   npx --yes tsx@4.19.2 scripts/ml/export_features.ts        # → scripts/ml/out/features.csv
import { createReadStream, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { buildContext } from "../../web/src/backend/engine/context";
import { toEvents } from "../../web/src/backend/engine/events";
import { FEATURE_NAMES, features } from "../../web/src/backend/engine/features";
import { extractSignals } from "../../web/src/backend/engine/signals";
import type { CustomerFacts, SignalRule } from "../../web/src/backend/types";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, "out");
const rules: SignalRule[] = JSON.parse(readFileSync(join(here, "../../web/src/backend/fixtures/t1-signal-rules.json"), "utf8"));

async function main() {
  const lines = createInterface({ input: createReadStream(join(OUT, "facts.jsonl"), "utf8"), crlfDelay: Infinity });
  const rows: string[] = [["customer_id", ...FEATURE_NAMES].join(",")];
  const t0 = performance.now();
  for await (const line of lines) {
    if (!line.trim()) continue;
    const facts = JSON.parse(line) as CustomerFacts;
    const signals = extractSignals(toEvents(facts), rules, facts.asOf);
    const x = features(signals, buildContext(facts, signals));
    rows.push([facts.customer.id, ...FEATURE_NAMES.map((f) => +x[f].toFixed(6))].join(","));
  }
  writeFileSync(join(OUT, "features.csv"), rows.join("\n") + "\n");
  const ms = performance.now() - t0;
  console.log(`wrote ${join(OUT, "features.csv")}: ${rows.length - 1} customers × ${FEATURE_NAMES.length} features in ${ms.toFixed(0)} ms (T1+T2 ${((ms / (rows.length - 1)) * 1000).toFixed(0)} µs/customer)`);
}

main();

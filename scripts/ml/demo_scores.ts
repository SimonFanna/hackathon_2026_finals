// Prints the trained model's confidence per moment for the 6 demo personas (for docs and the pitch).
//   npx --yes tsx@4.19.2 scripts/ml/demo_scores.ts
import { readFileSync } from "node:fs";
import { buildContext } from "../../web/src/backend/engine/context";
import { toEvents } from "../../web/src/backend/engine/events";
import { features } from "../../web/src/backend/engine/features";
import { predict } from "../../web/src/backend/engine/model";
import { extractSignals } from "../../web/src/backend/engine/signals";
import type { CustomerFacts, ModelWeight, MomentCode, SignalRule } from "../../web/src/backend/types";

const read = (p: string) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const facts: CustomerFacts[] = read("../../web/src/backend/fixtures/t1-demo-facts.json");
const rules: SignalRule[] = read("../../web/src/backend/fixtures/t1-signal-rules.json");
const weights: ModelWeight[] = read("../../web/src/backend/engine/weights.json");
const moments: MomentCode[] = ["HOME_BUYING", "STARTING_BUSINESS", "NEW_PARENT", "EV_PURCHASE", "RETIREMENT_PREP"];

console.log(["persona".padEnd(8), ...moments.map((m) => m.slice(0, 11).padStart(12))].join(""));
for (const f of facts) {
  const signals = extractSignals(toEvents(f), rules, f.asOf);
  const x = features(signals, buildContext(f, signals));
  const ps = moments.map((m) => predict(m, x, weights)!);
  console.log([String(f.customer.slug).padEnd(8), ...ps.map((p) => p.confidence.toFixed(3).padStart(12))].join(""));
  const best = ps.reduce((a, b) => (b.confidence > a.confidence ? b : a));
  console.log("         why:", best.contributions.map((c) => c.feature).join(", "));
}

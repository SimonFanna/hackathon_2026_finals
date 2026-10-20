import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { INTENT_CODES, MOMENT_CODES } from "../vocabulary";
import { t3IntentRules, t3Intents, t3MomentRules } from "./t3-rules";

const sql = readFileSync(join(__dirname, "../../../../supabase/migrations/20261020121000_intents.sql"), "utf8");
const lit = (v: unknown) => `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;

describe("T3 rules: TS fixture ↔ migration seed", () => {
  it("covers every moment and intent code", () => {
    expect(t3MomentRules.map((r) => r.moment).sort()).toEqual([...MOMENT_CODES].sort());
    expect(t3Intents.map((r) => r.code).sort()).toEqual([...INTENT_CODES].sort());
  });

  it("the migration seeds the same weights, conditions and thresholds", () => {
    for (const r of t3MomentRules) {
      expect(sql).toContain(`('${r.moment}', '${r.label}', ${lit(r.weights)}, ${r.bias},`);
      expect(sql).toContain(lit(r.contextScores ?? []));
    }
    for (const r of t3Intents) expect(sql).toContain(`('${r.code}', '${r.label}', ${r.goalType ? `'${r.goalType}'` : "null"}, ${r.askThreshold}, ${r.suggestThreshold}, ${r.commercial !== false},`);
    for (const r of t3IntentRules) expect(sql).toContain(`('${r.moment}', '${r.intent}', ${r.weight}, ${r.condition ? lit(r.condition) : "null"})`);
  });
});

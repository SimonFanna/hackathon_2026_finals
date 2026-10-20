import { describe, expect, it } from "vitest";
import catalogue from "../data/snapshot/catalogue.json";
import { t4Rules } from "../fixtures/t4-rules";
import type { RuleSet } from "../types";
import { capability, coverageReport, getTemplate, providersFor, validateRegistry } from "./registry";

const rules: RuleSet = {
  signalRules: [],
  modelWeights: [],
  momentRules: [],
  intents: [],
  intentRules: [],
  decisionRules: [],
  disruptionTypes: [],
  replanStrategies: [],
  ...t4Rules,
};

describe("registry", () => {
  it("loads both templates with steps in position order", () => {
    const home = getTemplate("BUY_AND_PREPARE_HOME", rules);
    expect(home.steps).toHaveLength(15);
    expect(home.steps.map((s) => s.position)).toEqual([...home.steps.map((s) => s.position)].sort((a, b) => a - b));
    expect(getTemplate("START_BUSINESS", rules).steps).toHaveLength(9);
  });

  it("throws on an unknown goal type or capability", () => {
    expect(() => getTemplate("WELCOME_BABY", rules)).toThrow(/Unknown goal type/);
    expect(() => capability("nope" as never, rules)).toThrow(/Unknown capability/);
  });

  it("sorts providers best first", () => {
    const solar = providersFor("evaluate_solar", rules);
    expect(solar.map((p) => p.sourceRow)).toEqual([129, 130]);
    expect(providersFor("set_up_invoicing", rules).map((p) => p.provider)).toEqual(["Billit", "Soluz.io", "KBC"]);
  });

  it("is valid: every step has a provider, dependencies stay in the template, no cycle, every row exists", () => {
    expect(validateRegistry(rules, catalogue)).toEqual([]);
  });

  it("detects a dependency cycle", () => {
    const home = getTemplate("BUY_AND_PREPARE_HOME", rules);
    const broken: RuleSet = {
      ...rules,
      templates: [{ ...home, steps: home.steps.map((s) => (s.capability === "estimate_budget" ? { ...s, dependsOn: ["insure_loan"] } : s)) }],
    };
    expect(validateRegistry(broken).join("\n")).toMatch(/cycle/);
  });

  it("copies item names and partners from the catalogue", () => {
    const byRow = new Map(catalogue.map((c) => [c.sourceRow, c]));
    for (const p of rules.providers) {
      const item = byRow.get(p.sourceRow)!;
      expect(p.itemName, `row ${p.sourceRow}`).toBe(item.name);
      expect(p.provider, `row ${p.sourceRow}`).toBe(item.partner ?? "KBC");
      expect(p.isPartner).toBe(item.partner !== null);
    }
  });

  it("offers alternatives: at least 2 capabilities have 2 or more providers (T6 SWAP_PROVIDER)", () => {
    const multi = rules.capabilities.filter((c) => providersFor(c.code, rules).length >= 2);
    expect(multi.length).toBeGreaterThanOrEqual(2);
  });

  it("involves at least 3 partners in the home template", () => {
    const steps = getTemplate("BUY_AND_PREPARE_HOME", rules).steps;
    const partners = new Set(steps.flatMap((s) => providersFor(s.capability, rules).filter((p) => p.isPartner).map((p) => p.provider)));
    expect(partners.size).toBeGreaterThanOrEqual(3);
  });

  it("reports catalogue coverage", () => {
    const r = coverageReport(rules, catalogue);
    expect(r.total).toBe(229);
    expect(r.mapped).toBe(new Set(rules.providers.map((p) => p.sourceRow)).size);
    expect(r.byEcosystem.Housing.mapped).toBeGreaterThan(0);
    expect(Object.values(r.byEcosystem).reduce((n, e) => n + e.total, 0)).toBe(229);
  });
});

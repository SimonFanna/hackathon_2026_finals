// T4 — Capability registry & goal templates (pipeline stage ⑦, data + lookup). Pure functions over the RuleSet.
import type { Capability, CapabilityCode, GoalTemplate, GoalType, Provider, RuleSet } from "../types";

export interface CatalogueRow {
  sourceRow: number;
  ecosystem: string;
}

/** The goal template, steps in position order. Throws on an unknown goal type. */
export function getTemplate(goalType: GoalType, rules: RuleSet): GoalTemplate {
  const t = rules.templates.find((x) => x.goalType === goalType);
  if (!t) throw new Error(`Unknown goal type: ${goalType}`);
  return { ...t, steps: [...t.steps].sort((a, b) => a.position - b.position) };
}

/** Every provider of a capability, best first: highest priority, then lowest catalogue row. */
export function providersFor(code: CapabilityCode, rules: RuleSet): Provider[] {
  return rules.providers.filter((p) => p.capability === code).sort((a, b) => b.priority - a.priority || a.sourceRow - b.sourceRow);
}

/** Throws on an unknown capability code. */
export function capability(code: CapabilityCode, rules: RuleSet): Capability {
  const c = rules.capabilities.find((x) => x.code === code);
  if (!c) throw new Error(`Unknown capability: ${code}`);
  return c;
}

/** How much of the KBC catalogue is wired as a capability provider ("X of the 229 items"). */
export function coverageReport(
  rules: RuleSet,
  catalogue: CatalogueRow[],
): { mapped: number; total: number; byEcosystem: Record<string, { mapped: number; total: number }> } {
  const wired = new Set(rules.providers.map((p) => p.sourceRow));
  const byEcosystem: Record<string, { mapped: number; total: number }> = {};
  let mapped = 0;
  for (const item of catalogue) {
    const e = (byEcosystem[item.ecosystem] ??= { mapped: 0, total: 0 });
    e.total += 1;
    if (wired.has(item.sourceRow)) {
      e.mapped += 1;
      mapped += 1;
    }
  }
  return { mapped, total: catalogue.length, byEcosystem };
}

/**
 * Integrity problems in the registry, as human-readable strings (empty = valid):
 * unknown capabilities, steps without a provider, dependencies outside the template, cycles,
 * and, when the catalogue is given, provider rows that do not exist in it.
 */
export function validateRegistry(rules: RuleSet, catalogue?: CatalogueRow[]): string[] {
  const problems: string[] = [];
  const codes = new Set(rules.capabilities.map((c) => c.code));
  const rows = catalogue ? new Set(catalogue.map((c) => c.sourceRow)) : null;

  for (const p of rules.providers) {
    if (!codes.has(p.capability)) problems.push(`provider ${p.sourceRow}: unknown capability ${p.capability}`);
    if (rows && !rows.has(p.sourceRow)) problems.push(`provider ${p.capability}/${p.sourceRow}: source_row not in the catalogue`);
  }

  for (const t of rules.templates) {
    const inTemplate = new Set(t.steps.map((s) => s.capability));
    if (inTemplate.size !== t.steps.length) problems.push(`${t.goalType}: a capability appears twice`);
    for (const s of t.steps) {
      if (!codes.has(s.capability)) problems.push(`${t.goalType}: unknown capability ${s.capability}`);
      if (!rules.providers.some((p) => p.capability === s.capability)) problems.push(`${t.goalType}: ${s.capability} has no provider`);
      for (const d of s.dependsOn) {
        if (!inTemplate.has(d)) problems.push(`${t.goalType}: ${s.capability} depends on ${d}, which is not in the template`);
      }
    }
    const cycle = findCycle(t);
    if (cycle) problems.push(`${t.goalType}: dependency cycle ${cycle.join(" → ")}`);
  }
  return problems;
}

/** A dependency cycle inside one template, or null. Depth-first search with an explicit path. */
function findCycle(t: GoalTemplate): CapabilityCode[] | null {
  const deps = new Map(t.steps.map((s) => [s.capability, s.dependsOn] as const));
  const done = new Set<CapabilityCode>();
  const visit = (code: CapabilityCode, path: CapabilityCode[]): CapabilityCode[] | null => {
    if (path.includes(code)) return [...path.slice(path.indexOf(code)), code];
    if (done.has(code)) return null;
    for (const d of deps.get(code) ?? []) {
      const c = visit(d, [...path, code]);
      if (c) return c;
    }
    done.add(code);
    return null;
  };
  for (const s of t.steps) {
    const c = visit(s.capability, []);
    if (c) return c;
  }
  return null;
}

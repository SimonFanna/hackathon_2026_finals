import type { Journey } from "../../engine";

// A backend-built journey carries its own step ids, while the scripted surprises (persona.outcome) refer to
// the local ids. Both describe the same catalogue items, so a step is matched by its catalogue item name
// (fallback: the step title), and the UI keeps one id space per side: local for the engine, actual for the build.

const norm = (v: string | undefined) => (v ?? "").trim().toLowerCase();

export interface StepAlias {
  /** actual (journey) id → local id, when the item exists in the local journey. */
  toLocal: Map<string, string>;
  /** local id → actual (journey) id. */
  toActual: Map<string, string>;
  /** Local steps the actual journey never offered: the customer could not skip them. */
  unoffered: Set<string>;
}

export function buildStepAlias(local: Journey, actual: Journey | undefined): StepAlias {
  const toLocal = new Map<string, string>();
  const toActual = new Map<string, string>();
  const unoffered = new Set<string>();
  if (!actual || actual === local) return { toLocal, toActual, unoffered };
  const byItem = new Map(local.steps.map((s) => [norm(s.catalogueItem), s.id]));
  const byTitle = new Map(local.steps.map((s) => [norm(s.title), s.id]));
  for (const s of actual.steps) {
    const l = (s.catalogueItem && byItem.get(norm(s.catalogueItem))) || byTitle.get(norm(s.title));
    if (!l) continue;
    toLocal.set(s.id, l);
    if (!toActual.has(l)) toActual.set(l, s.id);
  }
  for (const s of local.steps) if (!toActual.has(s.id)) unoffered.add(s.id);
  return { toLocal, toActual, unoffered };
}

/**
 * The accepted set the local engine understands: the journey's ids, their local aliases, and the local steps
 * the journey never offered (an option can't be "not available because you skipped it" then).
 */
export function withLocalAliases(accepted: Iterable<string>, alias: StepAlias): Set<string> {
  const out = new Set<string>(alias.unoffered);
  for (const id of accepted) {
    out.add(id);
    const l = alias.toLocal.get(id);
    if (l) out.add(l);
  }
  return out;
}

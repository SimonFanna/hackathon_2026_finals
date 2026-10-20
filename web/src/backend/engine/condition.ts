import type { Condition, Goal, PersistentContext } from "../types";

/**
 * Scope a Condition is evaluated against. `ctx` and `goal` are the contract;
 * callers may add more roots (e.g. `signals`) and reference them by dotted path.
 */
export interface ConditionScope {
  ctx: PersistentContext;
  goal?: Goal;
  [root: string]: unknown;
}

/** Resolve a dotted path ("ctx.properties.0.epc") inside the scope. Missing → undefined. */
export function resolvePath(scope: unknown, path: string): unknown {
  let cur: unknown = scope;
  for (const key of path.split(".")) {
    if (cur === null || cur === undefined || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

/** Ordering of two numbers or two strings (ISO dates compare correctly); null when not comparable. */
function compare(a: unknown, b: unknown): number | null {
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "string" && typeof b === "string") return a < b ? -1 : a > b ? 1 : 0;
  return null;
}

function evalLeaf(actual: unknown, op: NonNullable<Condition["op"]>, value: unknown): boolean {
  switch (op) {
    case "exists": {
      const present = actual !== undefined && actual !== null;
      return value === false ? !present : present;
    }
    case "eq":
      return actual === value;
    case "neq":
      return actual !== value;
    case "in":
      if (!Array.isArray(value)) return false;
      return Array.isArray(actual) ? actual.some((a) => value.includes(a)) : value.includes(actual);
    case "contains":
      if (Array.isArray(actual)) return Array.isArray(value) ? value.some((v) => actual.includes(v)) : actual.includes(value);
      return typeof actual === "string" && typeof value === "string" && actual.includes(value);
    case "gt": {
      const c = compare(actual, value);
      return c !== null && c > 0;
    }
    case "gte": {
      const c = compare(actual, value);
      return c !== null && c >= 0;
    }
    case "lt": {
      const c = compare(actual, value);
      return c !== null && c < 0;
    }
    case "lte": {
      const c = compare(actual, value);
      return c !== null && c <= 0;
    }
  }
}

/**
 * Tiny JSON logic. `null` / `{}` → true. Every key present on a node must hold
 * (so `{ all, field, op }` is an AND of both). `op` defaults to "eq".
 * Unknown paths are `undefined`: comparisons are false, `exists` is false.
 */
export function evalCondition(cond: Condition | null | undefined, scope: ConditionScope): boolean {
  if (!cond) return true;
  if (cond.all && !cond.all.every((c) => evalCondition(c, scope))) return false;
  if (cond.any && !cond.any.some((c) => evalCondition(c, scope))) return false;
  if (cond.not && evalCondition(cond.not, scope)) return false;
  if (cond.field !== undefined) return evalLeaf(resolvePath(scope, cond.field), cond.op ?? "eq", cond.value);
  return true;
}

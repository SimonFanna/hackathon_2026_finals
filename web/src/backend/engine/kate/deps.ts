import type { CapabilityCode, Consent, Goal, PersistentContext, Plan, RuleSet, Scenario } from "../../types";

/** Same shape as T6 `WhatIf` (engine/scenarios.ts). Structural typing keeps both in sync without importing T6 internals. */
export type WhatIf = {
  budget?: number;
  incomeDeltaPct?: number;
  termYears?: number;
  rateDeltaPct?: number;
  deadline?: string;
  dropCapabilities?: CapabilityCode[];
};

/**
 * Engine functions Kate calls. Injected so the Kate module stays testable on its own fixtures:
 * the API route wires T6 `simulate`, T5 `sharedData` and T5 `affordability`.
 * Kate never computes a plan figure herself: when a dependency is missing she says she can't simulate it.
 */
export interface KateDeps {
  simulate?: (goal: Goal, plan: Plan, ctx: PersistentContext, change: WhatIf, rules: RuleSet, asOf: string) => Scenario[];
  sharedData?: (plan: Plan, consents: Consent[]) => { partner: string; fields: string[] }[];
  affordability?: (ctx: PersistentContext) => { maxMonthlyPayment: number; maxPrincipal: number; ownFunds: number };
}

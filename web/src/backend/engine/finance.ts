import type { PersistentContext } from "../types";

/** Illustrative 25-year fixed home-loan rate (see docs/assumptions.md). Not a KBC offer. */
export const DEFAULT_RATE_PCT = 3.2;
/** Illustrative debt-service-to-income cap: new + existing monthly debt ≤ 42% of net income. */
export const DSTI_CAP = 0.42;
export const DEFAULT_TERM_YEARS = 25;

/** Monthly payment of a fixed-rate annuity loan. */
export function annuity(principal: number, annualRatePct: number, termYears: number): number {
  if (principal <= 0 || termYears <= 0) return 0;
  const n = termYears * 12;
  const r = annualRatePct / 100 / 12;
  if (r === 0) return principal / n;
  return (principal * r) / (1 - Math.pow(1 + r, -n));
}

/** Largest principal a given monthly payment can repay (inverse of `annuity`). */
export function maxPrincipal(monthlyPayment: number, annualRatePct: number, termYears: number): number {
  if (monthlyPayment <= 0 || termYears <= 0) return 0;
  const n = termYears * 12;
  const r = annualRatePct / 100 / 12;
  if (r === 0) return monthlyPayment * n;
  return (monthlyPayment * (1 - Math.pow(1 + r, -n))) / r;
}

/** What the customer can take on, from the persistent context. All figures are estimates. */
export function affordability(
  ctx: PersistentContext,
  annualRatePct: number = DEFAULT_RATE_PCT,
  termYears: number = DEFAULT_TERM_YEARS,
): { maxMonthlyPayment: number; maxPrincipal: number; ownFunds: number } {
  const room = ctx.monthlyIncome * DSTI_CAP - ctx.monthlyDebt;
  const maxMonthlyPayment = Math.max(0, Math.round(room / 50) * 50);
  const ownFunds = Math.max(0, Math.floor(ctx.savings / 5000) * 5000);
  return {
    maxMonthlyPayment,
    maxPrincipal: Math.round(maxPrincipal(maxMonthlyPayment, annualRatePct, termYears)),
    ownFunds,
  };
}

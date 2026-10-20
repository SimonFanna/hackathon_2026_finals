// T6 — Multi-goal arbitration: goals share one monthly capacity and one pot of own funds. Pure.
import type { Goal, PersistentContext, Plan } from "../types";
import { affordability } from "./finance";
import { eur, monthlyPayment } from "./replan-util";

const ACTIVE: Goal["status"][] = ["proposed", "confirmed", "at_risk", "replanned"];
const FAR_FUTURE = "9999-12-31";

export interface Allocation { goalId: string; maxMonthlyPayment: number; ownFunds: number; priority: number }

const GOAL_LABEL: Record<string, string> = {
  BUY_AND_PREPARE_HOME: "home purchase",
  START_BUSINESS: "business start",
  WELCOME_BABY: "baby preparation",
  SWITCH_TO_EV: "EV purchase",
  PREPARE_RETIREMENT: "retirement plan",
};
const label = (g: Goal) => GOAL_LABEL[g.type] ?? g.type;

/**
 * Order goals (a goal waits for the goals it depends on, then earliest deadline, then oldest),
 * then hand out monthly capacity and own funds greedily. `conflicts` says what does not fit.
 */
export function arbitrate(
  goals: Goal[], plans: Plan[], ctx: PersistentContext,
): { allocations: Allocation[]; conflicts: string[] } {
  const aff = affordability(ctx);
  const active = goals.filter((g) => ACTIVE.includes(g.status));
  const planOf = (g: Goal) =>
    plans.filter((p) => p.goalId === g.id).reduce<Plan | undefined>((a, b) => (!a || b.version > a.version ? b : a), undefined);

  // Topological order on dependsOn (only among active goals), ties: deadline, createdAt, id.
  const byKey = (a: Goal, b: Goal) =>
    (a.constraints.deadline ?? FAR_FUTURE).localeCompare(b.constraints.deadline ?? FAR_FUTURE) ||
    a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
  const ids = new Set(active.map((g) => g.id));
  const ordered: Goal[] = [];
  const pending = [...active].sort(byKey);
  while (pending.length) {
    const i = pending.findIndex((g) => g.dependsOn.every((d) => !ids.has(d) || ordered.some((o) => o.id === d)));
    ordered.push(...pending.splice(i === -1 ? 0 : i, 1)); // i = -1 only on a dependency cycle: break it
  }

  let monthlyLeft = aff.maxMonthlyPayment;
  let fundsLeft = aff.ownFunds;
  const allocations: Allocation[] = [];
  const short: { goal: Goal; monthly: number; funds: number }[] = [];
  ordered.forEach((g, i) => {
    const plan = planOf(g);
    const needMonthly = plan ? monthlyPayment(plan) : g.constraints.maxMonthlyPayment ?? 0;
    const needFunds = g.constraints.ownFunds ?? 0;
    const m = Math.min(needMonthly, monthlyLeft);
    const f = Math.min(needFunds, fundsLeft);
    monthlyLeft -= m;
    fundsLeft -= f;
    allocations.push({ goalId: g.id, maxMonthlyPayment: m, ownFunds: f, priority: i + 1 });
    if (needMonthly > m || needFunds > f) short.push({ goal: g, monthly: needMonthly - m, funds: needFunds - f });
  });

  const conflicts: string[] = [];
  for (const s of short) {
    const before = ordered.slice(0, ordered.indexOf(s.goal)).map(label);
    const together = before.length ? `${label(s.goal)} and ${before.join(" and ")} together` : `${label(s.goal)} alone`;
    if (s.monthly > 0) conflicts.push(`${cap(together)} exceed your monthly capacity by ${eur(s.monthly)}.`);
    if (s.funds > 0) conflicts.push(`${cap(together)} need ${eur(s.funds)} more own funds than you have.`);
  }
  return { allocations, conflicts };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

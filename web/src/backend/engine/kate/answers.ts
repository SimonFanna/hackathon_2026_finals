// Deterministic answers to plan questions. They are the offline fallback AND the facts the LLM rephrases.
import type { Consent, Goal, PersistentContext, Plan, PlanStep, RuleSet, Scenario } from "../../types";
import type { KateDeps, WhatIf } from "./deps";
import { kateWhy } from "./messages";
import { capabilitiesOf, type Route } from "./router";
import { ancestors, dependants, eur, GOAL_NOUN, joinAnd, keyTradeoffs, planMonthlyPayment, stepLabel } from "./text";

export interface QaInput {
  ctx: PersistentContext;
  goal: Goal;
  plan: Plan;
  consents: Consent[];
  rules: RuleSet;
  asOf: string;
}

export interface DraftAnswer {
  route: Route["kind"];
  text: string;
  scenarios?: Scenario[];
  /** Everything the answer is allowed to rely on. Sent to the LLM as the only source of truth. */
  facts: Record<string, unknown>;
}

const fieldWords = (f: string) => f.replace(/_/g, " ");

function describeChange(c: WhatIf): string {
  const parts: string[] = [];
  if (c.budget !== undefined) parts.push(`the home costs ${eur(c.budget)}`);
  if (c.termYears !== undefined) parts.push(`you borrow over ${c.termYears} years`);
  if (c.incomeDeltaPct !== undefined) parts.push(`your income ${c.incomeDeltaPct < 0 ? "drops" : "rises"} by ${Math.abs(c.incomeDeltaPct)}%`);
  if (c.rateDeltaPct !== undefined) parts.push(`the rate ${c.rateDeltaPct < 0 ? "falls" : "rises"} by ${Math.abs(c.rateDeltaPct)} point${Math.abs(c.rateDeltaPct) === 1 ? "" : "s"}`);
  if (c.dropCapabilities?.length) parts.push(`you leave ${c.dropCapabilities.length === 1 ? "that step" : "those steps"} for later`);
  return joinAnd(parts);
}

function scenarioFacts(s: Scenario) {
  return {
    label: s.label,
    monthlyPayment: s.monthlyPayment,
    deadline: s.deadline,
    tradeoffs: s.tradeoffs,
    probabilityOfSuccessPct: Math.round(s.probabilityOfSuccess * 100),
    brokenChecks: s.plan.checks.filter((c) => !c.ok).map((c) => c.message),
  };
}

/** Compact, customer-safe view of the plan: no ids, no other customer, no internal scores. */
export function planFacts(input: QaInput) {
  const { goal, plan, rules, ctx } = input;
  const byId = new Map(plan.steps.map((s) => [s.id, s]));
  return {
    customerFirstName: ctx.firstName,
    goal: { type: goal.type, status: goal.status, constraints: goal.constraints, priorities: goal.priorities },
    monthlyPaymentNow: planMonthlyPayment(plan),
    checks: plan.checks.map((c) => ({ constraint: c.constraint, ok: c.ok, actual: c.actual, limit: c.limit, message: c.message })),
    steps: [...plan.steps]
      .sort((a, b) => a.order - b.order)
      .filter((s) => s.display !== "HIDDEN")
      .map((s) => ({
        order: s.order,
        step: stepLabel(s, rules),
        provider: s.provider.provider,
        partner: s.provider.isPartner,
        status: s.status,
        display: s.display,
        why: s.why,
        after: s.dependsOn.map((id) => byId.get(id)).filter((d): d is PlanStep => !!d).map((d) => stepLabel(d, rules)),
        estimates: s.estimates,
      })),
  };
}

function runSimulate(input: QaInput, change: WhatIf, deps: KateDeps): Scenario[] | null {
  if (!deps.simulate) return null;
  try {
    return deps.simulate(input.goal, input.plan, input.ctx, change, input.rules, input.asOf);
  } catch {
    return null;
  }
}

function whatIfText(change: WhatIf, scenarios: Scenario[] | null, now: number | null, maxPay: number | undefined): string {
  if (!scenarios?.length) {
    return "I can't run that simulation right now. Your KBC advisor can do it with you, or try again in a moment.";
  }
  // T6 simulate(): [0] is the change as asked, the next ones are fixes when it breaks a constraint.
  const [asked, ...fixes] = scenarios;
  const out: string[] = [];
  const pay = asked.monthlyPayment;
  const head = `If ${describeChange(change)}`;
  if (pay === null) out.push(`${head}: ${asked.label}.`);
  else if (now !== null && Math.abs(pay - now) < 1) out.push(`${head}, your monthly payment stays about ${eur(pay)}.`);
  else out.push(`${head}, your monthly payment would be about ${eur(pay)}${now !== null ? ` (now ${eur(now)})` : ""}.`);
  const broken = asked.plan.checks.filter((c) => !c.ok);
  if (broken.length) {
    out.push(broken.map((c) => c.message).join(" "));
    if (fixes.length) {
      const opts = fixes.slice(0, 2).map((f) => `${f.label}${f.monthlyPayment !== null ? ` (about ${eur(f.monthlyPayment)}/month)` : ""}`);
      out.push(`To make it fit: ${opts.join(", or ")}.`);
    }
  } else {
    if (pay !== null && maxPay !== undefined) out.push(`That still fits your ${eur(maxPay)} monthly limit.`);
    const trade = keyTradeoffs(asked);
    if (trade.length) out.push(`Trade-off: ${trade.join("; ")}.`);
  }
  out.push("Nothing has changed in your plan: this is only a simulation, with estimated figures.");
  return out.join(" ");
}

function whyText(input: QaInput, stepIds: string[], question: string): string {
  const { plan, ctx, rules } = input;
  const steps = stepIds.map((id) => plan.steps.find((s) => s.id === id)).filter((s): s is PlanStep => !!s);
  if (steps.length === 1) return kateWhy(plan, steps[0].id, ctx, rules);

  // "Why A before B?": A = the partner (or first) steps named, B = the rest.
  const q = question.toLowerCase();
  const named = steps.filter((s) => s.provider.isPartner && q.includes(s.provider.provider.toLowerCase()));
  const first = named.length ? named : [steps[0]];
  const second = steps.filter((s) => !first.includes(s));
  const firstIds = new Set(first.map((s) => s.id));
  const subject = named.length ? named[0].provider.provider : stepLabel(first[0], rules);

  const direct = second.filter((b) => [...ancestors(plan, b.id)].some((id) => firstIds.has(id)));
  // The customer may say "the loan" for a loan that is not the one waiting: look for any finance step that waits.
  const waiting = direct.length
    ? direct
    : plan.steps.filter((s) => s.capability.startsWith("finance_") && [...ancestors(plan, s.id)].some((id) => firstIds.has(id)));

  const out: string[] = [];
  if (waiting.length) {
    const w = waiting[0];
    // Prefer the step the waiting one depends on directly: its "why" is the actual reason.
    const feeder = first.find((a) => w.dependsOn.includes(a.id)) ?? first.find((a) => ancestors(plan, w.id).has(a.id)) ?? first[0];
    out.push(`${subject} comes first because your ${stepLabel(w, rules).toLowerCase()} needs its result.`);
    out.push(feeder.why, w.why);
    const parallel = second.filter((b) => !waiting.includes(b) && !ancestors(plan, b.id).has(feeder.id));
    if (parallel.length) out.push(`Your ${joinAnd(parallel.map((s) => stepLabel(s, rules).toLowerCase()))} doesn't wait for it: both can run in parallel.`);
  } else {
    out.push(`${subject} doesn't block ${joinAnd(second.map((s) => stepLabel(s, rules).toLowerCase())) || "the rest"}: they can run in parallel.`);
    out.push(kateWhy(plan, first[0].id, ctx, rules));
  }
  return out.join(" ");
}

function shareText(input: QaInput, partner: string | null, deps: KateDeps): { text: string; shared: { partner: string; fields: string[] }[] } {
  const { plan, consents } = input;
  // Without T5 `sharedData`, fall back to the granted consents themselves.
  const shared = deps.sharedData
    ? deps.sharedData(plan, consents)
    : [...new Set(consents.filter((c) => c.granted).map((c) => c.partner))].map((p) => ({
        partner: p,
        fields: [...new Set(consents.filter((c) => c.granted && c.partner === p).map((c) => c.field))],
      }));

  const partners = partner ? [partner] : [...new Set(plan.steps.filter((s) => s.provider.isPartner).map((s) => s.provider.provider))];
  const lines = partners.map((p) => {
    const got = shared.find((x) => x.partner === p)?.fields ?? [];
    if (got.length) return `${p} receives only: ${joinAnd(got.map(fieldWords))}, because you approved it.`;
    const asked = [...new Set(plan.steps.filter((s) => s.provider.provider === p).flatMap((s) => s.dataRequested))];
    return asked.length
      ? `${p} receives nothing yet. At that step it would ask for ${joinAnd(asked.map(fieldWords))}, and only what you tick is shared.`
      : `${p} receives nothing from KBC.`;
  });
  if (!lines.length) lines.push("No partner is involved in your plan, so nothing is shared outside KBC.");
  lines.push("You can withdraw a consent at any time in your plan.");
  return { text: lines.join(" "), shared };
}

function laterText(input: QaInput, stepIds: string[], scenarios: Scenario[] | null): string {
  const { plan, rules } = input;
  const steps = plan.steps.filter((s) => stepIds.includes(s.id));
  const label = joinAnd(steps.map((s) => stepLabel(s, rules).toLowerCase()));
  const blocked = steps.flatMap((s) => dependants(plan, s.id)).filter((d) => !stepIds.includes(d.id));
  const out: string[] = [];
  if (blocked.length) {
    out.push(`You can, but ${joinAnd([...new Set(blocked.map((d) => stepLabel(d, rules).toLowerCase()))])} waits for it, so ${blocked.length === 1 ? "it" : "they"} would move too.`);
  } else {
    out.push(`Yes. Nothing else in your plan waits for the ${label}, so you can do it later without delaying your purchase.`);
  }
  const yearly = steps.reduce((a, s) => a + (s.estimates.customerEurPerYear ?? 0), 0);
  if (yearly > 0) out.push(`Meanwhile you'd miss about ${eur(yearly)} a year in energy savings.`);
  const best = scenarios?.[0];
  const now = planMonthlyPayment(plan);
  if (best?.monthlyPayment != null) {
    if (now !== null && Math.abs(best.monthlyPayment - now) < 1) out.push("Your monthly payment doesn't change.");
    else out.push(`Without it now, your monthly payment would be about ${eur(best.monthlyPayment)}${now !== null ? ` instead of ${eur(now)}` : ""}.`);
  }
  out.push("All figures are estimates.");
  return out.join(" ");
}

function generalText(input: QaInput): string {
  const { plan, goal, rules } = input;
  const open = [...plan.steps].sort((a, b) => a.order - b.order).filter((s) => s.status === "todo" || s.status === "accepted" || s.status === "in_progress");
  const next = open.find((s) => s.display !== "ALREADY_COVERED" && s.display !== "HIDDEN" && s.display !== "WAIT");
  const pay = planMonthlyPayment(plan);
  const out = [`Your ${GOAL_NOUN[goal.type]} plan has ${plan.steps.filter((s) => s.display !== "HIDDEN").length} steps.`];
  if (next) out.push(`Next up: ${stepLabel(next, rules).toLowerCase()} with ${next.provider.provider}.`);
  if (pay !== null) out.push(`Estimated monthly payment: about ${eur(pay)}${goal.constraints.maxMonthlyPayment ? ` (your limit: ${eur(goal.constraints.maxMonthlyPayment)})` : ""}.`);
  out.push("You can ask me why a step comes first, what happens if the price changes, or what you share with a partner.");
  return out.join(" ");
}

const REFUSALS = {
  approval:
    "I can't approve or promise a loan: KBC only decides after a full credit review with an advisor. What I can do is show you whether your plan fits your budget, with estimated figures.",
  injection:
    "I can only help with your plan, within KBC's rules, and I can't change those rules or approve anything. Ask me why a step comes first, what happens if the price changes, or what you share with a partner.",
};

/** Build the grounded answer for a routed question. Pure, given `deps`. */
export function draftAnswer(route: Route, question: string, input: QaInput, deps: KateDeps): DraftAnswer {
  const base = planFacts(input);
  switch (route.kind) {
    case "refuse":
      return { route: route.kind, text: REFUSALS[route.reason], facts: { refusal: route.reason } };
    case "what_if": {
      const scenarios = runSimulate(input, route.change, deps);
      const text = whatIfText(route.change, scenarios, base.monthlyPaymentNow, input.goal.constraints.maxMonthlyPayment);
      return {
        route: route.kind, text, scenarios: scenarios ?? undefined,
        facts: { ...base, whatIf: route.change, simulated: scenarios?.slice(0, 2).map(scenarioFacts) ?? "unavailable" },
      };
    }
    case "later": {
      const change: WhatIf = { dropCapabilities: capabilitiesOf(input.plan, route.stepIds) };
      const scenarios = runSimulate(input, change, deps);
      return {
        route: route.kind, text: laterText(input, route.stepIds, scenarios), scenarios: scenarios ?? undefined,
        facts: { ...base, whatIf: change, simulated: scenarios?.slice(0, 1).map(scenarioFacts) ?? "unavailable" },
      };
    }
    case "why":
      return { route: route.kind, text: whyText(input, route.stepIds, question), facts: base };
    case "share": {
      const { text, shared } = shareText(input, route.partner, deps);
      return { route: route.kind, text, facts: { ...base, sharedData: shared, partnerAsked: route.partner } };
    }
    case "general":
      return { route: route.kind, text: generalText(input), facts: base };
  }
}

// T1 · ① Events: one customer's raw facts → normalised, immutable events.
// Pure and deterministic: no network, no clock (profile events are dated at `facts.asOf`).
import type { CustomerFacts, Event } from "../types";

const DAY_MS = 86_400_000;

/** Whole months from `from` to `to` (ISO dates), floored, never negative. */
export function monthsBetween(from: string, to: string): number {
  const a = new Date(from);
  const b = new Date(to);
  let months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  if (b.getUTCDate() < a.getUTCDate()) months -= 1;
  return Math.max(0, months);
}

/** Days from `at` to `asOf` (positive = in the past). */
export function ageDays(at: string, asOf: string): number {
  return (Date.parse(asOf) - Date.parse(at)) / DAY_MS;
}

/**
 * - app events → `source:"app"`, `kind` = event type, `sourceRow`, `detail` (+ `channel`);
 * - transactions → `source:"transaction"`, `kind` = `tx:<category>`, `detail` = amount, counterparty, category,
 *   outflow / inflow (absolute €) and incomeMultiple (outflow ÷ monthly income);
 * - profile events (current state, read by `profile:*` rules): one `profile:loan` per active loan (with
 *   `monthsLeft`), one `profile:child` per child (dated at the birth, with `ageMonths`), one `profile:employment`;
 * - `facts.injectedEvents` are appended as is.
 * Ids are prefixed by origin (`app:`, `tx:`, `profile:`) so evidence never collides. Sorted by date, then id.
 */
export function toEvents(facts: CustomerFacts): Event[] {
  const customerId = facts.customer.id;
  const income = facts.employment.monthlyNetIncome;
  const events: Event[] = [];

  for (const a of facts.appEvents) {
    events.push({
      id: `app:${a.id}`, customerId, at: a.occurredAt, source: "app", kind: a.eventType,
      ...(a.sourceRow !== null ? { sourceRow: a.sourceRow } : {}),
      detail: { ...a.detail, channel: a.channel },
    });
  }

  for (const t of facts.transactions) {
    const outflow = t.amount < 0 ? -t.amount : 0;
    events.push({
      id: `tx:${t.id}`, customerId, at: t.bookedOn, source: "transaction", kind: `tx:${t.category}`,
      detail: {
        amount: t.amount, counterparty: t.counterparty, category: t.category,
        outflow, inflow: t.amount > 0 ? t.amount : 0,
        incomeMultiple: income > 0 ? Math.round((outflow / income) * 100) / 100 : 0,
      },
    });
  }

  facts.loans.forEach((l, i) => {
    if (l.status !== "active") return;
    const monthsLeft = l.monthlyPayment > 0 ? Math.ceil(l.outstanding / l.monthlyPayment) : null;
    events.push({
      id: `profile:loan:${i}`, customerId, at: facts.asOf, source: "profile", kind: "profile:loan",
      ...(l.sourceRow !== null ? { sourceRow: l.sourceRow } : {}),
      detail: { loanKind: l.kind, monthlyPayment: l.monthlyPayment, outstanding: l.outstanding, monthsLeft },
    });
  });

  facts.children.forEach((c, i) => {
    events.push({
      id: `profile:child:${i}`, customerId, at: c.birthDate, source: "profile", kind: "profile:child",
      detail: { ageMonths: monthsBetween(c.birthDate, facts.asOf) },
    });
  });

  events.push({
    id: "profile:employment", customerId, at: facts.employment.since, source: "profile", kind: "profile:employment",
    detail: { status: facts.employment.status, monthlyNetIncome: income },
  });

  events.push(...facts.injectedEvents);

  return events.sort((x, y) => (x.at < y.at ? -1 : x.at > y.at ? 1 : x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
}

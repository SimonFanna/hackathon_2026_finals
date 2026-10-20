import type { Customer, Signal, SignalType } from "./types";

// Rows as returned by the Supabase Data API (synthetic bank, see docs/features/bank-data.md).
// mapBankProfile turns them into the engine's Customer + Signals; it is pure so the same
// code maps the live response and the offline snapshot.

export interface BankCustomerRow {
  id: number;
  first_name: string;
  birth_date: string;
  city: string;
  marital_status: string;
  customer_children: { count: number }[];
}

export interface BankEventRow {
  event_type: string;
  channel: string;
  occurred_at: string;
  detail: Record<string, unknown> | null;
  ecosystem_items: { name: string } | null;
}

const channelName: Record<string, string> = { kbc_mobile: "KBC Mobile", kbc_touch: "KBC Touch", kate: "Kate" };

const VIEWS = new Set(["page_view", "search"]);
const PROPERTY_ITEMS = /property valuation|search for a home|immoscoop/i;
const RENOVATION_ITEMS = /renovation|energy loan|insulation|heating|epc|certificate/i;
const RENOVATION_WORDS = /renovat|insulat|heat pump|epc|energy loan/i;

function ageOn(birth: string, today: string): number {
  const [by, bm, bd] = birth.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}

function household(marital: string, children: number): string {
  const base = marital === "married" || marital === "cohabiting" ? "Couple"
    : marital === "single" ? "Single" : marital.charAt(0).toUpperCase() + marital.slice(1);
  return children === 0 ? base : `${base}, ${children} ${children === 1 ? "child" : "children"}`;
}

const times = (n: number) => (n === 1 ? "" : ` ${n} times`);

export function mapBankProfile(row: BankCustomerRow, events: BankEventRow[], today: string): { customer: Customer; signals: Signal[] } {
  const id = String(row.id);
  const customer: Customer = {
    id, name: row.first_name, age: ageOn(row.birth_date, today), city: row.city,
    household: household(row.marital_status, row.customer_children[0]?.count ?? 0),
  };

  const sorted = [...events].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
  const item = (e: BankEventRow) => e.ecosystem_items?.name ?? "";
  const signals: Signal[] = [];
  const push = (type: SignalType, key: string, group: BankEventRow[], label: string, extra: Partial<Signal> = {}) => {
    if (group.length === 0) return;
    const sources = [...new Set(group.map((e) => channelName[e.channel] ?? e.channel))].sort();
    signals.push({
      id: `${id}-${key}`, customerId: id, type, label, source: sources.join(" · "),
      observedAt: group[group.length - 1].occurred_at.slice(0, 10), ...extra,
    });
  };

  const property = sorted.filter((e) => VIEWS.has(e.event_type) && PROPERTY_ITEMS.test(item(e)));
  push("property_search", "property_search", property, `Checked an online property valuation${times(property.length)}`);

  const sims = sorted.filter((e) => e.event_type === "simulation" && item(e) === "Home loan");
  const amount = Number(sims[sims.length - 1]?.detail?.amount) || undefined;
  push("mortgage_simulation", "mortgage_simulation", sims,
    `Ran ${sims.length} home loan simulation${sims.length === 1 ? "" : "s"}${amount ? `, the latest for €${Math.round(amount / 1000)}k` : ""}`,
    amount ? { amountEur: amount } : {});

  const renovation = sorted.filter((e) => VIEWS.has(e.event_type) && RENOVATION_ITEMS.test(item(e)));
  push("renovation_research", "renovation_views", renovation, `Looked at renovation costs and grants${times(renovation.length)}`);

  sorted
    .filter((e) => e.event_type === "kate_question" && RENOVATION_WORDS.test(String(e.detail?.question ?? "")))
    .forEach((e, i) => push("renovation_research", `kate_${i}`, [e], `Asked Kate: “${String(e.detail?.question)}”`));

  return { customer, signals };
}

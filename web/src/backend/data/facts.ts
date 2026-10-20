// T7 — load one demo customer's bank facts (CustomerFacts) from Supabase.
import type { CustomerFacts, Event } from "../types";
import { all, type Db, must, num, numOrNull, one, type Row } from "./db";

/** The date the demo runs at: the synthetic bank history ends on 2026-09-30. */
export const DEMO_AS_OF = "2026-10-01";

/** Marker event kind: the facts loader drops these transaction ids (used by the income-drop preset). */
export const EXCLUDE_TX_KIND = "facts:exclude_transactions";

type Rel = { source_row: number } | { source_row: number }[] | null;
const row = (r: Rel): number | null => one(r)?.source_row ?? null;

function nextDay(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Facts known on `asOf`: transactions booked on or before it, app events before the next day.
 * Returns null when the slug is not a demo persona. `injectedEvents` is filled by `withInjected`.
 */
export async function fetchFacts(db: Db, slug: string, asOf: string): Promise<CustomerFacts | null> {
  const c = await must<Row | null>(
    db
      .from("customers")
      .select("id, demo_slug, first_name, birth_date, region, marital_status, segment, language")
      .eq("demo_slug", slug)
      .eq("is_demo", true)
      .maybeSingle(),
  );
  if (!c) return null;
  const id = c.id as number;
  const until = nextDay(asOf);

  const [employment, housing, children, properties, accounts, loans, holdings, transactions, appEvents] = await Promise.all([
    must<Row | null>(db.from("customer_employment").select("status, monthly_net_income_eur, since").eq("customer_id", id).maybeSingle()),
    must<Row | null>(db.from("customer_housing").select("status, monthly_rent_eur").eq("customer_id", id).maybeSingle()),
    must(db.from("customer_children").select("birth_date").eq("customer_id", id).order("birth_date")),
    must(db.from("properties").select("kind, build_year, epc_label, estimated_value_eur").eq("customer_id", id).order("id")),
    must(db.from("accounts").select("kind, balance_eur, ecosystem_items(source_row)").eq("customer_id", id).order("id")),
    must(db.from("loans").select("kind, monthly_payment_eur, outstanding_eur, status, ecosystem_items(source_row)").eq("customer_id", id).order("id")),
    must(db.from("product_holdings").select("status, ecosystem_items(source_row)").eq("customer_id", id).order("id")),
    all((from, to) =>
      db
        .from("transactions")
        .select("id, booked_on, amount_eur, category, counterparty")
        .eq("customer_id", id)
        .lte("booked_on", asOf)
        .order("booked_on")
        .order("id")
        .range(from, to),
    ),
    all((from, to) =>
      db
        .from("app_events")
        .select("id, occurred_at, channel, event_type, detail, ecosystem_items(source_row)")
        .eq("customer_id", id)
        .lt("occurred_at", until)
        .order("occurred_at")
        .order("id")
        .range(from, to),
    ),
  ]);

  return {
    asOf,
    customer: {
      id,
      slug: c.demo_slug,
      firstName: c.first_name,
      birthDate: c.birth_date,
      region: c.region,
      maritalStatus: c.marital_status,
      segment: c.segment,
      language: c.language,
    },
    employment: {
      status: employment?.status ?? "employee",
      monthlyNetIncome: num(employment?.monthly_net_income_eur),
      since: employment?.since ?? asOf,
    },
    housing: { status: housing?.status ?? "tenant", monthlyRent: numOrNull(housing?.monthly_rent_eur) },
    children: (children ?? []).map((k) => ({ birthDate: k.birth_date })),
    properties: (properties ?? []).map((p) => ({
      kind: p.kind,
      buildYear: p.build_year,
      epcLabel: p.epc_label,
      estimatedValue: num(p.estimated_value_eur),
    })),
    accounts: (accounts ?? []).map((a) => ({ kind: a.kind, balance: num(a.balance_eur), sourceRow: row(a.ecosystem_items as Rel) })),
    loans: (loans ?? []).map((l) => ({
      kind: l.kind,
      monthlyPayment: num(l.monthly_payment_eur),
      outstanding: num(l.outstanding_eur),
      status: l.status,
      sourceRow: row(l.ecosystem_items as Rel),
    })),
    holdings: (holdings ?? [])
      .map((h) => ({ sourceRow: row(h.ecosystem_items as Rel), status: h.status }))
      .filter((h): h is { sourceRow: number; status: "active" | "cancelled" } => h.sourceRow !== null),
    transactions: transactions.map((t) => ({
      id: String(t.id),
      bookedOn: t.booked_on,
      amount: num(t.amount_eur),
      category: t.category,
      counterparty: t.counterparty,
    })),
    appEvents: appEvents.map((e) => ({
      id: String(e.id),
      occurredAt: e.occurred_at,
      channel: e.channel,
      eventType: e.event_type,
      sourceRow: row(e.ecosystem_items as Rel),
      detail: (e.detail ?? {}) as Record<string, unknown>,
    })),
    injectedEvents: [],
  };
}

/**
 * Add the injected demo events to the facts. Marker events (`facts:exclude_transactions`) remove
 * transactions instead of being passed on; events dated after `asOf` are ignored.
 */
export function withInjected(facts: CustomerFacts, injected: Event[]): CustomerFacts {
  const cutoff = nextDay(facts.asOf);
  const inWindow = injected.filter((e) => e.at < cutoff);
  const excluded = new Set(
    inWindow.filter((e) => e.kind === EXCLUDE_TX_KIND).flatMap((e) => (e.detail.transactionIds as string[] | undefined) ?? []),
  );
  return {
    ...facts,
    transactions: excluded.size ? facts.transactions.filter((t) => !excluded.has(t.id)) : facts.transactions,
    injectedEvents: inWindow.filter((e) => e.kind !== EXCLUDE_TX_KIND),
  };
}

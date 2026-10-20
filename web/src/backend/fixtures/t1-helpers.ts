// T1 test helpers: typed access to the committed fixtures + a minimal CustomerFacts builder.
import type { CustomerFacts, SignalRule } from "../types";
import demoFacts from "./t1-demo-facts.json";
import signalRules from "./t1-signal-rules.json";

/** The 6 demo personas' real facts (asOf 2026-10-01), exported by scripts/ml/export_facts.py. */
export const T1_DEMO_FACTS = demoFacts as unknown as CustomerFacts[];

/** The seed of `signal_rules` (same content as supabase/migrations/20261020120000_signal_rules.sql). */
export const T1_SIGNAL_RULES = signalRules as unknown as SignalRule[];

export function demoFactsFor(slug: string): CustomerFacts {
  const f = T1_DEMO_FACTS.find((x) => x.customer.slug === slug);
  if (!f) throw new Error(`no demo persona "${slug}"`);
  return structuredClone(f);
}

export function makeFacts(over: Partial<CustomerFacts> = {}): CustomerFacts {
  return {
    asOf: "2026-10-01",
    customer: { id: 42, slug: null, firstName: "Test", birthDate: "1990-06-15", region: "flanders",
                maritalStatus: "single", segment: "private", language: "nl" },
    employment: { status: "employee", monthlyNetIncome: 3000, since: "2015-01-01" },
    housing: { status: "tenant", monthlyRent: 900 },
    children: [],
    properties: [],
    accounts: [{ kind: "current", balance: 2500, sourceRow: 142 }, { kind: "savings", balance: 10000, sourceRow: 74 }],
    loans: [],
    holdings: [],
    transactions: [],
    appEvents: [],
    injectedEvents: [],
    ...over,
  };
}

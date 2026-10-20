// T7 — the demo personas (customers.is_demo). The API only accepts these slugs.
// Summaries follow docs/features/bank-data.md (synthetic customers).
export const DEMO_SLUGS = ["sofie", "lucas", "nadia", "pieter", "els", "thomas"] as const;
export type DemoSlug = (typeof DEMO_SLUGS)[number];

export const isDemoSlug = (s: string): s is DemoSlug => (DEMO_SLUGS as readonly string[]).includes(s);

/** One line per persona for the persona picker (GET /api/customers). */
export const PERSONA_SUMMARY: Record<DemoSlug, string> = {
  sofie: "32, Gent, couple with one child, tenant. Simulating home loans.",
  lucas: "29, Leuven, single employee. Freelance invoices are arriving.",
  nadia: "31, Antwerpen, couple, owner. A baby arrived this year.",
  pieter: "49, Mechelen, two teenagers, owner. His car loan is ending.",
  els: "44, Brugge, owner, already well equipped. Nothing to suggest.",
  thomas: "27, Kortrijk, tenant. Browsed home pages, but no real plan.",
};

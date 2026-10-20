import type { BankCustomerRow, BankEventRow } from "./bank";

// Offline fallback: an exact copy of Sofie's rows in Supabase (customers.demo_slug = 'sofie'),
// taken 2026-10-20 from the seeded synthetic bank. Only events that can map to a signal are kept
// (non-page-view events + page views in the Housing and Energy ecosystems). Refresh it if the seed changes.

export const sofieRow: BankCustomerRow = {
  id: 1, first_name: "Sofie", birth_date: "1994-02-15", city: "Gent", marital_status: "cohabiting",
  customer_children: [{ count: 1 }],
};

const e = (event_type: string, channel: string, occurred_at: string, item: string | null, detail: Record<string, unknown> = {}): BankEventRow =>
  ({ event_type, channel, occurred_at, detail, ecosystem_items: item ? { name: item } : null });

export const sofieEvents: BankEventRow[] = [
  e("page_view", "kbc_mobile", "2026-04-16T07:10:37+00:00", "Outstanding balance insurance"),
  e("kate_question", "kate", "2026-05-17T06:09:45+00:00", "Query income and expenses via Kate", { question: "How much did I spend on groceries this month?" }),
  e("kate_question", "kate", "2026-05-20T22:57:22+00:00", "Make transfers via Kate", { question: "Transfer 50 euros to my savings account" }),
  e("kate_question", "kate", "2026-08-09T18:33:03+00:00", "Search for documents via Kate", { question: "Find my last tax certificate" }),
  e("page_view", "kbc_mobile", "2026-08-16T17:48:18+00:00", "Home loan"),
  e("page_view", "kbc_mobile", "2026-08-19T10:32:25+00:00", "Indicative online property valuation"),
  e("simulation", "kbc_touch", "2026-08-24T12:52:24+00:00", "Home loan", { amount: 255000 }),
  e("page_view", "kbc_mobile", "2026-08-25T22:40:36+00:00", "Home loan"),
  e("page_view", "kbc_mobile", "2026-09-04T18:40:16+00:00", "Estimate renovation costs and grants"),
  e("simulation", "kbc_mobile", "2026-09-05T12:26:57+00:00", "Home loan", { amount: 476000 }),
  e("page_view", "kbc_mobile", "2026-09-07T08:03:23+00:00", "Home insurance"),
  e("simulation", "kbc_mobile", "2026-09-08T07:44:27+00:00", "Home loan", { amount: 243000 }),
  e("page_view", "kbc_mobile", "2026-09-09T02:32:27+00:00", "Calculate housing budget"),
  e("simulation", "kbc_mobile", "2026-09-11T08:38:27+00:00", "Home loan", { amount: 251000 }),
  e("page_view", "kbc_mobile", "2026-09-21T13:03:49+00:00", "Indicative online property valuation"),
  e("kate_question", "kate", "2026-09-24T21:59:21+00:00", null, { question: "Can I combine a home loan with a renovation loan?" }),
  e("page_view", "kbc_mobile", "2026-09-25T23:47:42+00:00", "Indicative online property valuation"),
  e("page_view", "kbc_mobile", "2026-09-26T16:44:17+00:00", "Estimate renovation costs and grants"),
  e("page_view", "kbc_mobile", "2026-09-26T19:47:18+00:00", "Home loan"),
];

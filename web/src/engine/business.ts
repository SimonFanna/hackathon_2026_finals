import type { Customer, IntentModel, JourneyStep, OutcomeModel, Signal } from "./types";

// Synthetic demo data for the second goal: opening a first business.
// Catalogue labels are copied verbatim from KBC_Ecosystems.xlsx; every figure is an illustrative estimate.

export const businessCustomer: Customer = {
  id: "c-002",
  name: "Lina",
  age: 29,
  city: "Antwerp",
  household: "Single, first business",
};

export const businessSignals: Signal[] = [
  { id: "b1", customerId: "c-002", type: "start_it_visit", label: "Read the Start it @KBC page three times in KBC Mobile", source: "KBC Mobile", observedAt: "2026-10-05" },
  { id: "b2", customerId: "c-002", type: "investment_loan_simulation", label: "Simulated a €45k investment loan for coffee equipment", source: "KBC Mobile", observedAt: "2026-10-11" },
  { id: "b3", customerId: "c-002", type: "company_registration", label: "Paid a company registration fee from her current account", source: "KBC account", observedAt: "2026-10-16" },
];

export const businessIntentModel: IntentModel = {
  intentId: "start_business",
  label: "Starting a business",
  weights: {
    start_it_visit: 0.25,
    investment_loan_simulation: 0.4,
    company_registration: 0.5,
    first_customer_invoices: 0.3,
  },
  askThreshold: 0.4,
  suggestThreshold: 0.75,
};

const kbc = { kind: "kbc" } as const;
const partner = (name: string) => ({ kind: "partner", name }) as const;

export const businessChapters = [
  { id: "launch", label: "Launch" },
  { id: "finance", label: "Finance it" },
  { id: "run", label: "Run it" },
  { id: "protect", label: "Protect it" },
];

export const businessSteps: JourneyStep[] = [
  {
    id: "start-it", chapter: "launch", order: 1, title: "Get a coach before you sign anything",
    why: "First business? Start it @KBC gives you a coach and a network of founders.",
    ecosystem: "Business", catalogueItem: "Start it @KBC", provider: kbc,
    dataShared: [],
    outcome: {},
  },
  {
    id: "pro-account", chapter: "launch", order: 2, title: "Open your business account",
    why: "Keep business and personal money apart from day one.",
    ecosystem: "Business", catalogueItem: "KBC Business PRO Account", provider: kbc,
    dataShared: [],
    outcome: { kbcRevenueEur: 300 },
  },
  {
    id: "investment-loan", chapter: "finance", order: 3, title: "Finance your fit-out and machines",
    why: "Your simulation says about €45k for equipment and fit-out. Let's lock it in.",
    ecosystem: "Business", catalogueItem: "Investment loan", provider: kbc,
    dataShared: [],
    outcome: { kbcRevenueEur: 3500 },
  },
  {
    id: "terminal", chapter: "finance", order: 4, title: "Take card and phone payments",
    why: "Most of your customers will pay by card or phone.",
    ecosystem: "Business", catalogueItem: "Payment terminals", provider: kbc,
    dataShared: [],
    outcome: { kbcRevenueEur: 400 },
  },
  {
    id: "billit", chapter: "run", order: 5, title: "Send invoices in two clicks",
    why: "Your catering clients pay on invoice, and Belgian businesses now invoice each other electronically.",
    purpose: "So Billit can set up your invoices and payment reminders.",
    ecosystem: "Business", catalogueItem: "E-invoicing - Billit", provider: partner("Billit"),
    dataShared: ["company number", "customer list"],
    outcome: { customerEurPerYear: 1200, partnerValueEur: 180 },
  },
  {
    id: "nowjobs", chapter: "run", order: 6, title: "Book flexible staff for busy days",
    why: "Weekends will be busy. Book extra hands without the paperwork.",
    purpose: "So NOWJOBS can match flexible workers to your shifts.",
    ecosystem: "Work and employees", catalogueItem: "Find flexible workers - NOWJOBS", provider: partner("NOWJOBS"),
    dataShared: ["company number", "shift needs"],
    outcome: { partnerValueEur: 250 },
  },
  {
    id: "go-solid", chapter: "run", order: 7, title: "Have a plan for unpaid invoices",
    why: "Most clients pay. For the ones who don't, have someone ready to collect.",
    purpose: "So Go Solid can collect an unpaid invoice the moment you ask.",
    ecosystem: "Business", catalogueItem: "Collect unpaid invoices - Go Solid", provider: partner("Go Solid"),
    dataShared: ["company number", "overdue invoices"],
    outcome: { customerEurOneOff: 2000, partnerValueEur: 150 },
  },
  {
    id: "liability", chapter: "protect", order: 8, title: "Insure your business",
    why: "A customer slips on a wet floor: you're covered.",
    ecosystem: "Business protection", catalogueItem: "Business liability insurance", provider: kbc,
    dataShared: [],
    outcome: { kbcRevenueEur: 600 },
  },
  {
    id: "income-insurance", chapter: "protect", order: 9, title: "Keep an income if you can't work",
    why: "If you're ill or injured, your income doesn't stop with you.",
    ecosystem: "Business protection", catalogueItem: "Guaranteed income insurance for the self-employed", provider: kbc,
    dataShared: [],
    outcome: { kbcRevenueEur: 700 },
  },
  {
    id: "pension", chapter: "protect", order: 10, title: "Start your self-employed pension",
    why: "Build a pension and lower your taxes from your first year.",
    ecosystem: "Pensions", catalogueItem: "Supplementary pension for the self-employed", provider: kbc,
    dataShared: [],
    outcome: { customerEurPerYear: 900, kbcRevenueEur: 400 },
  },
];

export const businessOutcome: OutcomeModel = {
  goal: "Open before summer and keep a cash buffer",
  goalReached: "Lina opened before summer and kept her cash buffer.",
  horizon: 9,
  horizonLabel: "End of the first season",
  constraints: [
    { key: "cost", label: "Start-up budget", kind: "max", unit: "eur" },
    { key: "monthly", label: "Monthly fixed costs", kind: "max", unit: "eurMonth" },
    { key: "finish", label: "Opening month", kind: "max", unit: "month" },
    { key: "buffer", label: "Cash buffer", kind: "min", unit: "eur" },
  ],
  baseline: {
    values: { cost: 82000, monthly: 6100, finish: 3, buffer: 21000 },
    limits: { cost: 90000, monthly: 7000, finish: 5, buffer: 12000 },
  },
  schedule: {
    "start-it": { start: 0, months: 2 },
    "pro-account": { start: 0, months: 1 },
    "investment-loan": { start: 1, months: 1 },
    terminal: { start: 2, months: 1 },
    billit: { start: 2, months: 1 },
    liability: { start: 2, months: 1 },
    "income-insurance": { start: 2, months: 1 },
    nowjobs: { start: 3, months: 1 },
    "go-solid": { start: 4, months: 1 },
    pension: { start: 5, months: 1 },
  },
  disruptions: [
    {
      id: "fit-out-delay", month: 1, kind: "delay",
      title: "Your fit-out contractor is 3 months late",
      detail: "Their previous job overran. The bar would open in month 6 and miss the summer terrace season.",
      source: "Fit-out contractor",
      delta: { values: { finish: 3, buffer: -6600 } },
      affects: ["terminal", "nowjobs"],
      options: [
        {
          id: "take-away", label: "Open a take-away counter first", strategy: "reorder",
          tradeoff: "Smaller menu for two months, but coffee money comes in from month 4.",
          delta: { values: { finish: -2, buffer: 4000 } },
          changes: [{ stepId: "terminal", note: "Live early for the take-away counter" }],
        },
        {
          id: "switch-contractor", label: "Switch to a contractor available now", strategy: "substitute",
          tradeoff: "Opens in month 4, but the rush costs €3,500 more.",
          delta: { values: { finish: -2, cost: 3500 } },
        },
        {
          id: "credit-line", label: "Bridge the wait with a cash credit line", strategy: "bridge",
          tradeoff: "Covers the rent, but you still miss the summer.",
          delta: { values: { buffer: 8000, monthly: 140 } },
          extraCostEur: 400, provider: kbc, catalogueItem: "Cash budget credit facility",
        },
        { id: "keep", label: "Wait for the contractor", strategy: "keep", tradeoff: "Nothing changes: you open in month 6.", delta: {} },
      ],
    },
    {
      id: "equipment-overrun", month: 3, kind: "cost",
      title: "Equipment comes in €12,500 over budget",
      detail: "The espresso machine went up in price, and the electrician needs a new circuit for it.",
      source: "Equipment supplier",
      delta: { values: { cost: 12500 } },
      affects: ["investment-loan"],
      options: [
        {
          id: "refurbished", label: "Refurbished machine, same brand", strategy: "substitute",
          tradeoff: "Saves €6,000. One-year warranty instead of three.",
          delta: { values: { cost: -6000 } },
        },
        {
          id: "lease", label: "Lease the machine instead of buying it", strategy: "refinance",
          tradeoff: "Saves €11,000 now, costs €290 more a month.",
          delta: { values: { cost: -11000, monthly: 290 } },
          extraCostEur: 1800, provider: kbc, catalogueItem: "B2B Asset Financing",
          changes: [{ stepId: "investment-loan", note: "Machine leased, loan unchanged" }],
        },
        {
          id: "bigger-loan", label: "Increase the investment loan", strategy: "refinance",
          tradeoff: "Everything as planned, €230 more a month.",
          delta: { values: { monthly: 230 }, limits: { cost: 12500 } },
          extraCostEur: 2400, provider: kbc, catalogueItem: "Investment loan",
          changes: [{ stepId: "investment-loan", note: "Topped up by €12,500" }],
        },
        { id: "keep", label: "Pay it from the budget", strategy: "keep", tradeoff: "The start-up budget no longer holds.", delta: {} },
      ],
    },
    {
      id: "late-payer", month: 6, kind: "cashflow",
      title: "Your biggest client pays 75 days late",
      detail: "The office you cater for still owes you €13,000. Your cash buffer drops below your safety line.",
      source: "Your invoices",
      delta: { values: { buffer: -13000 } },
      affects: ["go-solid", "billit"],
      options: [
        {
          id: "go-solid", label: "Let Go Solid collect it", strategy: "bridge",
          tradeoff: "Most of it back within three weeks, small fee.",
          delta: { values: { buffer: 9500 } },
          extraCostEur: 450, requiresStep: "go-solid", provider: partner("Go Solid"), catalogueItem: "Collect unpaid invoices - Go Solid",
          changes: [{ stepId: "go-solid", note: "Collecting €13,000 now" }],
        },
        {
          id: "factoring", label: "Get paid now with factoring", strategy: "bridge",
          tradeoff: "KBC advances your invoices. Fee about €1,200.",
          delta: { values: { buffer: 12000 } },
          extraCostEur: 1200, provider: kbc, catalogueItem: "Factoring and accounts receivable management",
        },
        {
          id: "advance", label: "Current account advance", strategy: "bridge",
          tradeoff: "Cash today, €90 more a month while it runs.",
          delta: { values: { buffer: 13000, monthly: 90 } },
          extraCostEur: 800, provider: kbc, catalogueItem: "Current account advance",
        },
        { id: "keep", label: "Wait for the payment", strategy: "keep", tradeoff: "Your cash buffer stays under the safety line.", delta: {} },
      ],
    },
    {
      id: "injury", month: 8, kind: "health",
      title: "You broke your wrist: six weeks off",
      detail: "You told Kate you can't work the bar for six weeks. Revenue drops, rent and staff don't.",
      source: "You told Kate",
      delta: { values: { buffer: -9000 } },
      affects: ["income-insurance", "nowjobs"],
      options: [
        {
          id: "claim", label: "Claim your guaranteed income insurance", strategy: "protect",
          tradeoff: "Pays you while you can't work. No extra cost.",
          delta: { values: { buffer: 7800 } },
          requiresStep: "income-insurance", provider: kbc, catalogueItem: "Guaranteed income insurance for the self-employed",
          changes: [{ stepId: "income-insurance", note: "Claim open: paying out" }],
        },
        {
          id: "advance", label: "Current account advance", strategy: "bridge",
          tradeoff: "Bridges the six weeks, €90 more a month.",
          delta: { values: { buffer: 9000, monthly: 90 } },
          extraCostEur: 700, provider: kbc, catalogueItem: "Current account advance",
        },
        {
          id: "cover-shifts", label: "Cover your shifts with NOWJOBS staff", strategy: "substitute",
          tradeoff: "Keeps the bar open, but staff costs eat most of the revenue.",
          delta: { values: { buffer: 5500 } },
          provider: partner("NOWJOBS"), catalogueItem: "Find flexible workers - NOWJOBS",
        },
        { id: "keep", label: "Close for six weeks", strategy: "keep", tradeoff: "Your cash buffer drops under the safety line.", delta: {} },
      ],
    },
  ],
};

import {
  businessChapters, businessCustomer, businessIntentModel, businessOutcome, businessSignals, businessSteps,
} from "./business";
import { BUY_HOUSE_ASK_THRESHOLD, BUY_HOUSE_THRESHOLD, buyHouseSignalWeights, buyHouseSteps } from "./data";
import type { Customer, IntentModel, Journey, OutcomeModel, Signal } from "./types";

// One registry, one engine. A persona is pure data: signals, an intent model, a journey and an outcome model.
// Adding a goal (retirement, a new car, a baby) means adding an entry here, not new engine code.

export interface PersonaCopy {
  quest: string;
  tagline: string;
  notification: string;
  kateLine: string;
  question: string;
  confirm: string;
  sure: string;
  pathTitle: string;
  whyNote: string;
}

export interface PersonaHome {
  accounts: { name: string; iban: string; amount: string }[];
  transactions: { label: string; date: string; amount: string }[];
}

export interface Persona {
  id: "house" | "business";
  customer: Customer;
  signals: Signal[];
  intentModel: IntentModel;
  journey: Journey;
  outcome: OutcomeModel;
  copy: PersonaCopy;
  home: PersonaHome;
}

const kbc = { kind: "kbc" } as const;
const partner = (name: string) => ({ kind: "partner", name }) as const;

// Static demo player for the home goal (the Supabase-backed Sofie stays in data.ts for the bank pipeline).
export const houseCustomer: Customer = { id: "c-001", name: "Thomas", age: 30, city: "Gent", household: "Couple, first home" };

export const houseSignals: Signal[] = [
  { id: "s1", customerId: "c-001", type: "property_search", label: "Saved 4 searches for houses built before 1980 in Immoscoop (opted into extra convenience)", source: "KBC Mobile · Immoscoop", observedAt: "2026-10-12" },
  { id: "s2", customerId: "c-001", type: "mortgage_simulation", label: "Ran a €320k home loan simulation in KBC Mobile", source: "KBC Mobile", observedAt: "2026-10-15", amountEur: 320000 },
  { id: "s3", customerId: "c-001", type: "epc_lookup", label: "Looked up the EPC label of a listed house (label E)", source: "KBC Mobile", observedAt: "2026-10-18" },
];

export const houseIntentModel: IntentModel = {
  intentId: "buy_house",
  label: "Buying a home",
  weights: buyHouseSignalWeights,
  askThreshold: BUY_HOUSE_ASK_THRESHOLD,
  suggestThreshold: BUY_HOUSE_THRESHOLD,
};

export const houseChapters = [
  { id: "find", label: "Find the house" },
  { id: "finance", label: "Finance it" },
  { id: "renovate", label: "Renovate" },
  { id: "protect", label: "Protect it" },
];

export const houseOutcome: OutcomeModel = {
  goal: "Move into a renovated home before the lease ends",
  goalReached: "Thomas moved into a renovated home, on budget, before his lease ended.",
  horizon: 12,
  horizonLabel: "Move-in day",
  constraints: [
    { key: "cost", label: "Project budget", kind: "max", unit: "eur" },
    { key: "monthly", label: "Monthly repayments", kind: "max", unit: "eurMonth" },
    { key: "finish", label: "Move-in month", kind: "max", unit: "month" },
    { key: "buffer", label: "Savings buffer", kind: "min", unit: "eur" },
  ],
  baseline: {
    values: { cost: 390000, monthly: 1720, finish: 11, buffer: 22000 },
    limits: { cost: 400000, monthly: 1900, finish: 13, buffer: 10000 },
  },
  schedule: {
    search: { start: 0, months: 2 },
    valuation: { start: 1, months: 1 },
    budget: { start: 1, months: 1 },
    "home-loan": { start: 2, months: 2 },
    epc: { start: 3, months: 1 },
    grants: { start: 4, months: 1 },
    "home-insurance": { start: 4, months: 1 },
    "energy-loan": { start: 5, months: 1 },
    insulation: { start: 6, months: 3 },
    heating: { start: 8, months: 2 },
    solar: { start: 9, months: 1 },
  },
  disruptions: [
    {
      id: "rate-rise", month: 2, kind: "rate",
      title: "Rates went up before you signed",
      detail: "The home loan rate rose 0.6 points between your simulation and the offer: €190 more a month.",
      source: "KBC Home loan · market rates",
      delta: { values: { monthly: 190 } },
      affects: ["home-loan"],
      options: [
        {
          id: "more-savings", label: "Put €9,000 more of your savings in", strategy: "rebalance",
          tradeoff: "A smaller loan. Your buffer stays above your safety line.",
          delta: { values: { monthly: -50, buffer: -9000 } },
          changes: [{ stepId: "home-loan", note: "€9,000 smaller loan" }],
        },
        {
          id: "stretch", label: "Stretch the loan from 25 to 30 years", strategy: "refinance",
          tradeoff: "Lower repayments, but about €19,000 more interest over the loan.",
          delta: { values: { monthly: -230 } },
          extraCostEur: 19000, provider: kbc, catalogueItem: "Home loan",
          changes: [{ stepId: "home-loan", note: "30 years instead of 25" }],
        },
        { id: "keep", label: "Keep the plan as it is", strategy: "keep", tradeoff: "Repayments go over what you said you can afford.", delta: {} },
      ],
    },
    {
      id: "quote-overrun", month: 4, kind: "cost",
      title: "Renovation quote: €11,800 over the estimate",
      detail: "The roof needs more insulation work than expected, and the heat pump needs a bigger unit.",
      source: "Impact us today · quote",
      delta: { values: { cost: 11800 } },
      affects: ["insulation", "heating"],
      options: [
        {
          id: "phase", label: "Phase it: heat pump in year 2", strategy: "defer",
          tradeoff: "Insulate now, heat pump next year. About €700 less saved in year one.",
          delta: { values: { cost: -14000 } },
          extraCostEur: 700,
          changes: [{ stepId: "heating", note: "Moved to year 2", shiftMonths: 12 }],
        },
        {
          id: "hybrid", label: "A hybrid heat pump instead", strategy: "substitute",
          tradeoff: "Cheaper now, but about €300 a year less saved.",
          delta: { values: { cost: -7500 } },
          extraCostEur: 3000, provider: partner("Impact us today"), catalogueItem: "Heating quote - Impact us today",
          changes: [{ stepId: "heating", note: "Hybrid heat pump" }],
        },
        {
          id: "top-up", label: "Add it to the energy loan", strategy: "refinance",
          tradeoff: "Everything now, financed: €115 more a month.",
          delta: { values: { monthly: 115 }, limits: { cost: 11800 } },
          extraCostEur: 2100, provider: kbc, catalogueItem: "Energy loan",
          changes: [{ stepId: "energy-loan", note: "Topped up by €11,800" }],
        },
        { id: "keep", label: "Pay it from the budget", strategy: "keep", tradeoff: "The project budget no longer holds.", delta: {} },
      ],
    },
    {
      id: "installer-delay", month: 6, kind: "delay",
      title: "Your installer is 3 months late",
      detail: "The insulation crew is stuck on another site. The works would end after your lease does.",
      source: "Your contractor · schedule update",
      delta: { values: { finish: 3, buffer: -2850 } },
      affects: ["insulation"],
      options: [
        {
          id: "switch-installer", label: "Switch to another installer in the network", strategy: "substitute",
          tradeoff: "Impact us today moves you to a partner crew that starts in three weeks.",
          delta: { values: { finish: -2, buffer: 1000 } },
          provider: partner("Impact us today"), catalogueItem: "Insulation quote - Impact us today",
          changes: [{ stepId: "insulation", note: "New crew, starts in 3 weeks", shiftMonths: 1 }],
        },
        {
          id: "move-in", label: "Move in on time, insulate room by room", strategy: "reorder",
          tradeoff: "No extra rent, but six weeks of works while you live there.",
          delta: { values: { finish: -3, buffer: 2850 } },
          extraCostEur: 1200,
          changes: [{ stepId: "insulation", note: "Done while you live there", shiftMonths: 2 }],
        },
        {
          id: "extend-lease", label: "Ask your landlord for 3 more months", strategy: "bridge",
          tradeoff: "The works stay as planned, but extra rent eats your buffer.",
          delta: { values: { buffer: -1000 }, limits: { finish: 3 } },
        },
        { id: "keep", label: "Wait for the crew", strategy: "keep", tradeoff: "You'd have nowhere to live for three months.", delta: {} },
      ],
    },
    {
      id: "job-loss", month: 9, kind: "income",
      title: "You lost your job",
      detail: "You told Kate your contract ends this month. Your household income drops until you find work.",
      source: "You told Kate",
      delta: { limits: { monthly: -450 } },
      affects: ["solar", "energy-loan", "home-loan"],
      options: [
        {
          id: "interest-only", label: "Interest-only for 12 months", strategy: "refinance",
          tradeoff: "€480 less a month for a year. About €4,200 more interest overall.",
          delta: { values: { monthly: -480 } },
          extraCostEur: 4200, provider: kbc, catalogueItem: "Home loan",
          changes: [{ stepId: "home-loan", note: "Interest-only for 12 months" }],
        },
        {
          id: "pause-solar", label: "Pause the solar panels", strategy: "defer",
          tradeoff: "Saves €190 a month: not enough on its own.",
          delta: { values: { monthly: -190 } },
          changes: [{ stepId: "solar", note: "Paused until you work again", shiftMonths: 12 }],
        },
        {
          id: "use-savings", label: "Cover the gap from your savings", strategy: "rebalance",
          tradeoff: "Everything keeps running, but your safety buffer runs out.",
          delta: { values: { buffer: -5000 }, limits: { monthly: 410 } },
        },
        { id: "keep", label: "Keep the plan as it is", strategy: "keep", tradeoff: "Repayments are now far above your income.", delta: {} },
      ],
    },
  ],
};

export const personas: Persona[] = [
  {
    id: "house",
    customer: houseCustomer,
    signals: houseSignals,
    intentModel: houseIntentModel,
    journey: { intentId: "buy_house", title: "From house hunt to an energy-efficient home", chapters: houseChapters, steps: buyHouseSteps },
    outcome: houseOutcome,
    copy: {
      quest: "Buy my first home",
      tagline: "A 1975 house in Gent that needs work.",
      notification: "Looks like you're house hunting. Want a hand with the plan?",
      kateLine: "You saved 4 houses on Immoscoop and simulated a €320k home loan.",
      question: "Are you planning to buy a home?",
      confirm: "Yes, I'm buying a home",
      sure: "Here's a plan for your new home.",
      pathTitle: "Your path to a home in Gent",
      whyNote: "Kate only looks at this because you search on Immoscoop inside KBC Mobile and turned on extra convenience. Nothing has been shared with anyone yet.",
    },
    home: {
      accounts: [
        { name: "Current account", iban: "BE68 •••• •••• 4721", amount: "€4,218.40" },
        { name: "Savings account", iban: "BE21 •••• •••• 0934", amount: "€38,900.00" },
      ],
      transactions: [
        { label: "Salary", date: "Today", amount: "+€3,240.00" },
        { label: "Delhaize Gent", date: "Yesterday", amount: "−€42.80" },
        { label: "Transfer to savings", date: "14 Oct", amount: "−€1,500.00" },
      ],
    },
  },
  {
    id: "business",
    customer: businessCustomer,
    signals: businessSignals,
    intentModel: businessIntentModel,
    journey: { intentId: "start_business", title: "From idea to opening day", chapters: businessChapters, steps: businessSteps },
    outcome: businessOutcome,
    copy: {
      quest: "Open my first business",
      tagline: "A specialty coffee bar in Antwerp.",
      notification: "Starting something of your own? Kate can map the whole launch with you.",
      kateLine: "You read Start it @KBC, simulated a €45k investment loan and paid a company registration fee.",
      question: "Are you starting your own business?",
      confirm: "Yes, I'm opening my coffee bar",
      sure: "Here's a launch plan for your coffee bar.",
      pathTitle: "Your path to opening day in Antwerp",
      whyNote: "Kate only looks at activity inside KBC Mobile and your KBC accounts. Nothing has been shared with anyone yet.",
    },
    home: {
      accounts: [
        { name: "Current account", iban: "BE43 •••• •••• 1187", amount: "€6,842.15" },
        { name: "Savings account", iban: "BE90 •••• •••• 5562", amount: "€24,300.00" },
      ],
      transactions: [
        { label: "Company registration fee", date: "16 Oct", amount: "−€100.50" },
        { label: "Salary", date: "1 Oct", amount: "+€2,980.00" },
        { label: "Coffee Lab Antwerp", date: "29 Sep", amount: "−€18.40" },
      ],
    },
  },
];

export function getPersona(id: string): Persona {
  const p = personas.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown persona: ${id}`);
  return p;
}

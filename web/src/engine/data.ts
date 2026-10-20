import type { Customer, JourneyStep, Signal, SignalType } from "./types";

// Synthetic demo data. Catalogue labels are copied verbatim from KBC_Ecosystems.xlsx;
// euro / kWh / CO2 figures are illustrative estimates for the demo, not KBC data.

export const demoCustomer: Customer = {
  id: "c-001",
  name: "Thomas",
  age: 30,
  city: "Gent",
  household: "Couple, first home",
};

export const demoSignals: Signal[] = [
  { id: "s1", customerId: "c-001", type: "property_search", label: "Saved 4 searches for houses built before 1980 in Immoscoop (opted into extra convenience)", source: "KBC Mobile · Immoscoop", observedAt: "2026-10-12" },
  { id: "s2", customerId: "c-001", type: "mortgage_simulation", label: "Ran a €320k home loan simulation in KBC Mobile", source: "KBC Mobile", observedAt: "2026-10-15" },
  { id: "s3", customerId: "c-001", type: "epc_lookup", label: "Looked up the EPC label of a listed house (label E)", source: "KBC Mobile", observedAt: "2026-10-18" },
];

// Below ASK: no action at all. Between ASK and SUGGEST: ask the customer. Above SUGGEST: proactively suggest the plan.
export const BUY_HOUSE_ASK_THRESHOLD = 0.4;
export const BUY_HOUSE_THRESHOLD = 0.75;

export const buyHouseSignalWeights: Partial<Record<SignalType, number>> = {
  property_search: 0.35,
  mortgage_simulation: 0.4,
  savings_transfer: 0.15,
  epc_lookup: 0.2,
  notary_contact: 0.5,
};

const kbc = { kind: "kbc" } as const;
const partner = (name: string) => ({ kind: "partner", name }) as const;

export const buyHouseSteps: JourneyStep[] = [
  {
    id: "search", chapter: "find", order: 1, title: "Find the right house",
    why: "You are already searching; keep your saved houses in one place.",
    purpose: "So Immoscoop can keep your saved houses and alerts in one place.",
    ecosystem: "Housing", catalogueItem: "Search for a home - Immoscoop", provider: partner("Immoscoop"),
    dataShared: ["search criteria", "budget range"],
    outcome: { partnerValueEur: 40 },
  },
  {
    id: "valuation", chapter: "find", order: 2, title: "Know what the house is worth",
    why: "An estate-agent valuation before you make an offer avoids overpaying.",
    purpose: "So an Immoscoop estate agent can value the house before you make an offer.",
    ecosystem: "Housing", catalogueItem: "Property valuation by an estate agent - Immoscoop", provider: partner("Immoscoop"),
    dataShared: ["property address"],
    outcome: { customerEurOneOff: 5000, partnerValueEur: 150 },
  },
  {
    id: "budget", chapter: "finance", order: 3, title: "Calculate your housing budget",
    why: "Your loan simulation suggests ~€320k; let's check it fits your income.",
    ecosystem: "Housing", catalogueItem: "Calculate housing budget", provider: kbc,
    dataShared: [],
    outcome: {},
  },
  {
    id: "home-loan", chapter: "finance", order: 4, title: "Secure your home loan",
    why: "Lock in financing so your offer is credible.",
    ecosystem: "Housing", catalogueItem: "Home loan", provider: kbc,
    dataShared: [],
    outcome: { kbcRevenueEur: 9000 },
  },
  {
    id: "epc", chapter: "renovate", order: 5, title: "Find out what the house needs",
    why: "The house has EPC label E. An inspection shows which renovation works it needs before you commit.",
    purpose: "So De Immowinkel can check the certificate and which works the house needs.",
    ecosystem: "Housing", catalogueItem: "Certificates and inspections - De Immowinkel", provider: partner("De Immowinkel"),
    dataShared: ["property address"],
    outcome: { partnerValueEur: 120 },
  },
  {
    id: "grants", chapter: "renovate", order: 6, title: "Estimate renovation costs and grants",
    why: "See what the renovation costs and which grants you are entitled to.",
    purpose: "So Setle can estimate the works and every grant you can claim.",
    ecosystem: "Housing", catalogueItem: "Estimate renovation costs and grants - Setle", provider: partner("Setle"),
    dataShared: ["property address", "EPC label", "household income bracket"],
    outcome: { customerEurOneOff: 8000, partnerValueEur: 100 },
  },
  {
    id: "insulation", chapter: "renovate", order: 7, title: "Insulate roof and walls",
    why: "Insulation is the biggest step towards a better EPC label.",
    purpose: "So Impact us today can prepare an insulation quote.",
    ecosystem: "Energy and sustainability", catalogueItem: "Insulation quote - Impact us today", provider: partner("Impact us today"),
    dataShared: ["property address", "EPC label"],
    outcome: { customerEurPerYear: 900, kwhPerYear: 6000, co2KgPerYear: 1200, partnerValueEur: 300 },
  },
  {
    id: "heating", chapter: "renovate", order: 8, title: "Replace the old boiler with a heat pump",
    why: "A 1975 gas boiler is inefficient and expensive.",
    purpose: "So Impact us today can prepare a heat pump quote.",
    ecosystem: "Energy and sustainability", catalogueItem: "Heating quote - Impact us today", provider: partner("Impact us today"),
    dataShared: ["property address", "current heating type"],
    outcome: { customerEurPerYear: 700, kwhPerYear: 8000, co2KgPerYear: 2000, partnerValueEur: 400 },
  },
  {
    id: "solar", chapter: "renovate", order: 9, title: "Produce your own electricity",
    why: "Solar panels cut the running cost of the heat pump.",
    ecosystem: "Energy and sustainability", catalogueItem: "Calculate solar panels and request a quote", provider: kbc,
    dataShared: [],
    outcome: { customerEurPerYear: 600, kwhPerYear: 3500, co2KgPerYear: 700, kbcRevenueEur: 150 },
  },
  {
    id: "energy-loan", chapter: "renovate", order: 10, title: "Finance the renovation",
    why: "Spread the renovation cost with a dedicated energy loan.",
    ecosystem: "Energy and sustainability", catalogueItem: "Energy loan", provider: kbc,
    dataShared: [],
    outcome: { kbcRevenueEur: 1500 },
  },
  {
    id: "home-insurance", chapter: "protect", order: 11, title: "Insure your new home",
    why: "Your home loan requires fire insurance from day one.",
    ecosystem: "Housing", catalogueItem: "Home insurance", provider: kbc,
    dataShared: [],
    outcome: { kbcRevenueEur: 400 },
  },
];

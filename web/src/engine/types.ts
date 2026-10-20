export type Party = { kind: "kbc" } | { kind: "partner"; name: string };

export interface Customer { id: string; name: string; age: number; city: string; household: string }

export type SignalType =
  | "property_search"
  | "mortgage_simulation"
  | "savings_transfer"
  | "epc_lookup"
  | "notary_contact";

export interface Signal { id: string; customerId: string; type: SignalType; label: string; source: string; observedAt: string }

export interface DetectedIntent {
  intentId: "buy_house";
  label: string;
  confidence: number;
  level: "none" | "ask" | "suggest"; // "none" = the engine deliberately does nothing
  needsConfirmation: boolean;
  reasons: string[];
}

export interface Outcome {
  customerEurOneOff?: number;   // one-off gain (grants, avoided overpay)
  customerEurPerYear?: number;  // recurring yearly saving
  kwhPerYear?: number;
  co2KgPerYear?: number;
  kbcRevenueEur?: number;
  partnerValueEur?: number;
}

export type Chapter = "find" | "finance" | "renovate" | "protect";

export interface JourneyStep {
  id: string;
  order: number;
  chapter: Chapter;
  title: string;
  why: string;
  ecosystem: string;
  catalogueItem: string;
  provider: Party;
  dataShared: string[];
  outcome: Outcome;
}

export interface Journey { intentId: string; title: string; steps: JourneyStep[] }

export type StepDecision = "pending" | "accepted" | "skipped";

export interface JourneyState {
  journey: Journey;
  decisions: Record<string, StepDecision>;
  consents: Record<string, Record<string, boolean>>;
}

export interface Scoreboard {
  customer: { eurOneOff: number; eurPerYear: number; kwhPerYear: number; co2KgPerYear: number };
  kbc: { productsActivated: number; revenueEur: number };
  partners: { leads: number; valueEur: number };
}

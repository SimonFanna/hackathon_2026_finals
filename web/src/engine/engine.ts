import { BUY_HOUSE_ASK_THRESHOLD, BUY_HOUSE_THRESHOLD, buyHouseSignalWeights, buyHouseSteps } from "./data";
import type {
  Customer, DetectedIntent, Journey, JourneyState, Scoreboard, Signal, StepDecision,
} from "./types";

export function detectIntents(customer: Customer, signals: Signal[]): DetectedIntent[] {
  const own = signals.filter((s) => s.customerId === customer.id);
  const types = new Set(own.map((s) => s.type));
  if (types.size === 0) return [];

  // Independent evidence: each distinct signal type lowers the chance we are wrong.
  let miss = 1;
  for (const t of types) miss *= 1 - buyHouseSignalWeights[t];
  const confidence = Math.round((1 - miss) * 100) / 100;

  return [{
    intentId: "buy_house",
    label: "Buying a home",
    confidence,
    level: confidence < BUY_HOUSE_ASK_THRESHOLD ? "none" : confidence < BUY_HOUSE_THRESHOLD ? "ask" : "suggest",
    needsConfirmation: confidence < BUY_HOUSE_THRESHOLD,
    reasons: own.map((s) => `${s.label} (${s.source})`),
  }];
}

export function buildJourney(intentId: string, customer: Customer, signals: Signal[] = []): Journey {
  if (intentId !== "buy_house") throw new Error(`Unknown intent: ${intentId}`);
  // The budget step quotes the customer's own latest home-loan simulation, when there is one.
  const amount = signals.filter((s) => s.customerId === customer.id && s.type === "mortgage_simulation" && s.amountEur).at(-1)?.amountEur;
  const steps = buyHouseSteps.map((s) => s.id === "budget"
    ? { ...s, why: amount ? `Your loan simulation suggests ~€${Math.round(amount / 1000)}k; let's check it fits your income.` : "Let's check what you can borrow with your income." }
    : s);
  return {
    intentId,
    title: "From house hunt to an energy-efficient home",
    steps: steps.sort((a, b) => a.order - b.order),
  };
}

export function initState(journey: Journey): JourneyState {
  const decisions: Record<string, StepDecision> = {};
  const consents: Record<string, Record<string, boolean>> = {};
  for (const step of journey.steps) {
    decisions[step.id] = "pending";
    consents[step.id] = Object.fromEntries(step.dataShared.map((f) => [f, false]));
  }
  return { journey, decisions, consents };
}

export function decide(state: JourneyState, stepId: string, decision: StepDecision): JourneyState {
  assertStep(state, stepId);
  return { ...state, decisions: { ...state.decisions, [stepId]: decision } };
}

export function setConsent(state: JourneyState, stepId: string, field: string, ok: boolean): JourneyState {
  assertStep(state, stepId);
  if (!(field in state.consents[stepId])) throw new Error(`Unknown field "${field}" for step ${stepId}`);
  return {
    ...state,
    consents: { ...state.consents, [stepId]: { ...state.consents[stepId], [field]: ok } },
  };
}

export function scoreboard(state: JourneyState): Scoreboard {
  const board: Scoreboard = {
    customer: { eurOneOff: 0, eurPerYear: 0, kwhPerYear: 0, co2KgPerYear: 0 },
    kbc: { productsActivated: 0, revenueEur: 0 },
    partners: { leads: 0, valueEur: 0 },
  };
  for (const step of state.journey.steps) {
    if (state.decisions[step.id] !== "accepted") continue;
    const o = step.outcome;
    board.customer.eurOneOff += o.customerEurOneOff ?? 0;
    board.customer.eurPerYear += o.customerEurPerYear ?? 0;
    board.customer.kwhPerYear += o.kwhPerYear ?? 0;
    board.customer.co2KgPerYear += o.co2KgPerYear ?? 0;
    if (step.provider.kind === "kbc") {
      board.kbc.productsActivated += 1;
      board.kbc.revenueEur += o.kbcRevenueEur ?? 0;
    } else if (Object.values(state.consents[step.id]).some(Boolean)) {
      // No consent, no lead: the partner only gets value when the customer shares data.
      board.partners.leads += 1;
      board.partners.valueEur += o.partnerValueEur ?? 0;
    }
  }
  return board;
}

function assertStep(state: JourneyState, stepId: string) {
  if (!(stepId in state.decisions)) throw new Error(`Unknown step: ${stepId}`);
}

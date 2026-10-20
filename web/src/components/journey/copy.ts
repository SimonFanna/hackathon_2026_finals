import type { Chapter, JourneyStep } from "@/engine";

// UI copy in Kate's voice: short, "you", reassuring, no emoji. Data (steps, signals, figures) comes from @/engine.

export const chapterLabel: Record<Chapter, string> = {
  find: "Find the house",
  finance: "Finance it",
  renovate: "Renovate",
  protect: "Protect it",
};

export const chapterOrder: Chapter[] = ["find", "finance", "renovate", "protect"];

export const intentCopy = {
  notification: "Looks like you're house hunting. Want a hand with the plan?",
  kateLine: "You saved 4 houses on Immoscoop and simulated a €320k home loan.",
  question: "Are you planning to buy a home?",
  unsure: "Kate isn't sure yet, so she's asking first.",
  sure: "Here's a plan for your new home.",
  declined: "Got it. Kate won't bring this up again. Nothing was shared.",
};

/** Purpose line of the consent block ("why"), per step. */
const purposeByStep: Record<string, string> = {
  search: "So Immoscoop can keep your saved houses and alerts in one place.",
  valuation: "So an Immoscoop estate agent can value the house before you make an offer.",
  epc: "So De Immowinkel can check the certificate and what the obligation means for you.",
  grants: "So Setle can estimate the works and every grant you can claim.",
  insulation: "So Impact us today can prepare an insulation quote.",
  heating: "So Impact us today can prepare a heat pump quote.",
};

export function purposeFor(step: JourneyStep): string {
  const name = step.provider.kind === "partner" ? step.provider.name : "KBC";
  return purposeByStep[step.id] ?? `So ${name} can prepare this step for you.`;
}

export function providerName(step: JourneyStep): string {
  return step.provider.kind === "partner" ? step.provider.name : "KBC";
}

/** The strongest customer-facing outcome of a step, as one line. */
export function outcomeLine(step: JourneyStep): { text: string; green: boolean } | null {
  const o = step.outcome;
  if (o.customerEurOneOff) return { text: `Worth up to €${o.customerEurOneOff.toLocaleString("en-GB")} for you`, green: false };
  if (o.customerEurPerYear && o.kwhPerYear)
    return { text: `About €${o.customerEurPerYear.toLocaleString("en-GB")} a year and ${o.kwhPerYear.toLocaleString("en-GB")} kWh less`, green: true };
  if (o.customerEurPerYear) return { text: `About €${o.customerEurPerYear.toLocaleString("en-GB")} saved a year`, green: true };
  return null;
}

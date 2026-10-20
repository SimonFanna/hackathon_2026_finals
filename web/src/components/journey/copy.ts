import type { ConstraintCheck, ConstraintDef, DisruptionKind, JourneyStep, Strategy } from "@/engine";
import { eur } from "./format";

// UI copy in Kate's voice: short, "you", reassuring, no emoji. Persona copy (quests, Kate's lines) lives with the data in @/engine.

export const declinedCopy = "Got it. Kate won't bring this up again. Nothing was shared.";
export const unsureCopy = "Kate isn't sure yet, so she's asking first.";

export function purposeFor(step: JourneyStep): string {
  return step.purpose ?? `So ${providerName(step)} can prepare this step for you.`;
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

export function formatValue(def: ConstraintDef, n: number): string {
  if (def.unit === "month") return `Month ${Math.round(n)}`;
  if (def.unit === "eurMonth") return `${eur(n)}/mo`;
  return eur(n);
}

/** "limit €400,000" / "min €10,000" / "by month 13" */
export function formatLimit(def: ConstraintDef, n: number): string {
  if (def.unit === "month") return `by month ${Math.round(n)}`;
  return `${def.kind === "min" ? "min" : "max"} ${formatValue(def, n)}`;
}

/** One line on what broke: "Monthly repayments €1,910/mo, max €1,900/mo". */
export function brokenLine(def: ConstraintDef, c: ConstraintCheck): string {
  return `${def.label}: ${formatValue(def, c.value)}, ${formatLimit(def, c.limit)}`;
}

export const kindLabel: Record<DisruptionKind, string> = {
  cost: "Cost overrun",
  delay: "Partner delay",
  income: "Income shock",
  rate: "Market change",
  cashflow: "Cash crunch",
  health: "Health",
};

export const strategyLabel: Record<Strategy, string> = {
  keep: "Keep",
  defer: "Defer",
  substitute: "Substitute",
  refinance: "Refinance",
  rebalance: "Rebalance",
  reorder: "Reorder",
  protect: "Protection",
  bridge: "Bridge",
};

export function healthTone(h: number): "good" | "risk" | "bad" {
  return h >= 80 ? "good" : h >= 50 ? "risk" : "bad";
}

export function healthWord(h: number): string {
  const t = healthTone(h);
  return t === "good" ? "On track" : t === "risk" ? "At risk" : "Off track";
}

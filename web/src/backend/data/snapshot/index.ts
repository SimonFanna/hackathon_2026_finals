// T7 — offline snapshot, written by `npm run snapshot` (synthetic data only). Static imports so it ships in the bundle.
import type { CustomerFacts, RuleSet } from "../../types";
import type { DemoSlug } from "../personas";
import catalogueJson from "./catalogue.json";
import els from "./facts-els.json";
import lucas from "./facts-lucas.json";
import nadia from "./facts-nadia.json";
import pieter from "./facts-pieter.json";
import sofie from "./facts-sofie.json";
import thomas from "./facts-thomas.json";
import rulesJson from "./rules.json";

export const snapshotRules = rulesJson as unknown as RuleSet;

export const snapshotCatalogue = catalogueJson as { sourceRow: number; ecosystem: string; name: string; partner: string | null; viaPartnerHub: boolean }[];

const FACTS = { sofie, lucas, nadia, pieter, els, thomas } as unknown as Record<DemoSlug, CustomerFacts>;

/** A deep copy, so callers can never mutate the snapshot. */
export function snapshotFacts(slug: DemoSlug): CustomerFacts {
  return structuredClone(FACTS[slug]);
}

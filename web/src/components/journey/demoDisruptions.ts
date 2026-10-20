import type { Disruption, OutcomeModel, Persona } from "../../engine";

/**
 * Demo V2: the live demo plays two surprises per player, not the four the engine data holds
 * (four felt endless on stage). Both are kinds Simon's backend can replay (cost_overrun, partner_delay,
 * income_drop; see PRESET_FOR in Stage.tsx), so the event page shows the backend's own impact and
 * scenarios whenever the API is up. Engine data (`web/src/engine/`) is untouched: the picker card, the
 * sequence, the HUD and the finale all go through `demoPersona` so they agree on the same two.
 */
export const DEMO_DISRUPTIONS: Record<Persona["id"], readonly [string, string]> = {
  house: ["quote-overrun", "job-loss"], // the renovation quote (cost, month 4), then the lost job (income, month 9)
  business: ["fit-out-delay", "equipment-overrun"], // the late contractor (delay, month 1), then the machine (cost, month 3)
};

/** The surprises the demo plays, in engine order. */
export function demoDisruptions(persona: Persona): Disruption[] {
  const ids = DEMO_DISRUPTIONS[persona.id];
  return persona.outcome.disruptions.filter((d) => ids.includes(d.id));
}

/** The persona's outcome model with only the demo's surprises; the engine runs it unchanged. */
export function demoOutcome(persona: Persona): OutcomeModel {
  return { ...persona.outcome, disruptions: demoDisruptions(persona) };
}

/** The persona as the demo plays it. Same object identity for the same persona, so memoised callers don't churn. */
const cache = new WeakMap<Persona, Persona>();
export function demoPersona(persona: Persona): Persona {
  let p = cache.get(persona);
  if (!p) {
    p = { ...persona, outcome: demoOutcome(persona) };
    cache.set(persona, p);
  }
  return p;
}

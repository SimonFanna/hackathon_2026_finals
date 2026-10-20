import { describe, expect, it } from "vitest";
import { advance, goalReached, hit, personas, resolve, startRun, type Persona } from "../../engine";
import { DEMO_DISRUPTIONS, demoDisruptions, demoOutcome, demoPersona } from "./demoDisruptions";
import { buildDemoSequence } from "./demoSequence";

/** The kinds the backend can replay (PRESET_FOR in Stage.tsx). */
const REPLAYABLE = new Set(["cost", "delay", "income"]);
const everything = (p: Persona) => new Set(p.journey.steps.map((s) => s.id));

describe.each(personas.map((p) => [p.id, p] as const))("demo disruptions · %s", (_id, p) => {
  const demo = demoPersona(p);

  it("plays exactly two of the persona's surprises, in engine order", () => {
    const ds = demoDisruptions(p);
    expect(ds.map((d) => d.id)).toEqual([...DEMO_DISRUPTIONS[p.id]]);
    const order = p.outcome.disruptions.map((d) => d.id);
    expect(order.indexOf(ds[0].id)).toBeLessThan(order.indexOf(ds[1].id));
    expect(demo.outcome.disruptions).toHaveLength(2);
  });

  it("only picks surprises the backend can replay", () => {
    for (const d of demoDisruptions(p)) expect(REPLAYABLE.has(d.kind)).toBe(true);
  });

  it("leaves the engine data and the rest of the persona untouched", () => {
    expect(p.outcome.disruptions).toHaveLength(4);
    expect(demo.journey).toBe(p.journey);
    expect(demo.outcome.constraints).toBe(p.outcome.constraints);
    expect(demoPersona(p)).toBe(demo); // stable identity for memoised callers
  });

  it("each surprise breaks a limit on its own and Kate's pick keeps the goal", () => {
    const model = demoOutcome(p);
    const accepted = everything(p);
    let run = startRun(model);
    for (let i = 0; i < 2; i++) {
      const ph = hit(run, model, accepted);
      expect(ph).not.toBeNull();
      expect(ph!.broken.length).toBeGreaterThan(0);
      expect(ph!.healthHit).toBeLessThan(ph!.healthBefore);
      const best = ph!.options.find((o) => o.recommended)!;
      expect(best.feasible).toBe(true);
      run = resolve(run, model, ph!, best.id);
    }
    expect(hit(run, model, accepted)).toBeNull();
    expect(goalReached(advance(run, model.horizon), model)).toBe(true);
  });

  it("gives the sequence two event pages", () => {
    const pages = buildDemoSequence(demo, everything(demo));
    expect(pages.filter((x) => x.kind === "event").map((x) => (x.kind === "event" ? x.disruption.id : ""))).toEqual([...DEMO_DISRUPTIONS[p.id]]);
  });
});

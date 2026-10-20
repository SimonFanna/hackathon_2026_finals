import { describe, expect, it } from "vitest";
import {
  advance, buildJourney, checkPlan, detectIntents, getPersona, goalReached, hit, isComplete, personas, planHealth,
  resolve, startRun, stepStatus, type Persona, type Run,
} from "./index";

const everything = (p: Persona) => new Set(p.journey.steps.map((s) => s.id));

/** Plays every disruption, always taking the engine's recommendation. */
function playRecommended(p: Persona, accepted = everything(p)): Run {
  let run = startRun(p.outcome);
  for (;;) {
    const pending = hit(run, p.outcome, accepted);
    if (!pending) return run;
    run = resolve(run, p.outcome, pending, pending.options.find((o) => o.recommended)!.id);
  }
}

describe.each(personas.map((p) => [p.id, p] as const))("outcome engine · %s", (_id, p) => {
  it("starts healthy, with every constraint kept", () => {
    expect(checkPlan(p.outcome.baseline, p.outcome.constraints).every((c) => c.ok)).toBe(true);
    expect(planHealth(p.outcome.baseline, p.outcome.constraints)).toBe(100);
  });

  it("has four disruptions in time order, each breaking at least one constraint", () => {
    const months = p.outcome.disruptions.map((d) => d.month);
    expect(months).toHaveLength(4);
    expect([...months].sort((a, b) => a - b)).toEqual(months);

    let run = startRun(p.outcome);
    for (;;) {
      const pending = hit(run, p.outcome, everything(p));
      if (!pending) break;
      expect(pending.broken.length).toBeGreaterThan(0);
      expect(pending.healthHit).toBeLessThan(pending.healthBefore);
      run = resolve(run, p.outcome, pending, pending.options.find((o) => o.recommended)!.id);
    }
  });

  it("always recommends a feasible option, and keeping the plan never fixes it", () => {
    let run = startRun(p.outcome);
    for (;;) {
      const pending = hit(run, p.outcome, everything(p));
      if (!pending) break;
      const rec = pending.options.filter((o) => o.recommended);
      expect(rec).toHaveLength(1);
      expect(rec[0].feasible).toBe(true);
      expect(pending.options.find((o) => o.strategy === "keep")?.feasible).toBe(false);
      run = resolve(run, p.outcome, pending, rec[0].id);
    }
  });

  it("reaches the goal after four shocks when the customer follows Kate", () => {
    const run = playRecommended(p);
    expect(isComplete(run, p.outcome)).toBe(true);
    expect(goalReached(run, p.outcome)).toBe(true);
    expect(run.history).toHaveLength(4);
    expect(run.history.every((h) => h.healthAfter > h.healthHit)).toBe(true);
  });

  it("only uses steps that exist in the journey", () => {
    const ids = everything(p);
    for (const d of p.outcome.disruptions) {
      for (const a of d.affects) expect(ids.has(a)).toBe(true);
      for (const o of d.options) {
        if (o.requiresStep) expect(ids.has(o.requiresStep)).toBe(true);
        for (const c of o.changes ?? []) expect(ids.has(c.stepId)).toBe(true);
      }
    }
    for (const id of Object.keys(p.outcome.schedule)) expect(ids.has(id)).toBe(true);
  });

  it("detects its own intent and builds its own journey", () => {
    const [intent] = detectIntents(p.customer, p.signals, p.intentModel);
    expect(intent.intentId).toBe(p.intentModel.intentId);
    expect(intent.level).not.toBe("none");
    const journey = buildJourney(intent.intentId, p.customer);
    expect(journey.steps).toHaveLength(p.journey.steps.length);
    expect(new Set(journey.steps.map((s) => s.chapter))).toEqual(new Set(p.journey.chapters.map((c) => c.id)));
  });
});

describe("customer control", () => {
  const p = getPersona("house");

  it("lets the customer pick an option Kate did not recommend, even one that breaks a limit", () => {
    const pending = hit(startRun(p.outcome), p.outcome, everything(p))!;
    const run = resolve(startRun(p.outcome), p.outcome, pending, "keep");
    expect(run.history[0].optionId).toBe("keep");
    expect(run.history[0].recommendedId).not.toBe("keep");
    expect(checkPlan(run.plan, p.outcome.constraints).some((c) => !c.ok)).toBe(true);
  });

  it("re-scores later options on the plan the customer actually chose", () => {
    // Stretching the loan (not recommended) leaves room for the energy-loan top-up later.
    const accepted = everything(p);
    let run = startRun(p.outcome);
    const first = hit(run, p.outcome, accepted)!;
    run = resolve(run, p.outcome, first, "stretch");
    const second = hit(run, p.outcome, accepted)!;
    expect(second.options.find((o) => o.id === "top-up")?.feasible).toBe(true);

    const viaSavings = resolve(startRun(p.outcome), p.outcome, first, "more-savings");
    const secondViaSavings = hit(viaSavings, p.outcome, accepted)!;
    expect(secondViaSavings.options.find((o) => o.id === "top-up")?.feasible).toBe(false);
  });
});

describe("options depend on earlier choices", () => {
  const p = getPersona("business");

  it("offers the income insurance claim only if the customer took the insurance", () => {
    const without = new Set([...everything(p)].filter((id) => id !== "income-insurance"));
    let run = startRun(p.outcome);
    for (let i = 0; i < 3; i++) {
      const pending = hit(run, p.outcome, without)!;
      run = resolve(run, p.outcome, pending, pending.options.find((o) => o.recommended)!.id);
    }
    const injury = hit(run, p.outcome, without)!;
    const claim = injury.options.find((o) => o.id === "claim")!;
    expect(claim.available).toBe(false);
    expect(claim.recommended).toBe(false);
    expect(() => resolve(run, p.outcome, injury, "claim")).toThrow();
    expect(injury.options.find((o) => o.recommended)?.id).toBe("advance");
  });

  it("recommends the insurance claim when the customer has it", () => {
    let run = startRun(p.outcome);
    for (let i = 0; i < 3; i++) {
      const pending = hit(run, p.outcome, everything(p))!;
      run = resolve(run, p.outcome, pending, pending.options.find((o) => o.recommended)!.id);
    }
    expect(hit(run, p.outcome, everything(p))!.options.find((o) => o.recommended)?.id).toBe("claim");
  });
});

describe("step status", () => {
  const p = getPersona("house");

  it("follows the schedule and re-planning shifts", () => {
    let run = startRun(p.outcome);
    expect(stepStatus(run, p.outcome, "search")).toBe("active");
    expect(stepStatus(run, p.outcome, "heating")).toBe("upcoming");
    run = advance(run, 10);
    expect(stepStatus(run, p.outcome, "heating")).toBe("done");
    run = { ...run, changes: { heating: { stepId: "heating", note: "Moved to year 2", shiftMonths: 12 } } };
    expect(stepStatus(run, p.outcome, "heating")).toBe("upcoming");
  });
});

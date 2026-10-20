import { describe, expect, it } from "vitest";
import { FEATURE_NAMES } from "../../backend/engine/features";
import { SIGNAL_CODES } from "../../backend/vocabulary";
import { applyToggles, base, BASES, flip, initialToggles, score, TOGGLES, type BaseSlug, type Toggles } from "./model";

const off = (): Toggles => Object.fromEntries(TOGGLES.map((t) => [t.id, "off"]));
const top = (slug: BaseSlug, on: Toggles) => score(base(slug), applyToggles(base(slug), on))[0];
const init = (slug: BaseSlug) => initialToggles(base(slug));

describe("custom player: toggles → features → predict", () => {
  it("only uses real model signals, and covers every non-disruption signal code", () => {
    const codes = TOGGLES.flatMap((t) => t.codes);
    for (const c of codes) expect(FEATURE_NAMES).toContain(`sig_${c}`);
    for (const t of TOGGLES) for (const a of t.adds) expect(t.codes).toContain(a);
    const disruptions = ["INCOME_DROP", "BENEFITS_INFLOW", "LARGE_UNEXPECTED_EXPENSE", "COST_OVERRUN", "PARTNER_DELAY", "RATE_CHANGE"];
    expect(new Set(codes)).toEqual(new Set(SIGNAL_CODES.filter((c) => !disruptions.includes(c))));
    expect(TOGGLES.length).toBeGreaterThanOrEqual(5);
    expect(TOGGLES.length).toBeLessThanOrEqual(8);
  });

  it("the start state is the customer exactly as the backend sees it", () => {
    for (const slug of BASES) {
      const b = base(slug);
      expect(score(b, applyToggles(b, init(slug)))).toEqual(score(b, b.signals));
    }
    const expected = { sofie: "HOME_BUYING", lucas: "STARTING_BUSINESS", nadia: "NEW_PARENT", pieter: "EV_PURCHASE" } as const;
    for (const [slug, moment] of Object.entries(expected)) {
      const t = top(slug as BaseSlug, init(slug as BaseSlug));
      expect(t.moment).toBe(moment);
      expect(t.level).toBe("SUGGEST");
    }
    // Els and Thomas: Kate stays quiet (docs/features/bank-data.md).
    for (const slug of ["els", "thomas"] as const) expect(top(slug, init(slug)).level).toBe("NO_ACTION");
  });

  it("all toggles off → NO_ACTION for every base customer", () => {
    for (const slug of BASES) {
      expect(score(base(slug), applyToggles(base(slug), off())).every((s) => s.level === "NO_ACTION")).toBe(true);
    }
  });

  it("Lucas + First freelance invoices → STARTING_BUSINESS is the top moment, explained by the invoices", () => {
    const t = top("lucas", { ...init("lucas"), freelance: "sim" });
    expect(t.moment).toBe("STARTING_BUSINESS");
    expect(t.level).toBe("SUGGEST");
    expect(t.goalType).toBe("START_BUSINESS");
    // Without the business reading, the invoices alone are not enough: the model stays honest.
    expect(top("lucas", { ...off(), freelance: "sim" }).level).toBe("NO_ACTION");
  });

  it("Thomas (quiet) + starting-a-business signals → Kate asks, then suggests START_BUSINESS", () => {
    const ask = top("thomas", { ...init("thomas"), start_it: "sim" });
    expect(ask.moment).toBe("STARTING_BUSINESS");
    expect(ask.level).toBe("ASK");
    const suggest = top("thomas", { ...init("thomas"), start_it: "sim", freelance: "sim" });
    expect(suggest.level).toBe("SUGGEST");
    expect(suggest.confidence).toBeGreaterThan(ask.confidence);
    expect(suggest.why.length).toBeGreaterThan(0);
  });

  it("flip: on → off → simulated", () => {
    expect(flip("own")).toBe("off");
    expect(flip("sim")).toBe("off");
    expect(flip("off")).toBe("sim");
  });

  it("thresholds are the backend's: < 0.5 NO_ACTION, < 0.85 ASK, else SUGGEST", () => {
    for (const slug of BASES) {
      for (const s of score(base(slug), applyToggles(base(slug), { ...init(slug), start_it: "sim", pension: "sim" }))) {
        expect(s.level).toBe(s.confidence < 0.5 ? "NO_ACTION" : s.confidence < 0.85 ? "ASK" : "SUGGEST");
      }
    }
  });
});

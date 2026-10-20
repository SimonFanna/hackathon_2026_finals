import { describe, expect, it } from "vitest";
import { getPersona, personas, type Persona } from "../../engine";
import { buildDemoSequence, chapterSpan } from "./demoSequence";

const everything = (p: Persona) => new Set(p.journey.steps.map((s) => s.id));
const label = (p: Persona, pages = buildDemoSequence(p)) =>
  pages.map((x) => (x.kind === "chapter" ? x.chapter.label : `[${x.disruption.id}]`));

describe.each(personas.map((p) => [p.id, p] as const))("demo sequence · %s", (_id, p) => {
  const pages = buildDemoSequence(p);

  it("has one page per chapter and one per surprise, indexed in order", () => {
    expect(pages.filter((x) => x.kind === "chapter")).toHaveLength(p.journey.chapters.length);
    expect(pages.filter((x) => x.kind === "event")).toHaveLength(p.outcome.disruptions.length);
    expect(pages.map((x) => x.index)).toEqual(pages.map((_, i) => i));
  });

  it("keeps the chapters and the surprises in their own order", () => {
    const chapters = pages.flatMap((x) => (x.kind === "chapter" ? [x.chapter.id] : []));
    expect(chapters).toEqual(p.journey.chapters.map((c) => c.id));
    const events = pages.flatMap((x) => (x.kind === "event" ? [x.disruption.id] : []));
    expect(events).toEqual(p.outcome.disruptions.map((d) => d.id));
  });

  it("starts with a chapter page and puts every event after the chapter of the step it affects", () => {
    expect(pages[0].kind).toBe("chapter");
    pages.forEach((x, i) => {
      if (x.kind !== "event") return;
      const before = pages.slice(0, i).filter((y) => y.kind === "chapter");
      const last = before[before.length - 1];
      const firstAffected = p.journey.steps.find((s) => x.disruption.affects.includes(s.id))!;
      const linked = p.journey.chapters.findIndex((c) => c.id === firstAffected.chapter);
      const shown = p.journey.chapters.findIndex((c) => c.id === (last.kind === "chapter" ? last.chapter.id : ""));
      expect(shown).toBeGreaterThanOrEqual(linked);
    });
  });

  it("is the same with every step accepted", () => {
    expect(label(p, buildDemoSequence(p, everything(p)))).toEqual(label(p));
  });

  it("drops a chapter nobody accepted and hangs its events on the chapter before", () => {
    const chapter = p.journey.chapters[1].id;
    const accepted = new Set(p.journey.steps.filter((s) => s.chapter !== chapter).map((s) => s.id));
    const trimmed = buildDemoSequence(p, accepted);
    expect(trimmed.filter((x) => x.kind === "chapter")).toHaveLength(p.journey.chapters.length - 1);
    expect(trimmed.filter((x) => x.kind === "event")).toHaveLength(p.outcome.disruptions.length);
    expect(trimmed.flatMap((x) => (x.kind === "event" ? [x.disruption.id] : []))).toEqual(p.outcome.disruptions.map((d) => d.id));
  });

  it("still plays every surprise when nothing was accepted", () => {
    const none = buildDemoSequence(p, new Set());
    expect(none.map((x) => x.kind)).toEqual(p.outcome.disruptions.map(() => "event"));
  });

  it("knows the months each chapter spans", () => {
    for (const c of p.journey.chapters) {
      const span = chapterSpan(c.id, p.journey, p.outcome);
      expect(span).not.toBeNull();
      expect(span!.from).toBeLessThan(span!.to);
    }
  });
});

describe("demo sequence · backend-built journey", () => {
  // The backend returns its own step ids and chapters derived from labels: no step link, so events go by month order.
  const p = getPersona("business");
  const journey = {
    ...p.journey,
    chapters: [{ id: "launch", label: "Launch" }, { id: "finance-it", label: "Finance it" }, { id: "run-it", label: "Run it" }],
    steps: p.journey.steps.slice(0, 6).map((s, i) => ({ ...s, id: `uuid-${i}`, chapter: ["launch", "launch", "finance-it", "finance-it", "run-it", "run-it"][i] })),
  };
  const accepted = new Set(journey.steps.map((s) => s.id));
  const pages = buildDemoSequence(p, accepted, journey);

  it("keeps every chapter and every surprise, surprises placed by month over an even split of the horizon", () => {
    expect(label(p, pages)).toEqual(["Launch", "[fit-out-delay]", "Finance it", "[equipment-overrun]", "Run it", "[late-payer]", "[injury]"]);
  });

  it("estimates the months of a chapter it has no schedule for", () => {
    expect(chapterSpan("finance-it", journey, p.outcome)).toEqual({ from: 3, to: 6 });
  });
});

describe("demo sequence · pitch order", () => {
  it("house: Find · Finance · [rate rise] · Renovate · [quote, delay, job loss] · Protect", () => {
    expect(label(getPersona("house"))).toEqual([
      "Find the house", "Finance it", "[rate-rise]", "Renovate", "[quote-overrun]", "[installer-delay]", "[job-loss]", "Protect it",
    ]);
  });

  it("business: Launch · Finance · [fit-out, equipment] · Run · [late payer] · Protect · [injury]", () => {
    expect(label(getPersona("business"))).toEqual([
      "Launch", "Finance it", "[fit-out-delay]", "[equipment-overrun]", "Run it", "[late-payer]", "Protect it", "[injury]",
    ]);
  });
});

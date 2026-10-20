import { describe, expect, it } from "vitest";
import { getPersona, personas, type Persona } from "../../engine";
import { ecosystemOf, groupPages, pageOfStep, pageTitle } from "./stepPages";

describe.each(personas.map((p) => [p.id, p] as const))("step pages · %s", (_id, p: Persona) => {
  const pages = groupPages(p.journey);

  it("covers every step once, in journey order, on 2 to 4 pages", () => {
    expect(pages.length).toBeGreaterThanOrEqual(2);
    expect(pages.length).toBeLessThanOrEqual(4);
    expect(pages.flatMap((x) => x.steps.map((s) => s.id))).toEqual(p.journey.steps.map((s) => s.id));
  });

  it("keeps a chapter whole and the chapters in order", () => {
    const chapters = pages.flatMap((x) => x.chapters.map((c) => c.id));
    expect(chapters).toEqual(p.journey.chapters.filter((c) => p.journey.steps.some((s) => s.chapter === c.id)).map((c) => c.id));
  });

  it("finds the page of a step", () => {
    for (const [i, pg] of pages.entries()) for (const s of pg.steps) expect(pageOfStep(pages, s.id)).toBe(i);
    expect(pageOfStep(pages, "nope")).toBe(0);
  });

  it("names the KBC ecosystem", () => {
    const eco = ecosystemOf(p.journey);
    expect(eco.partners.length).toBeGreaterThanOrEqual(3);
    expect(new Set(eco.partners).size).toBe(eco.partners.length);
    expect(eco.ecosystems.length).toBeGreaterThanOrEqual(1);
  });
});

it("house: Find and finance | Renovate | Protect", () => {
  const pages = groupPages(getPersona("house").journey);
  expect(pages.map(pageTitle)).toEqual(["Find the house and finance", "Renovate", "Protect"].map((t) => expect.stringMatching(new RegExp(`^${t}`))));
});

it("business: Launch and finance | Run | Protect", () => {
  const pages = groupPages(getPersona("business").journey);
  expect(pages.map(pageTitle)).toEqual(["Launch and finance", "Run", "Protect"].map((t) => expect.stringMatching(new RegExp(`^${t}`))));
});

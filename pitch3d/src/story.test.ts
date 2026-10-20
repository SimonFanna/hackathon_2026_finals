import { describe, expect, it } from "vitest";
import snapshot from "./data/lucas.json";
import { buildStory } from "./story";

const story = buildStory(snapshot);

describe("buildStory (Lucas, from the Supabase snapshot)", () => {
  it("builds the hero from the customer and employment rows", () => {
    expect(story.hero).toMatchObject({ firstName: "Lucas", age: 29, city: "Leuven", sector: "IT", employer: "Brabo Consulting" });
    expect(story.hero.monthlyNetIncomeEur).toBeCloseTo(2733.44);
  });

  it("groups entrepreneur page views into signals, most viewed first", () => {
    expect(story.signals[0]).toMatchObject({ label: "Viewed Start it @KBC", count: 8 });
    const labels = story.signals.map((s) => s.label);
    expect(labels).toContain("Viewed E-invoicing");
    expect(labels).toContain("Viewed Guaranteed income insurance for the self-employed");
    expect(labels).not.toContain("Viewed Debit cards");
  });

  it("keeps only business Kate questions", () => {
    expect(story.kateQuestions).toEqual([
      "How do I open a business account?",
      "How do I send invoices?",
      "Do I need a VAT number as a freelancer?",
    ]);
  });

  it("takes providers from the catalogue: Billit shares, Go Solid is declined, protection is KBC", () => {
    const byId = Object.fromEntries(story.steps.map((s) => [s.id, s]));
    expect(byId.invoicing).toMatchObject({ provider: "Billit", isPartner: true, consent: "shared" });
    expect(byId.collections).toMatchObject({ provider: "Go Solid", isPartner: true, consent: "declined" });
    expect(byId.protection).toMatchObject({ provider: "KBC", isPartner: false });
    expect(story.steps.map((s) => s.id)).toEqual(["startit", "account", "invoicing", "protection", "collections", "capital"]);
  });

  it("derives next-moment districts only from items Lucas viewed", () => {
    expect(story.districts.map((d) => d.id)).toEqual(["home", "mobility", "pension"]);
    expect(story.districts.every((d) => d.views > 0)).toBe(true);
  });

  it("places all 2,000 synthetic customers on known cities", () => {
    expect(story.cityLights.reduce((a, c) => a + c.customers, 0)).toBe(2000);
    expect(story.cityLights.every((c) => Number.isFinite(c.lat) && Number.isFinite(c.lon))).toBe(true);
  });

  it("counts the triple win from the journey itself", () => {
    expect(story.tally).toEqual({ stepsDone: 5, kbcProducts: 5, partnerLeads: 1, partnersDeclined: 1 });
  });
});

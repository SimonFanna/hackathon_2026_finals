import type { Journey, JourneyStep } from "@/engine";

/** One phone page of the step flow: one or two chapters, their steps as compact cards. */
export interface StepPage {
  /** Chapter labels on the page, in journey order ("Find", "Finance"). */
  chapters: { id: string; label: string; steps: JourneyStep[] }[];
  steps: JourneyStep[];
}

/** Chapters per page are merged while the page stays at or under this many steps. */
export const PAGE_CAP = 4;

/**
 * Groups the journey's chapters into as few pages as read well: consecutive chapters share a page while the
 * total stays at or under `PAGE_CAP` steps; a long chapter (Renovate, 6 steps) gets a page of its own. Empty
 * chapters are dropped. Locally: house = Find · Finance | Renovate | Protect; business = Launch · Finance | Run | Protect.
 */
export function groupPages(journey: Journey, cap = PAGE_CAP): StepPage[] {
  const chapters = journey.chapters
    .map((c) => ({ ...c, steps: journey.steps.filter((s) => s.chapter === c.id) }))
    .filter((c) => c.steps.length > 0);
  const pages: StepPage[] = [];
  for (const c of chapters) {
    const last = pages[pages.length - 1];
    if (last && last.steps.length + c.steps.length <= cap) {
      last.chapters.push(c);
      last.steps.push(...c.steps);
    } else pages.push({ chapters: [c], steps: [...c.steps] });
  }
  return pages;
}

/** Index of the page that holds step `stepId`, or 0. */
export function pageOfStep(pages: StepPage[], stepId: string): number {
  const i = pages.findIndex((p) => p.steps.some((s) => s.id === stepId));
  return i < 0 ? 0 : i;
}

/** "Find and finance" / "Renovate" — the page title from its chapter labels. */
export function pageTitle(page: StepPage): string {
  const labels = page.chapters.map((c) => c.label);
  if (labels.length === 1) return labels[0];
  return `${labels[0]} and ${labels.slice(1).map((l) => l.toLowerCase()).join(", ")}`;
}

/** The partners around KBC in this journey, in order of appearance, and the ecosystems they belong to. */
export function ecosystemOf(journey: Journey): { partners: string[]; ecosystems: string[] } {
  const partners: string[] = [];
  const ecosystems: string[] = [];
  for (const s of journey.steps) {
    if (s.provider.kind === "partner" && !partners.includes(s.provider.name)) partners.push(s.provider.name);
    if (s.ecosystem && !ecosystems.includes(s.ecosystem)) ecosystems.push(s.ecosystem);
  }
  return { partners, ecosystems };
}

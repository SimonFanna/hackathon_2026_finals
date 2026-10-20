import type { Chapter, Disruption, Journey, OutcomeModel, Persona } from "../../engine";

/**
 * Demo V2, after the plan: one phone page per chapter, interleaved with one page per surprise.
 * Pure sequencing; the engine (`hit` / `evaluateOptions` / `resolve`) is untouched and still runs
 * the surprises in their own order, which this sequence always respects.
 */
export type DemoPage =
  | { kind: "chapter"; chapter: { id: Chapter; label: string }; index: number }
  | { kind: "event"; disruption: Disruption; index: number };

/** The chapter (index) a disruption belongs to: the chapter of the first step it affects. */
function linkedChapter(d: Disruption, journey: Journey, model: OutcomeModel): number {
  const chapterIndex = (stepId: string) => {
    const step = journey.steps.find((s) => s.id === stepId);
    return step ? journey.chapters.findIndex((c) => c.id === step.chapter) : -1;
  };
  for (const id of d.affects) {
    const i = chapterIndex(id);
    if (i >= 0) return i;
  }
  // No link to a step (e.g. a backend-built journey with its own step ids): by month order, the last chapter started by then.
  let best = -1;
  journey.chapters.forEach((c, i) => {
    const span = chapterSpan(c.id, journey, model);
    if (span && span.from <= d.month) best = i;
  });
  return best >= 0 ? best : journey.chapters.length - 1;
}

/**
 * Builds the page list: Find → [event 1] → Finance → [event 2] → … → finale (the finale is not a page).
 * Each event page follows the chapter page of the step it affects. Surprises keep their engine order,
 * so a surprise linked to an earlier chapter than the previous one slides forward to that chapter.
 * With `accepted`, chapters without any accepted step are dropped and their events attach to the chapter before.
 */
export function buildDemoSequence(persona: Persona, accepted?: ReadonlySet<string>, journey: Journey = persona.journey): DemoPage[] {
  const { outcome } = persona;
  const kept = journey.chapters.map((c) => !accepted || journey.steps.some((s) => s.chapter === c.id && accepted.has(s.id)));
  const lastKept = kept.lastIndexOf(true);

  let floor = 0;
  const slot = outcome.disruptions.map((d) => {
    let i = Math.max(linkedChapter(d, journey, outcome), floor);
    floor = i;
    while (i > 0 && !kept[i]) i--; // the chapter was skipped entirely: hang the event on the one before
    return kept[i] ? i : kept.indexOf(true); // … or on the first kept one
  });

  const pages: DemoPage[] = [];
  const pushEvents = (chapterIndex: number) => {
    outcome.disruptions.forEach((d, j) => {
      if (slot[j] === chapterIndex) pages.push({ kind: "event", disruption: d, index: pages.length });
    });
  };
  journey.chapters.forEach((chapter, i) => {
    if (!kept[i]) return;
    pages.push({ kind: "chapter", chapter, index: pages.length });
    pushEvents(i);
  });
  // Nothing accepted at all: the surprises still come, one after the other.
  if (lastKept < 0) outcome.disruptions.forEach((d) => pages.push({ kind: "event", disruption: d, index: pages.length }));
  return pages;
}

/**
 * The months a chapter spans in the schedule. Steps the schedule doesn't know (a backend-built journey has its own
 * step ids) fall back to an even split of the horizon over the chapters, in order.
 */
export function chapterSpan(chapterId: Chapter, journey: Journey, model: OutcomeModel): { from: number; to: number } | null {
  const steps = journey.steps.filter((s) => s.chapter === chapterId && model.schedule[s.id]);
  if (steps.length === 0) {
    const i = journey.chapters.findIndex((c) => c.id === chapterId);
    if (i < 0) return null;
    const n = journey.chapters.length;
    return { from: Math.round((i * model.horizon) / n), to: Math.round(((i + 1) * model.horizon) / n) };
  }
  const from = Math.min(...steps.map((s) => model.schedule[s.id].start));
  const to = Math.max(...steps.map((s) => model.schedule[s.id].start + model.schedule[s.id].months));
  return { from, to };
}

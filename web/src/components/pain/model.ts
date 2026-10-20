import { checkPlan, getPersona, hit, planHealth, resolve, startRun, type OutcomeModel, type Run } from "../../engine";

export const CHAPTERS = ["The dream", "The real price", "The unknowns", "The coordination", "Life happens", "The result", "Try again"];
export const LAST_FRAME = 9;

/** The unchanged-plan counterfactual uses the same events and rules as the guided demo. */
export function buildPainRun(model: OutcomeModel = getPersona("house").outcome) {
  let run = startRun(model);
  const snapshots: Run[] = [run];
  const accepted = new Set<string>();
  for (let pending = hit(run, model, accepted); pending; pending = hit(run, model, accepted)) {
    const keep = pending.options.find((option) => option.strategy === "keep");
    if (!keep) throw new Error(`Missing unchanged-plan option: ${pending.disruption.id}`);
    run = resolve(run, model, pending, keep.id);
    snapshots.push(run);
  }
  return snapshots.map((snapshot) => ({
    run: snapshot,
    health: planHealth(snapshot.plan, model.constraints),
    checks: checkPlan(snapshot.plan, model.constraints),
  }));
}

export function chapterFor(frame: number) { return frame < 4 ? frame : frame < 8 ? 4 : frame - 3; }
export function frameFor(chapter: number, hitNumber = 1) {
  return chapter < 5 ? chapter - 1 : chapter === 5 ? 3 + Math.min(4, Math.max(1, hitNumber)) : chapter + 2;
}

export function readEntry(search: string) {
  const params = new URLSearchParams(search);
  const scene = Number(params.get("pain"));
  const hasScene = Number.isInteger(scene) && scene >= 1 && scene <= 7;
  const event = Number(params.get("hit")) || 1;
  return {
    skip: !hasScene && (params.get("intro") === "0" || params.has("demo") || params.has("player")),
    frame: hasScene ? frameFor(scene, Math.floor(event)) : 0,
    still: params.get("still") === "1",
  };
}

export const money = (amount: number) => `€${amount.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;

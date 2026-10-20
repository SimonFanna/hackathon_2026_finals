// The UI adapter against the REAL backend, in-process: the fake fetch routes /api/* to the T7 service
// (snapshot facts + rules, in-memory state), with the same validation and status codes as the routes.
import { beforeAll, describe, expect, it } from "vitest";
import { memoryRepo } from "../backend/data/repo";
import { consentBody, eventsBody, goalBody, goalIdParam, handle, parse, scenarioIdParam, slugParam, stepBody, stepIdParam } from "../backend/http";
import { type Deps, runPipeline } from "../backend/pipeline";
import { chooseScenarioFor, consentFor, createGoalFor, injectFor, resetFor, stepActionFor } from "../backend/service";
import { chooseScenario, configureBackend, fetchIntent, injectDisruption, sendConsent, sendStep, startJourney } from "./backend";

const deps: Deps = { db: null, repo: memoryRepo() };

const inProcess: typeof fetch = async (input, init) => {
  const path = new URL(String(input), "http://local").pathname.replace(/^\/api/, "");
  const body = init?.body ? JSON.parse(String(init.body)) : {};
  const seg = path.split("/").filter(Boolean).map(decodeURIComponent);
  return handle(async () => {
    if (seg[0] === "customers" && seg[2] === "pipeline") return runPipeline(parse(slugParam, seg[1]), deps);
    if (seg[0] === "customers" && seg[2] === "reset") return resetFor(parse(slugParam, seg[1]), deps).then(() => ({ ok: true }));
    if (seg[0] === "customers" && seg[2] === "events") return { injected: await injectFor(parse(slugParam, seg[1]), parse(eventsBody, body), deps) };
    if (seg[0] === "goals" && seg.length === 1) {
      const { slug, ...input } = parse(goalBody, body);
      return createGoalFor(slug, input, deps);
    }
    const goalId = parse(goalIdParam, seg[1]);
    if (seg[2] === "steps") return stepActionFor(goalId, parse(stepIdParam, seg[3]), parse(stepBody, body).action, deps);
    if (seg[2] === "consents") return consentFor(goalId, parse(consentBody, body), deps);
    if (seg[2] === "scenarios") return chooseScenarioFor(goalId, parse(scenarioIdParam, seg[3]), deps);
    throw new Error(`no route ${path}`);
  });
};

beforeAll(() => configureBackend({ fetch: inProcess, base: "/api" }));

describe("UI adapter on the real backend", () => {
  it("fetchIntent: Sofie's home intent, Kate's line, the V0 intent id", async () => {
    const r = await fetchIntent("sofie");
    expect(r?.customer).toMatchObject({ name: "Sofie", city: "Gent" });
    expect(r?.intent.intentId).toBe("buy_house");
    expect(["ask", "suggest"]).toContain(r?.intent.level);
    expect(r?.intent.confidence).toBeGreaterThan(0.5);
    expect(r?.intent.reasons.length).toBeGreaterThan(0);
    expect(r?.kateText).toContain("Sofie");
    expect(r?.goalType).toBe("BUY_AND_PREPARE_HOME");
    expect((await fetchIntent("lucas"))?.intent.intentId).toBe("start_business");
  });

  it("startJourney → sendStep → sendConsent: journey, state, gauges and a partner lead", async () => {
    const j = await startJourney("sofie", "BUY_AND_PREPARE_HOME");
    expect(j?.goalId).toBe("goal-1-buy_and_prepare_home");
    expect(j!.journey.steps.length).toBeGreaterThanOrEqual(10);
    expect(j!.journey.chapters.map((c) => c.label)).toContain("Renovate");
    for (const s of j!.journey.steps) expect(j!.journey.chapters.some((c) => c.id === s.chapter)).toBe(true);
    expect(j!.journey.steps.every((s) => s.ecosystem !== "")).toBe(true);
    expect(Object.keys(j!.state.decisions)).toHaveLength(j!.journey.steps.length);
    expect(j!.plan.limits.monthly).toBeGreaterThan(0);
    expect(j!.plan.values.cost).toBeLessThanOrEqual(j!.plan.limits.cost);

    const partner = j!.journey.steps.find((s) => s.provider.kind === "partner" && s.dataShared.length > 0)!;
    expect(await sendStep(j!.goalId, partner.id, "accept")).not.toBeNull();
    const name = partner.provider.kind === "partner" ? partner.provider.name : "";
    const board = await sendConsent(j!.goalId, partner.id, name, partner.dataShared[0], true);
    expect(board?.partners.leads).toBeGreaterThanOrEqual(1);
  });

  it("injectDisruption → chooseScenario: income drop, 2+ options, one recommended, a new plan", async () => {
    const j = await startJourney("sofie", "BUY_AND_PREPARE_HOME");
    const hit = await injectDisruption("sofie", "income_drop");
    expect(hit?.pending.disruption.kind).toBe("income");
    expect(hit!.pending.options.length).toBeGreaterThanOrEqual(2);
    expect(hit!.pending.options.filter((o) => o.recommended)).toHaveLength(1);
    expect(hit!.pending.broken.length).toBeGreaterThan(0);
    expect(hit!.pending.healthHit).toBeLessThan(hit!.pending.healthBefore);
    const pick = hit!.pending.options.find((o) => o.recommended)!;
    const chosen = await chooseScenario(j!.goalId, hit!.scenarioIdByOption[pick.id]);
    expect(chosen?.journey.steps.length).toBeGreaterThan(0);
    expect(chosen?.plan.limits.monthly).toBeGreaterThan(0);
  });

  it("never throws: any failure is null", async () => {
    configureBackend({ fetch: async () => { throw new Error("offline"); } });
    expect(await fetchIntent("sofie")).toBeNull();
    expect(await startJourney("sofie", "BUY_AND_PREPARE_HOME")).toBeNull();
    configureBackend({ fetch: async () => new Response("nope", { status: 500 }) });
    expect(await sendStep("goal-1-x", "s", "accept")).toBeNull();
    configureBackend({ fetch: inProcess });
    expect(await startJourney("sofie", "WELCOME_BABY")).toBeNull(); // 400: no template
  });
});

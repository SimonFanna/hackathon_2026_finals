// T7 — the demo checks (backend/TASKS.md §6), offline: snapshot facts + rules, in-memory state, real engine (T1 → T8).
import { describe, expect, it } from "vitest";
import { memoryRepo } from "./data/repo";
import { type Deps, runPipeline } from "./pipeline";
import { BadRequest } from "./errors";
import { scenarioIdParam } from "./http";
import { chooseScenarioFor, consentFor, createGoalFor, feedbackFor, injectFor, resetFor, stepActionFor } from "./service";

const deps = (): Deps => ({ db: null, repo: memoryRepo() });

describe("pipeline, offline", () => {
  it("runs for every demo persona from the snapshot", async () => {
    const d = deps();
    for (const slug of ["sofie", "lucas", "nadia", "pieter", "els", "thomas"] as const) {
      const r = await runPipeline(slug, d);
      expect(r.source).toEqual({ facts: "snapshot", rules: "snapshot", state: "memory" });
      expect(r.events).toBeGreaterThan(100);
      expect(r.decisions.length).toBeGreaterThan(0);
      expect(Object.keys(r.timings)).toContain("moments");
    }
  });

  it("1. Sofie: HOME_BUYING with evidence, BUY_HOME at ASK or SUGGEST, a proactive Kate message", async () => {
    const r = await runPipeline("sofie", deps());
    const home = r.moments.find((m) => m.type === "HOME_BUYING");
    expect(home?.evidence.length).toBeGreaterThan(0);
    const buy = r.decisions.find((d) => d.intent === "BUY_HOME");
    expect(["ASK", "SUGGEST"]).toContain(buy?.level);
    expect(r.kate?.kind).toBe("proactive");
    expect(r.kate?.text).toContain("Sofie");
  });

  it("1b. Sofie says yes: a BUY_AND_PREPARE_HOME plan, ≥ 10 steps, ≥ 3 partners, dependency order, held products covered, partner steps need consent", async () => {
    const d = deps();
    const { goal, plan } = await createGoalFor("sofie", { type: "BUY_AND_PREPARE_HOME", constraints: {}, priorities: ["affordability"] }, d);
    expect(goal.type).toBe("BUY_AND_PREPARE_HOME");
    const steps = plan.steps.filter((s) => s.display !== "HIDDEN");
    expect(steps.length).toBeGreaterThanOrEqual(10);
    expect(new Set(steps.filter((s) => s.provider.isPartner).map((s) => s.provider.provider)).size).toBeGreaterThanOrEqual(3);
    const order = new Map(plan.steps.map((s) => [s.id, s.order]));
    for (const s of plan.steps) for (const dep of s.dependsOn) expect(order.get(dep)!).toBeLessThan(s.order);
    const r = await runPipeline("sofie", d);
    const held = new Set(r.context.heldSourceRows);
    for (const s of r.plans[0].steps) {
      if (held.has(s.provider.sourceRow)) expect(s.display).toBe("ALREADY_COVERED");
      else if (s.provider.isPartner && s.display !== "HIDDEN" && s.display !== "WAIT") expect(s.display).toBe("SHOW_PARTNER");
    }
    const partnerStep = plan.steps.find((s) => s.provider.isPartner && s.dataRequested.length > 0)!;
    await stepActionFor(goal.id, partnerStep.id, "accept", d); // data is shared only on accepted steps
    const c = await consentFor(goal.id, { stepId: partnerStep.id, partner: partnerStep.provider.provider, field: partnerStep.dataRequested[0], granted: true }, d);
    expect(c.sharedData.find((x) => x.partner === partnerStep.provider.provider)?.fields).toContain(partnerStep.dataRequested[0]);
  });

  it("2. Sofie income drop: INCOME_DROP, plan at risk, 2 scenarios, commercial steps WAIT; choosing one gives a new plan version", async () => {
    const d = deps();
    const { goal, plan } = await createGoalFor("sofie", { type: "BUY_AND_PREPARE_HOME", constraints: {}, priorities: ["affordability"] }, d);
    await injectFor("sofie", { preset: "income_drop" }, d);
    const r = await runPipeline("sofie", d);
    expect(r.disruptions.map((x) => x.code)).toContain("INCOME_DROP");
    expect(r.plans[0].atRisk).toBe(true);
    expect(r.scenarios.length).toBeGreaterThanOrEqual(2);
    expect(new Set(r.scenarios.slice(0, 2).map((s) => s.monthlyPayment)).size).toBe(2);
    expect(r.plans[0].steps.some((s) => s.display === "WAIT")).toBe(true);
    expect(r.kate?.kind).toBe("scenario_choice");
    const chosen = await chooseScenarioFor(goal.id, r.scenarios[0].id, d);
    expect(chosen.plan.version).toBeGreaterThan(plan.version);
    expect(chosen.outcome.goalId).toBe(goal.id);
  });

  it("3. Lucas: STARTING_BUSINESS → a START_BUSINESS plan built by the same code", async () => {
    const d = deps();
    const r = await runPipeline("lucas", d);
    expect(r.moments.some((m) => m.type === "STARTING_BUSINESS")).toBe(true);
    const { plan } = await createGoalFor("lucas", { type: "START_BUSINESS", constraints: {}, priorities: ["speed"] }, d);
    expect(plan.steps.map((s) => s.capability)).toContain("open_business_account");
  });

  it("4. Els and Thomas: no proactive message, with a why-not explanation", async () => {
    for (const slug of ["els", "thomas"] as const) {
      const r = await runPipeline(slug, deps());
      expect(r.decisions.every((x) => x.level === "NO_ACTION" || x.level === "WAIT")).toBe(true);
      expect(r.decisions.some((x) => x.explanation.length > 0)).toBe(true);
      expect(r.kate).toBeNull();
    }
  });

  it("reset wipes the persona's runtime state", async () => {
    const d = deps();
    await createGoalFor("sofie", { type: "BUY_AND_PREPARE_HOME", constraints: {}, priorities: [] }, d);
    await injectFor("sofie", { preset: "income_drop" }, d);
    await resetFor("sofie", d);
    const r = await runPipeline("sofie", d);
    expect(r.goals).toEqual([]);
    expect(r.disruptions).toEqual([]);
  });

  it("review fixes: double preset click, real scenario ids, re-created goal, goal types without a template, feedback", async () => {
    const d = deps();
    const { goal } = await createGoalFor("sofie", { type: "BUY_AND_PREPARE_HOME", constraints: {}, priorities: [] }, d);
    await injectFor("sofie", { preset: "income_drop" }, d);
    await injectFor("sofie", { preset: "income_drop" }, d); // #3: second click must not cancel the disruption
    const r = await runPipeline("sofie", d);
    expect(r.disruptions.map((x) => x.code)).toContain("INCOME_DROP");
    for (const sc of r.scenarios) expect(scenarioIdParam.safeParse(sc.id).success).toBe(true); // #2
    await chooseScenarioFor(goal.id, r.scenarios[0].id, d);
    const again = await createGoalFor("sofie", { type: "BUY_AND_PREPARE_HOME", constraints: {}, priorities: [] }, d); // P1: fresh v1
    expect((await d.repo.getPlan(goal.id))?.version).toBe(again.plan.version);
    expect(await d.repo.getConsents(goal.id)).toEqual([]);
    await expect(createGoalFor("nadia", { type: "WELCOME_BABY", constraints: {}, priorities: [] }, d)).rejects.toBeInstanceOf(BadRequest); // #5
    await resetFor("sofie", d);
    await feedbackFor("sofie", { target: "BUY_HOME", kind: "no" }, d); // #8: "No" silences the proposal
    const after = await runPipeline("sofie", d);
    expect(after.decisions.find((x) => x.intent === "BUY_HOME")?.level).not.toMatch(/ASK|SUGGEST/);
  });

  it("still answers when persisting derived rows fails (a concurrent reset deleted the goal: FK violation)", async () => {
    const repo = memoryRepo();
    const fk = () => Promise.reject(new Error('insert or update on table "scenarios" violates foreign key constraint "scenarios_goal_id_fkey"'));
    const d: Deps = { db: null, repo: { ...repo, saveScenarios: fk, saveOutcome: fk, saveRunOutput: fk, saveKateMessage: fk } };
    await createGoalFor("sofie", { type: "BUY_AND_PREPARE_HOME", constraints: {}, priorities: [] }, { db: null, repo });
    await injectFor("sofie", { preset: "cost_overrun" }, d);
    const r = await runPipeline("sofie", d);
    expect(r.decisions.length).toBeGreaterThan(0);
  });

  it("creating a goal still answers when saving its outcome fails (concurrent reset)", async () => {
    const repo = memoryRepo();
    const d: Deps = { db: null, repo: { ...repo, saveOutcome: () => Promise.reject(new Error("outcomes_goal_id_fkey")) } };
    const { plan, outcome } = await createGoalFor("sofie", { type: "BUY_AND_PREPARE_HOME", constraints: {}, priorities: [] }, d);
    expect(plan.steps.length).toBeGreaterThan(0);
    expect(outcome.goalId).toBe(plan.goalId);
  });

  it("creating a goal survives a reset that deletes it mid-write (plans FK), by re-saving once", async () => {
    const repo = memoryRepo();
    let first = true;
    const d: Deps = { db: null, repo: { ...repo, savePlan: (p) => {
      if (first) { first = false; return Promise.reject(new Error('insert or update on table "plans" violates foreign key constraint "plans_goal_id_fkey"')); }
      return repo.savePlan(p);
    } } };
    const { goal, plan } = await createGoalFor("sofie", { type: "BUY_AND_PREPARE_HOME", constraints: {}, priorities: [] }, d);
    expect(await repo.getGoal(goal.id)).not.toBeNull();
    expect((await repo.getPlan(goal.id))?.id).toBe(plan.id);
  });

  it("three active surprises never yield duplicate scenario ids, and Kate's pick stays choosable (live 404)", async () => {
    const d = deps();
    const { goal } = await createGoalFor("sofie", { type: "BUY_AND_PREPARE_HOME", constraints: {}, priorities: [] }, d);
    for (const preset of ["cost_overrun", "partner_delay", "income_drop"] as const) {
      await injectFor("sofie", { preset }, d);
      const r = await runPipeline("sofie", d);
      const ids = r.scenarios.map((x) => x.id);
      expect(new Set(ids).size, preset).toBe(ids.length);
      const pick = r.kate?.refs?.scenarioIds?.[0] ?? ids[0];
      await chooseScenarioFor(goal.id, pick, d);
    }
  });
});


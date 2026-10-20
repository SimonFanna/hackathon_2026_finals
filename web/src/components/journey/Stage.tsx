"use client";

import { ArrowLeft } from "@phosphor-icons/react";
import { AnimatePresence, LayoutGroup, motion, useAnimate, useReducedMotion } from "motion/react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  advance, buildJourney, decide, detectIntents, getPersona, hit, initState, isComplete, resolve, scoreboard, setConsent, startRun,
  type DetectedIntent, type DisruptionKind, type Journey, type JourneyState, type JourneyStep, type OutcomeModel, type OutcomePlan,
  type PendingHit, type Persona, type Resolution, type Run, type Scoreboard,
} from "@/engine";
import {
  SLUG_FOR, chooseScenario, fetchIntent, injectDisruption, resetPersona, sendConsent, sendStep, startJourney,
  type BackendIntent, type BackendJourney, type Preset,
} from "@/lib/backend";
import { affectedStep, BuildStage } from "../build/BuildStage";
import type { PlanPersona } from "../custom/CustomPlayer";
import { CharacterSelect3D } from "../picker/CharacterSelect3D";
import { ChapterScreen } from "./ChapterScreen";
import { ChapterStepsScreen } from "./ChapterStepsScreen";
import { providerName } from "./copy";
import { demoPersona } from "./demoDisruptions";
import { buildStepAlias, withLocalAliases } from "./stepAlias";
import { buildDemoSequence, type DemoPage } from "./demoSequence";
import { EngineHud, type AdaptStep, type Phase } from "./EngineHud";
import { EventPage } from "./EventPage";
import { Finale } from "./Finale";
import { HomeScreen } from "./HomeScreen";
import { DeclinedScreen, IntentScreen } from "./IntentScreen";
import { LiveScreen, rankOptions } from "./OutcomeScreens";
import { PathScreen } from "./PathScreen";
import { FRAME_H, Phone } from "./Phone";
import { PlanScreen } from "./PlanScreen";
import { PresenterPanel } from "./PresenterPanel";
import { EstimateSheet, WhySheet } from "./Sheets";
import { groupPages, pageOfStep } from "./stepPages";
import { useViewport } from "./useViewport";

// "Your own" player (Demo V2 P5): code-split, it bundles the backend snapshot and the moment model.
const CustomPlayer = dynamic(() => import("../custom/CustomPlayer").then((m) => m.CustomPlayer), { ssr: false });

/** After the plan (Demo V2): "chapter" and "event" are the pages of `buildDemoSequence`, then "finale". */
type Screen = "select" | "custom" | "home" | "intent" | "declined" | "path" | "step" | "plan" | "chapter" | "event" | "finale";
type SheetName = null | "why" | "estimate";
type Move = "forward" | "accept" | "skip" | "back";
/** "real" = the persona's signals; "weak" = only the weakest one, so the engine deliberately does nothing. */
type SignalSet = "real" | "weak";
type PersonaId = Persona["id"];

/** Kate's proposal: every detail pre-ticked, so each card starts from "share and continue" and can be unticked. */
function proposeAll(st: JourneyState): JourneyState {
  for (const s of st.journey.steps) for (const f of s.dataShared) st = setConsent(st, s.id, f, true);
  return st;
}

/** Accept every step and share every field: the state the ?demo= backups jump to. */
function acceptAll(journey: Journey): JourneyState {
  let st = proposeAll(initState(journey));
  for (const s of journey.steps) st = decide(st, s.id, "accepted");
  return st;
}

/** Steps accepted from one page drop into the 3D build one after the other, this far apart. */
const CASCADE_MS = 120;

/** Plays every surprise with Kate's recommendation: the ?demo=finale backup. */
function autoPlay(model: OutcomeModel, accepted: ReadonlySet<string>): Run {
  let run = startRun(model);
  for (let p = hit(run, model, accepted); p; p = hit(run, model, accepted)) {
    run = resolve(run, model, p, p.options.find((o) => o.recommended)!.id);
  }
  return advance(run, Math.max(model.horizon, run.plan.values.finish));
}

/**
 * The engine on page `i` of the sequence: every surprise before it replayed (keeping the customer's earlier picks,
 * Kate's otherwise), and, on an event page, that surprise hitting the plan. Deterministic, so ← and deep links agree.
 */
function runForPage(
  model: OutcomeModel, pages: DemoPage[], i: number, accepted: ReadonlySet<string>, history: Resolution[],
): { run: Run; pending: PendingHit | null } {
  let run = startRun(model);
  for (const pg of pages.slice(0, i)) {
    if (pg.kind !== "event") continue;
    const ph = hit(run, model, accepted);
    if (!ph) break;
    const past = history[run.next]?.optionId;
    const opt = ph.options.find((o) => o.id === past && o.available) ?? ph.options.find((o) => o.recommended)!;
    run = resolve(run, model, ph, opt.id);
  }
  if (pages[i]?.kind === "event") {
    const pending = hit(run, model, accepted);
    if (pending) return { run: advance(run, pending.disruption.month), pending };
  }
  return { run, pending: null };
}

const EMPTY: Scoreboard = {
  customer: { eurOneOff: 0, eurPerYear: 0, kwhPerYear: 0, co2KgPerYear: 0 },
  kbc: { productsActivated: 0, revenueEur: 0 },
  partners: { leads: 0, valueEur: 0 },
};

const isPersonaId = (v: string | null): v is PersonaId => v === "house" || v === "business";

/** The surprises the backend can replay (T6). Others (e.g. a rate rise) stay on the local story. */
const PRESET_FOR: Partial<Record<DisruptionKind, Preset>> = { cost: "cost_overrun", delay: "partner_delay", income: "income_drop" };

/** The backend speaks about its own synthetic customer (Sofie, Lucas); the story keeps the player's name. */
function renameIntent(be: BackendIntent, name: string): DetectedIntent {
  const swap = (s: string) => s.split(be.customer.name).join(name);
  return { ...be.intent, label: swap(be.intent.label), reasons: be.intent.reasons.map(swap) };
}

/** A backend surprise shown in the local story: keeps the local id and month (the timeline, the finale) and the player's name. */
function asLocalHit(be: PendingHit, local: PendingHit, from: string | undefined, name: string): PendingHit {
  const swap = (s: string) => (from ? s.split(from).join(name) : s);
  const options = be.options.map((o) => ({ ...o, label: swap(o.label), tradeoff: swap(o.tradeoff) }));
  return {
    ...be,
    options,
    disruption: {
      ...be.disruption, id: local.disruption.id, month: local.disruption.month,
      title: swap(be.disruption.title), detail: swap(be.disruption.detail), options,
    },
  };
}

export function Stage() {
  const [personaId, setPersonaId] = useState<PersonaId>("business"); // the entrepreneur is player 1
  const [picked, setPicked] = useState<PersonaId>("business");
  const persona = demoPersona(getPersona(personaId)); // two surprises per player (Demo V2, demoDisruptions.ts)
  const { customer, outcome: model } = persona;

  const [signalSet, setSignalSet] = useState<SignalSet>("real");
  const signals = useMemo(() => {
    const own = persona.signals.filter((s) => s.customerId === persona.customer.id);
    if (signalSet === "real") return own;
    const w = persona.intentModel.weights;
    return [...own].sort((a, b) => (w[a.type] ?? 0) - (w[b.type] ?? 0)).slice(0, 1);
  }, [persona, signalSet]);
  const localIntent = useMemo(() => detectIntents(customer, signals, persona.intentModel)[0], [customer, signals, persona.intentModel]);

  // Live backend (T1–T8 behind /api): ML confidence, plan, consents, outcome and replanning.
  // Every call returns null when the API is unreachable, and the screen then keeps the local engine.
  const slug = SLUG_FOR[personaId];
  const [beIntent, setBeIntent] = useState<BackendIntent | null>(null);
  const [beGoal, setBeGoal] = useState<string | null>(null);
  const [beBoard, setBeBoard] = useState<Scoreboard | null>(null);
  const [bePlan, setBePlan] = useState<OutcomePlan | null>(null);
  const [beScenarios, setBeScenarios] = useState<Record<string, string> | null>(null);
  const keepGoal = useRef<string | null>(null); // the "Your own" player just created this slug's goal: don't wipe it
  const pendingReset = useRef<Promise<boolean> | null>(null); // startJourney waits for it instead of resetting again
  useEffect(() => {
    let live = true;
    // A previous run leaves a goal in progress, and the engine then rightly stays quiet: each demo run starts fresh.
    const fresh = keepGoal.current === slug ? Promise.resolve(true) : resetPersona(slug);
    pendingReset.current = fresh;
    if (keepGoal.current !== slug) keepGoal.current = null;
    fresh
      .then(() => fetchIntent(slug))
      .then((r) => {
        if (live) setBeIntent(r);
      });
    return () => {
      live = false;
    };
  }, [slug]);
  const intent = signalSet === "real" && beIntent && beIntent.intent.intentId === localIntent?.intentId
    ? renameIntent(beIntent, customer.name)
    : localIntent;
  const speaks = !!intent && intent.level !== "none";

  const [screen, setScreen] = useState<Screen>("select");
  const [notif, setNotif] = useState(false);
  const [dismissed, setDismissed] = useState(false); // the notification was slid away; the Kate pill brings it back
  const [state, setState] = useState<JourneyState | null>(null);
  const [index, setIndex] = useState(0); // the page of the step flow (Demo V2: a few steps per page)
  const cascading = useRef(false); // a page's accepts are dropping into the build; ignore repeated Enter
  const [sheet, setSheet] = useState<SheetName>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [presenter, setPresenter] = useState(false);
  const [move, setMove] = useState<Move>("forward");
  const [run, setRun] = useState<Run | null>(null);
  const [page, setPage] = useState(0); // index into `pages` while on a chapter or event page
  const [pending, setPending] = useState<PendingHit | null>(null);
  const [adaptStep, setAdaptStep] = useState<AdaptStep>("replan");
  const [selected, setSelected] = useState<string | null>(null);
  const [lastChanged, setLastChanged] = useState<string[]>([]);
  const [shock, setShock] = useState(0);
  const reduce = useReducedMotion();
  const [phoneScope, animatePhone] = useAnimate<HTMLDivElement>();
  const pickerPlay = useRef<((id: PersonaId) => void) | null>(null); // the 3D picker's dive, when it is showing

  const { w, h } = useViewport();
  const framed = w >= 520;
  const finale = screen === "finale";
  const stageFinale = finale && framed && w >= 1100;
  const showHud = framed && w >= 1100 && screen !== "select" && !stageFinale;
  // Demo V2 P4: the 3D build on the left (phone centre, HUD right). At the stage finale only when there is room.
  const showBuild = framed && w >= 1100 && screen !== "select" && (!stageFinale || w >= 1600);
  const base = Math.min((h * 0.92) / FRAME_H, 1.3);
  const scale = stageFinale ? base * 0.82 : base;

  const board = beGoal && beBoard ? beBoard : state ? scoreboard(state) : EMPTY;
  const steps = state?.journey.steps ?? [];
  const stepPages = useMemo(() => (state ? groupPages(state.journey) : []), [state]);
  const pageSteps = useMemo(() => (screen === "step" ? stepPages[index]?.steps ?? [] : []), [screen, stepPages, index]);
  const step = screen === "step" && state ? pageSteps.find((s) => state.decisions[s.id] === "pending") ?? pageSteps[0] ?? null : null;
  // The journey may be the backend's (its own step ids): the engine's surprises keep the local ids, so the
  // accepted set carries both (matched by catalogue item), and the build gets the journey's id for a hit.
  const alias = useMemo(() => buildStepAlias(persona.journey, state?.journey), [persona, state]);
  const accepted = useMemo(
    () => withLocalAliases(state ? state.journey.steps.filter((s) => state.decisions[s.id] === "accepted").map((s) => s.id) : [], alias),
    [state, alias],
  );
  const skipped = useMemo(
    () => (state ? state.journey.steps.filter((s) => state.decisions[s.id] === "skipped").map((s) => s.id) : []),
    [state],
  );
  const actualStep = (id: string | null) => (id ? alias.toActual.get(id) ?? id : null);
  const finishLine = run ? Math.max(model.horizon, run.plan.values.finish) : model.horizon;
  const pages = useMemo(() => buildDemoSequence(persona, accepted, state?.journey), [persona, accepted, state]); // the journey may be the backend's

  // Kate's notification arrives shortly after the home screen settles, unless the engine chose NO_ACTION.
  useEffect(() => {
    if (screen !== "home" || !speaks) return;
    const t = setTimeout(() => setNotif(true), 1200);
    return () => clearTimeout(t);
  }, [screen, speaks]);

  // On an event page the HUD shows "Options scored" first, then hands over to the customer.
  useEffect(() => {
    if (screen !== "event") return;
    const t = setTimeout(() => setAdaptStep("decide"), 1100);
    return () => clearTimeout(t);
  }, [screen, page]);

  // Pitch backups: ?player=house|business, and ?demo=intent | step[&n=6] | live | event[&n=2] | finale | weak.
  // ?demo=event&n=N lands on the Nth surprise's page of the post-plan sequence (chapters and surprises interleaved).
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const player = p.get("player");
    const demo = p.get("demo");
    if (!demo && !isPersonaId(player)) return;
    const t = setTimeout(() => {
      const id: PersonaId = isPersonaId(player) ? player : "business";
      const ps = demoPersona(getPersona(id));
      setPersonaId(id);
      setPicked(id);
      setScreen("home");
      if (!demo) return;
      if (demo === "weak") return setSignalSet("weak");
      const journey = buildJourney(ps.journey.intentId, ps.customer);
      if (demo === "intent") return setScreen("intent");
      if (demo === "step") {
        // Lands on the page that holds step n.
        const n = Math.min(Math.max(Number(p.get("n") ?? 1) || 1, 1), journey.steps.length);
        setState(proposeAll(initState(journey)));
        setIndex(pageOfStep(groupPages(journey), journey.steps[n - 1].id));
        return setScreen("step");
      }
      const all = acceptAll(journey);
      const ids = new Set(journey.steps.map((s) => s.id));
      if (demo === "finale") {
        setState(all);
        setRun(autoPlay(ps.outcome, ids));
        return setScreen("finale");
      }
      if (demo === "live" || demo === "event" || demo === "options") {
        // Kate's picks for every surprise before page n; page n is shown as the customer would reach it.
        const seq = buildDemoSequence(ps, ids);
        // ?demo=event&n=N = the Nth surprise (its page); ?demo=live&n=N = page N; ?demo=live = page 1.
        const raw = Math.max(Number(p.get("n") ?? 1) || 1, 1);
        const events = seq.map((pg, i) => (pg.kind === "event" ? i + 1 : 0)).filter(Boolean);
        const n = demo === "live" ? Math.min(raw, seq.length) : (events[Math.min(raw, events.length) - 1] ?? seq.length);
        const at = runForPage(ps.outcome, seq, n - 1, ids, []);
        setState(all);
        setRun(at.run);
        setPage(n - 1);
        setPending(at.pending);
        setSelected(at.pending?.options.find((o) => o.recommended)?.id ?? null);
        return setScreen(seq[n - 1].kind);
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const go = (s: Screen, m: Move = "forward") => {
    setMove(m);
    setSheet(null);
    setDismissed(false);
    setScreen(s);
  };

  const clearJourney = () => {
    setState(null);
    setIndex(0);
    cascading.current = false;
    setNotif(false);
    setToast(null);
    setRun(null);
    setPending(null);
    setSelected(null);
    setLastChanged([]);
    setBeGoal(null);
    setBeBoard(null);
    setBePlan(null);
    setBeScenarios(null);
  };

  /** Mirrors a step decision (and its consents) to the backend; the backend's outcome becomes the scoreboard. */
  const syncSteps = (items: { s: JourneyStep; action: "accept" | "skip" }[], st: JourneyState) => {
    if (!beGoal) return;
    const goal = beGoal;
    void (async () => {
      for (const { s, action } of items) {
        if (action === "accept" && s.provider.kind === "partner") {
          for (const f of s.dataShared) {
            const b = await sendConsent(goal, s.id, s.provider.name, f, !!st.consents[s.id]?.[f]);
            if (b) setBeBoard(b);
          }
        }
        const b = await sendStep(goal, s.id, action);
        if (b) setBeBoard(b);
      }
    })();
  };

  const reset = (next: SignalSet = signalSet) => {
    setSignalSet(next);
    clearJourney();
    go("home", "back");
  };

  const play = (id: PersonaId) => {
    setPersonaId(id);
    setPicked(id);
    setSignalSet("real");
    clearJourney();
    go("home");
  };

  const toPlayers = () => {
    clearJourney();
    setPicked(personaId);
    go("select", "back");
  };

  const confirming = useRef(false); // startJourney may take seconds: a second → / Enter meanwhile must not start a second goal
  const confirm = async () => {
    if (!intent || confirming.current) return;
    confirming.current = true;
    const reset = pendingReset.current ?? undefined; // one reset per run: the one the stage already started, if any
    pendingReset.current = null;
    let live: Awaited<ReturnType<typeof startJourney>> = null;
    try {
      live = intent !== localIntent && beIntent?.goalType ? await startJourney(slug, beIntent.goalType, reset) : null;
    } finally {
      confirming.current = false;
    }
    if (live) {
      // Start from the local shape (every step and consent field present), then apply the backend's decisions.
      const base = initState(live.journey);
      const consents = { ...base.consents };
      for (const [id, fields] of Object.entries(live.state.consents ?? {})) consents[id] = { ...consents[id], ...fields };
      setState(proposeAll({ ...base, decisions: { ...base.decisions, ...live.state.decisions }, consents }));
      setBeGoal(live.goalId);
      setBeBoard(live.board);
      // Gauges follow the backend plan only when it has a real budget (the business goal has none: the story keeps its own).
      setBePlan(live.plan.limits.cost > 1 ? live.plan : null);
    } else setState(proposeAll(initState(buildJourney(intent.intentId, customer))));
    setIndex(0);
    go("path");
  };

  /** "Your own" player (P5): its backend plan (or null → the local engine) goes straight into the phone flow. */
  const handoff = (id: PlanPersona, live: BackendJourney | null, from: string) => {
    clearJourney();
    if (live && from === SLUG_FOR[id]) keepGoal.current = from;
    setPersonaId(id);
    setPicked(id);
    setSignalSet("real");
    if (live) {
      const base = initState(live.journey);
      setState(proposeAll({ ...base, decisions: { ...base.decisions, ...live.state.decisions } }));
      setBeGoal(live.goalId);
      setBeBoard(live.board);
      setBePlan(live.plan.limits.cost > 1 ? live.plan : null);
    } else setState(proposeAll(initState(buildJourney(getPersona(id).journey.intentId, getPersona(id).customer))));
    go("path");
  };

  const next = (m: Move) => {
    if (index + 1 < stepPages.length) {
      setMove(m);
      setSheet(null);
      setIndex(index + 1);
    } else go("plan", m);
  };

  /**
   * Primary on a step page: accepts every step still proposed on it (skipped cards stay skipped), then the next page.
   * The backend gets every step and consent in one loop; the phone state takes them one by one, `CASCADE_MS`
   * apart, so the pieces drop into the 3D build as a cascade.
   */
  const acceptPage = () => {
    if (!state || cascading.current) return;
    const todo = pageSteps.filter((s) => state.decisions[s.id] === "pending");
    const skippedHere = pageSteps.filter((s) => state.decisions[s.id] === "skipped");
    let st = state;
    for (const s of todo) st = decide(st, s.id, "accepted");
    syncSteps([...todo.map((s) => ({ s, action: "accept" as const })), ...skippedHere.map((s) => ({ s, action: "skip" as const }))], st);
    const quiet = todo.filter((s) => s.provider.kind === "partner" && s.dataShared.length > 0 && !Object.values(st.consents[s.id] ?? {}).some(Boolean));
    if (quiet.length > 0) showToast(`Added without sharing. ${quiet.map(providerName).join(" and ")} won't contact you.`);
    if (todo.length === 0) return next("accept");
    cascading.current = true;
    todo.forEach((s, i) => {
      setTimeout(() => setState((prev) => (prev && prev.decisions[s.id] === "pending" ? decide(prev, s.id, "accepted") : prev)), i * CASCADE_MS);
    });
    setTimeout(() => {
      cascading.current = false;
      next("accept");
    }, (todo.length - 1) * CASCADE_MS + 320);
  };

  /** S on a step page: every step still proposed on it is skipped, then the next page. */
  const skipPage = () => {
    if (!state || cascading.current) return;
    const todo = pageSteps.filter((s) => state.decisions[s.id] === "pending");
    let st = state;
    for (const s of todo) st = decide(st, s.id, "skipped");
    setState(st);
    syncSteps(todo.map((s) => ({ s, action: "skip" as const })), st);
    next("skip");
  };

  /** A card's Skip / Undo: the piece ghosts in the build at once; the backend hears about it with the page. */
  const toggleStepSkip = (id: string) => {
    if (!state || cascading.current) return;
    setState(decide(state, id, state.decisions[id] === "skipped" ? "pending" : "skipped"));
  };

  const toggleConsent = (id: string, field: string, ok: boolean) => {
    if (!state) return;
    setState(setConsent(state, id, field, ok));
  };

  /** Presenter shortcut (F): add every remaining step as proposed, then show the plan. */
  const fillPlan = () => {
    if (!state) return;
    let st = state;
    const added: JourneyStep[] = [];
    for (const s of st.journey.steps) {
      if (st.decisions[s.id] !== "pending") continue;
      for (const f of s.dataShared) st = setConsent(st, s.id, f, true);
      st = decide(st, s.id, "accepted");
      added.push(s);
    }
    setState(st);
    syncSteps(added.map((s) => ({ s, action: "accept" as const })), st);
    go("plan");
  };

  /**
   * Shows page `i` of the post-plan sequence; past the last page, the finale. Forward moves keep the current run
   * (its plan may come from the backend); ← replays the engine up to the page, so back and deep links agree.
   * On an event page the surprise is replayed in the backend (T6) when it can: its impact and scenarios A/B replace
   * the scripted ones; otherwise (no backend, other kind of surprise, API down) the local story plays.
   */
  const navigating = useRef(false); // a page change may await the backend: a second → / Enter meanwhile is ignored
  const showPage = async (i: number, m: Move, from: Run) => {
    if (navigating.current) return;
    navigating.current = true;
    try {
      await turnPage(i, m, from);
    } finally {
      navigating.current = false;
    }
  };
  const turnPage = async (i: number, m: Move, from: Run) => {
    if (i >= pages.length) {
      setRun(advance(from, finishLine));
      setPending(null);
      go("finale", m);
      return;
    }
    const base = m === "back" ? runForPage(model, pages, i, accepted, from.history).run : from;
    let p: PendingHit | null = null;
    let scenarios: Record<string, string> | null = null;
    if (pages[i].kind === "event") {
      const local = hit(base, model, accepted);
      if (local) {
        p = local;
        const preset = beGoal && m !== "back" ? PRESET_FOR[local.disruption.kind] : undefined;
        const live = preset ? await injectDisruption(slug, preset) : null;
        const fromBackend = !!live && live.pending.options.length > 0 && live.pending.disruption.kind === local.disruption.kind;
        if (fromBackend) {
          p = asLocalHit(live.pending, local, beIntent?.customer.name, customer.name);
          scenarios = live.scenarioIdByOption;
        }
      }
    }
    setBeScenarios(scenarios);
    setRun(p ? advance(base, p.disruption.month) : base);
    setPage(i);
    setPending(p);
    setSelected(p?.options.find((o) => o.recommended)?.id ?? null);
    setAdaptStep("replan");
    go(pages[i].kind, m);
    if (p && m !== "back") {
      setShock((n) => n + 1);
      if (!reduce && phoneScope.current) animatePhone(phoneScope.current, { x: [0, -10, 10, -7, 7, -3, 0] }, { duration: 0.45 });
    }
  };

  const openPage = (i: number, m: Move = "forward") => {
    if (!run) return;
    setLastChanged([]);
    void showPage(i, m, run);
  };

  const startPlan = () => {
    const r0 = startRun(model);
    const r = bePlan ? { ...r0, plan: bePlan } : r0; // the gauges start from the backend's real plan when there is one
    setRun(r);
    setLastChanged([]);
    void showPage(0, "forward", r);
  };

  /** The customer picks an option on an event page: the plan moves on with it, then the next page. */
  const choose = async () => {
    if (!run || !pending || !selected || navigating.current) return;
    const opt = pending.options.find((o) => o.id === selected);
    if (!opt?.available) return;
    const sid = beScenarios?.[selected];
    navigating.current = true;
    const live = beGoal && sid ? await chooseScenario(beGoal, sid).catch(() => null) : null;
    navigating.current = false;
    const resolved = resolve(run, model, pending, selected);
    let next = resolved;
    if (live) {
      next = { ...resolved, plan: live.plan }; // the backend's new plan version drives the gauges
      setBeBoard(live.board);
      setBePlan(live.plan);
    }
    setRun(next);
    setBeScenarios(null);
    setLastChanged(opt.changes?.map((c) => c.stepId) ?? []);
    showToast(opt.recommended ? `Plan updated: ${opt.label}.` : `Your call: ${opt.label}.`);
    void showPage(page + 1, "accept", next);
  };

  const back = () => {
    if (screen === "step") {
      if (index > 0) {
        setMove("back");
        setIndex(index - 1);
      } else go("path", "back");
    } else if (screen === "path") go("intent", "back");
    else if (screen === "intent") go("home", "back");
    else if (screen === "plan") {
      setIndex(stepPages.length - 1);
      go("step", "back");
    } else if (screen === "chapter" || screen === "event") {
      if (page > 0) openPage(page - 1, "back");
      else go("plan", "back");
    } else if (screen === "finale") openPage(pages.length - 1, "back");
    else if (screen === "home") toPlayers();
  };

  // Keys: → / Enter next, ← back, S skip, F fill the plan, 1–4 pick an option, R restart, C players, P presenter, W weak signals.
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  const onKey = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    const onControl = !!t && ["BUTTON", "INPUT", "A", "TEXTAREA"].includes(t.tagName);
    const k = e.key.toLowerCase();

    if (screen === "custom") return; // the custom player has its own keys (Esc = back)
    if (screen === "select") {
      if (k === "3") return setScreen("custom");
      if (k === "arrowleft") return setPicked("business"); // Lina is on the left, Thomas on the right
      if (k === "arrowright") return setPicked("house");
      if (k === "1") return setPicked("business");
      if (k === "2") return setPicked("house");
      if (k === "enter" && !onControl) return (pickerPlay.current ?? play)(picked);
      return;
    }

    if (k === "p") return setPresenter((v) => !v);
    if (k === "r") return reset();
    if (k === "c") return toPlayers();
    if (k === "w" && presenter) return reset(signalSet === "weak" ? "real" : "weak");
    if (sheet) return;
    if (k === "f" && (screen === "path" || screen === "step")) return fillPlan();
    if (screen === "event" && pending && /^[1-9]$/.test(k)) {
      const o = rankOptions(pending.options)[Number(k) - 1];
      if (o?.available) setSelected(o.id);
      return;
    }
    if (k === "escape" && screen === "home" && notif) return setDismissed(true);
    if (k === "arrowleft") return back();
    if (k === "s") {
      if (screen === "step") skipPage();
      else if (screen === "intent") go("declined");
      return;
    }
    if (k === "arrowright" || (k === "enter" && !onControl)) {
      e.preventDefault();
      if (screen === "home" && (notif || dismissed)) go("intent");
      else if (screen === "intent") confirm();
      else if (screen === "declined") reset();
      else if (screen === "path") go("step");
      else if (screen === "step") acceptPage();
      else if (screen === "plan") startPlan();
      else if (screen === "chapter") openPage(page + 1);
      else if (screen === "event") choose();
    }
  };
  useEffect(() => {
    keyRef.current = onKey;
  });
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  if (screen === "select") {
    return <CharacterSelect3D selected={picked} onSelect={setPicked} onPlay={play} compact={!framed} playRef={pickerPlay} onCustom={() => setScreen("custom")} />;
  }
  if (screen === "custom") return <CustomPlayer onBack={() => setScreen("select")} onPlan={handoff} />;

  // Screen transitions: forward/accept enter from the right; skip leaves to the left; back reverses.
  const variants = {
    enter: (m: Move) => (reduce ? { opacity: 0 } : { opacity: 0, x: m === "back" ? -24 : 24 }),
    center: { opacity: 1, x: 0, y: 0, scale: 1 },
    exit: (m: Move) =>
      reduce
        ? { opacity: 0, transition: { duration: 0.15 } }
        : m === "accept"
          ? { opacity: 0, y: -16, scale: 0.96, transition: { duration: 0.28, ease: [0.23, 1, 0.32, 1] as const } }
          : m === "skip"
            ? { opacity: 0, x: -40, transition: { duration: 0.2, ease: [0.23, 1, 0.32, 1] as const } }
            : { opacity: 0, x: m === "back" ? 24 : -24, transition: { duration: 0.2, ease: [0.23, 1, 0.32, 1] as const } },
  };

  const screenKey = screen === "step" ? `step-${index}` : screen === "chapter" || screen === "event" ? `${screen}-${page}` : screen;
  const showAppFinale = finale && !stageFinale;

  const phase: Phase =
    screen === "home" || screen === "intent" || screen === "declined"
      ? "detect"
      : screen === "path" || screen === "step" || screen === "plan"
        ? "plan"
        : screen === "event"
          ? "adapt"
          : run && isComplete(run, model) && run.month >= finishLine
            ? "outcome"
            : "execute";
  const eventIndex = run?.next ?? 0;
  const current = pages[page];
  const chapterIndex = pages.slice(0, page + 1).filter((x) => x.kind === "chapter").length;
  const chapterCount = pages.filter((x) => x.kind === "chapter").length;

  const phoneContent = (
    <div className="relative min-h-0 flex-1">
      <AnimatePresence mode="popLayout" custom={move} initial={false}>
        <motion.div
          key={screenKey}
          custom={move}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ type: "spring", bounce: 0, duration: 0.4 }}
          className="absolute inset-0"
        >
          {screen === "home" && (
            <HomeScreen
              persona={persona}
              showNotification={notif}
              dismissed={dismissed}
              onOpen={() => go("intent")}
              onDismiss={() => setDismissed(true)}
              onReopen={() => setDismissed(false)}
            />
          )}
          {screen === "intent" && intent && (
            <IntentScreen intent={intent} copy={persona.copy} onConfirm={confirm} onDecline={() => go("declined")} onBack={back} onWhy={() => setSheet("why")} />
          )}
          {screen === "declined" && <DeclinedScreen onHome={() => reset()} />}
          {screen === "path" && state && <PathScreen journey={state.journey} title={persona.copy.pathTitle} onStart={() => go("step")} onBack={back} />}
          {screen === "step" && state && stepPages[index] && (
            <ChapterStepsScreen
              state={state}
              pages={stepPages}
              index={index}
              board={board}
              onAccept={acceptPage}
              onSkipPage={skipPage}
              onBack={back}
              onToggleSkip={toggleStepSkip}
              onToggleConsent={toggleConsent}
            />
          )}
          {screen === "plan" && state && (
            <PlanScreen state={state} onImpact={startPlan} onBack={back} onAdvisor={() => showToast("A KBC advisor will call you back. Nothing is booked in this demo.")} />
          )}
          {screen === "chapter" && state && run && current?.kind === "chapter" && (
            <ChapterScreen persona={persona} state={state} run={run} chapter={current.chapter} position={chapterIndex} count={chapterCount} onNext={() => openPage(page + 1)} />
          )}
          {screen === "event" && run && pending && (
            <EventPage persona={persona} run={run} pending={pending} index={eventIndex} selected={selected} onSelect={setSelected} onChoose={choose} />
          )}
          {stageFinale && state && run && (
            <LiveScreen
              persona={persona}
              state={state}
              run={run}
              lastChanged={lastChanged}
              finishLine={finishLine}
              final
              onNext={() => {}}
              onAdvisor={() => showToast("A KBC advisor will call you back. Nothing is booked in this demo.")}
            />
          )}
          {stageFinale && !run && state && <PlanScreen state={state} final onImpact={() => {}} onBack={back} onAdvisor={() => {}} />}
          {showAppFinale && (
            <Finale variant="app" persona={persona} run={run} board={board} onEstimate={() => setSheet("estimate")} onRestart={() => reset()} onPlayers={toPlayers} />
          )}
        </motion.div>
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.p
            key="toast"
            role="status"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            className="absolute inset-x-4 top-2 z-30 rounded-[8px] bg-night px-4 py-3 text-[15px] font-semibold leading-[21px] text-white shadow-raised"
          >
            {toast}
          </motion.p>
        )}
      </AnimatePresence>

      <WhySheet open={sheet === "why"} signals={signals} note={persona.copy.whyNote} onClose={() => setSheet(null)} />
      {!stageFinale && <EstimateSheet open={sheet === "estimate"} state={state} onClose={() => setSheet(null)} />}
    </div>
  );

  const flash = (
    <AnimatePresence>
      {shock > 0 && !reduce && (
        <motion.div
          key={shock}
          aria-hidden
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0] }}
          transition={{ duration: 1.1, times: [0, 0.15, 1] }}
          className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_50%_45%,rgb(212_33_61/0.32),transparent_60%)]"
        />
      )}
    </AnimatePresence>
  );

  if (!framed) {
    return (
      <main className="relative">
        {flash}
        <div ref={phoneScope}>
          <Phone scale={1} framed={false}>{phoneContent}</Phone>
        </div>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-[100dvh] flex-col overflow-hidden bg-[linear-gradient(180deg,#021e43_0%,#0d2a50_100%)]">
      {flash}
      <button
        onClick={toPlayers}
        className="press absolute left-6 top-5 z-10 flex items-center gap-2 rounded-full px-4 py-2 text-[14px] font-semibold text-white/80 ring-1 ring-white/20 hover:bg-white/10 hover:text-white"
      >
        <ArrowLeft size={16} weight="bold" /> Players
      </button>
      <LayoutGroup>
        <div className="relative flex flex-1 items-center justify-center gap-14 px-10 py-[4vh]">
          <AnimatePresence mode="popLayout">
            {showBuild && (
              <BuildStage
                key={`build-${personaId}`}
                persona={personaId}
                steps={steps.map((s) => s.id)}
                accepted={steps.filter((s) => accepted.has(s.id)).map((s) => s.id)}
                skipped={skipped}
                hit={pending ? { step: actualStep(affectedStep(pending)), n: shock } : null}
                repaired={run?.history.length ?? 0}
                finale={finale}
              />
            )}
          </AnimatePresence>
          <motion.div layout transition={{ type: "spring", bounce: 0, duration: 0.6 }}>
            <div ref={phoneScope} data-phone-anchor>
              <Phone scale={scale} framed>{phoneContent}</Phone>
            </div>
          </motion.div>
          <AnimatePresence mode="popLayout">
            {showHud && <EngineHud key="hud" persona={persona} run={run} pending={pending} phase={phase} adaptStep={screen === "event" ? adaptStep : null} />}
            {stageFinale && (
              <motion.div key="finale" layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.2 } }}>
                <Finale persona={persona} run={run} board={board} onEstimate={() => setSheet("estimate")} onRestart={() => reset()} onPlayers={toPlayers} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </LayoutGroup>

      {/* Presenter view (key P): an overlay, so the left column stays free for the 3D build. */}
      <AnimatePresence>
        {presenter && (
          <div key="presenter" className="absolute left-6 top-16 z-20 max-h-[calc(100dvh-7rem)] overflow-y-auto rounded-[16px] bg-[rgb(2_30_67/0.92)] p-5 shadow-raised ring-1 ring-white/15">
            <PresenterPanel
              signals={signals}
              model={persona.intentModel}
              intent={intent}
              step={step}
              state={state}
              board={board}
              weak={signalSet === "weak"}
              onToggleWeak={() => reset(signalSet === "weak" ? "real" : "weak")}
            />
          </div>
        )}
      </AnimatePresence>

      {stageFinale && (
        <div className={`absolute inset-0 ${sheet === "estimate" ? "" : "pointer-events-none"}`}>
          <div className="relative mx-auto h-full max-w-[560px]">
            <EstimateSheet open={sheet === "estimate"} state={state} onClose={() => setSheet(null)} />
          </div>
        </div>
      )}

      <footer className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-between px-8 pb-4 text-[13px] text-white/60">
        <span>
          {customer.name}, {customer.age} · {customer.city} · synthetic demo customer ·{" "}
          {intent !== localIntent ? `live engine (${beIntent?.source ?? "api"})` : "offline engine"}
        </span>
        <span>{presenter ? "" : "Press P for the presenter view · "}Built for the KBC challenge at Tectonic Hackathon 2026</span>
      </footer>
    </main>
  );
}

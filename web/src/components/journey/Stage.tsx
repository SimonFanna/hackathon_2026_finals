"use client";

import { ArrowLeft } from "@phosphor-icons/react";
import { AnimatePresence, LayoutGroup, motion, useAnimate, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  advance, buildJourney, decide, detectIntents, getPersona, hit, initState, isComplete, resolve, scoreboard, setConsent, startRun,
  type Journey, type JourneyState, type OutcomeModel, type PendingHit, type Persona, type Run, type Scoreboard,
} from "@/engine";
import { CharacterSelect3D } from "../picker/CharacterSelect3D";
import { providerName } from "./copy";
import { EngineHud, type AdaptStep, type Phase } from "./EngineHud";
import { Finale } from "./Finale";
import { HomeScreen } from "./HomeScreen";
import { DeclinedScreen, IntentScreen } from "./IntentScreen";
import { EventScreen, LiveScreen, OptionsScreen, rankOptions } from "./OutcomeScreens";
import { PathScreen } from "./PathScreen";
import { FRAME_H, Phone } from "./Phone";
import { PlanScreen } from "./PlanScreen";
import { PresenterPanel } from "./PresenterPanel";
import { ConsentSheet, EstimateSheet, WhySheet } from "./Sheets";
import { StepScreen, type ConsentMode } from "./StepScreen";
import { useViewport } from "./useViewport";

type Screen = "select" | "home" | "intent" | "declined" | "path" | "step" | "plan" | "live" | "event" | "options" | "finale";
type SheetName = null | "why" | "consent" | "estimate";
type Move = "forward" | "accept" | "skip" | "back";
/** "real" = the persona's signals; "weak" = only the weakest one, so the engine deliberately does nothing. */
type SignalSet = "real" | "weak";
type PersonaId = Persona["id"];

/** Accept every step and share every field: the state the ?demo= backups jump to. */
function acceptAll(journey: Journey): JourneyState {
  let st = initState(journey);
  for (const s of journey.steps) {
    for (const f of s.dataShared) st = setConsent(st, s.id, f, true);
    st = decide(st, s.id, "accepted");
  }
  return st;
}

/** Plays every surprise with Kate's recommendation: the ?demo=finale backup. */
function autoPlay(model: OutcomeModel, accepted: ReadonlySet<string>): Run {
  let run = startRun(model);
  for (let p = hit(run, model, accepted); p; p = hit(run, model, accepted)) {
    run = resolve(run, model, p, p.options.find((o) => o.recommended)!.id);
  }
  return advance(run, Math.max(model.horizon, run.plan.values.finish));
}

const EMPTY: Scoreboard = {
  customer: { eurOneOff: 0, eurPerYear: 0, kwhPerYear: 0, co2KgPerYear: 0 },
  kbc: { productsActivated: 0, revenueEur: 0 },
  partners: { leads: 0, valueEur: 0 },
};

const isPersonaId = (v: string | null): v is PersonaId => v === "house" || v === "business";

export function Stage() {
  const [personaId, setPersonaId] = useState<PersonaId>("business"); // the entrepreneur is player 1
  const [picked, setPicked] = useState<PersonaId>("business");
  const persona = getPersona(personaId);
  const { customer, outcome: model } = persona;

  const [signalSet, setSignalSet] = useState<SignalSet>("real");
  const signals = useMemo(() => {
    const own = persona.signals.filter((s) => s.customerId === persona.customer.id);
    if (signalSet === "real") return own;
    const w = persona.intentModel.weights;
    return [...own].sort((a, b) => (w[a.type] ?? 0) - (w[b.type] ?? 0)).slice(0, 1);
  }, [persona, signalSet]);
  const intent = useMemo(() => detectIntents(customer, signals, persona.intentModel)[0], [customer, signals, persona.intentModel]);
  const speaks = !!intent && intent.level !== "none";

  const [screen, setScreen] = useState<Screen>("select");
  const [notif, setNotif] = useState(false);
  const [dismissed, setDismissed] = useState(false); // the notification was slid away; the Kate pill brings it back
  const [state, setState] = useState<JourneyState | null>(null);
  const [index, setIndex] = useState(0);
  const [modes, setModes] = useState<Record<string, ConsentMode>>({});
  const [sheet, setSheet] = useState<SheetName>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [presenter, setPresenter] = useState(false);
  const [move, setMove] = useState<Move>("forward");
  const [run, setRun] = useState<Run | null>(null);
  const [pending, setPending] = useState<PendingHit | null>(null);
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
  const base = Math.min((h * 0.92) / FRAME_H, 1.3);
  const scale = stageFinale ? base * 0.82 : base;

  const board = state ? scoreboard(state) : EMPTY;
  const steps = state?.journey.steps ?? [];
  const step = screen === "step" ? steps[index] ?? null : null;
  const accepted = useMemo(
    () => new Set(state ? state.journey.steps.filter((s) => state.decisions[s.id] === "accepted").map((s) => s.id) : []),
    [state],
  );
  const finishLine = run ? Math.max(model.horizon, run.plan.values.finish) : model.horizon;

  // Kate's notification arrives shortly after the home screen settles, unless the engine chose NO_ACTION.
  useEffect(() => {
    if (screen !== "home" || !speaks) return;
    const t = setTimeout(() => setNotif(true), 1200);
    return () => clearTimeout(t);
  }, [screen, speaks]);

  // Pitch backups: ?player=house|business, and ?demo=intent | step[&n=6] | live | event[&n=2] | options[&n=2] | finale | weak.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const player = p.get("player");
    const demo = p.get("demo");
    if (!demo && !isPersonaId(player)) return;
    const t = setTimeout(() => {
      const id: PersonaId = isPersonaId(player) ? player : "business";
      const ps = getPersona(id);
      setPersonaId(id);
      setPicked(id);
      setScreen("home");
      if (!demo) return;
      if (demo === "weak") return setSignalSet("weak");
      const journey = buildJourney(ps.journey.intentId, ps.customer);
      if (demo === "intent") return setScreen("intent");
      if (demo === "step") {
        const n = Math.min(Math.max(Number(p.get("n") ?? 1) || 1, 1), journey.steps.length);
        setState(initState(journey));
        setIndex(n - 1);
        return setScreen("step");
      }
      const all = acceptAll(journey);
      const ids = new Set(journey.steps.map((s) => s.id));
      if (demo === "live") {
        setState(all);
        setRun(startRun(ps.outcome));
        return setScreen("live");
      }
      if (demo === "finale") {
        setState(all);
        setRun(autoPlay(ps.outcome, ids));
        return setScreen("finale");
      }
      if (demo === "event" || demo === "options") {
        // Kate's picks for the surprises before n, then surprise n hits.
        const n = Math.min(Math.max(Number(p.get("n") ?? 1) || 1, 1), ps.outcome.disruptions.length);
        let r = startRun(ps.outcome);
        for (let i = 1; i < n; i++) {
          const ph = hit(r, ps.outcome, ids)!;
          r = resolve(r, ps.outcome, ph, ph.options.find((o) => o.recommended)!.id);
        }
        const ph = hit(r, ps.outcome, ids)!;
        setState(all);
        setRun(advance(r, ph.disruption.month));
        setPending(ph);
        setSelected(ph.options.find((o) => o.recommended)?.id ?? null);
        return setScreen(demo);
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
    setModes({});
    setNotif(false);
    setToast(null);
    setRun(null);
    setPending(null);
    setSelected(null);
    setLastChanged([]);
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

  const confirm = () => {
    if (!intent) return;
    setState(initState(buildJourney(intent.intentId, customer)));
    setIndex(0);
    setModes({});
    go("path");
  };

  const next = (m: Move) => {
    if (index + 1 < steps.length) {
      setMove(m);
      setSheet(null);
      setIndex(index + 1);
    } else go("plan", m);
  };

  const accept = (shareAll: boolean | "none") => {
    if (!state || !step) return;
    let st = state;
    if (shareAll === "none") {
      for (const f of step.dataShared) st = setConsent(st, step.id, f, false);
    } else if (shareAll) {
      for (const f of step.dataShared) st = setConsent(st, step.id, f, true);
    }
    st = decide(st, step.id, "accepted");
    setState(st);
    const shared = Object.values(st.consents[step.id] ?? {}).some(Boolean);
    if (step.provider.kind === "partner" && step.dataShared.length > 0 && !shared) {
      showToast(`Added. ${providerName(step)} won't contact you; you can reach them yourself.`);
    }
    next("accept");
  };

  const primary = () => {
    if (!step) return;
    const mode = modes[step.id] ?? "proposed";
    accept(step.dataShared.length === 0 ? false : mode === "proposed" ? true : false);
  };

  const skip = () => {
    if (!state || !step) return;
    setState(decide(state, step.id, "skipped"));
    next("skip");
  };

  /** Presenter shortcut (F): add every remaining step as proposed, then show the plan. */
  const fillPlan = () => {
    if (!state) return;
    let st = state;
    for (const s of st.journey.steps) {
      if (st.decisions[s.id] !== "pending") continue;
      for (const f of s.dataShared) st = setConsent(st, s.id, f, true);
      st = decide(st, s.id, "accepted");
    }
    setState(st);
    go("plan");
  };

  const startPlan = () => {
    setRun(startRun(model));
    setLastChanged([]);
    go("live");
  };

  /** Time moves on until the next surprise hits the plan (or the finish line). */
  const fastForward = () => {
    if (!run) return;
    if (isComplete(run, model)) {
      if (run.month < finishLine) {
        setRun(advance(run, finishLine));
        setLastChanged([]);
      } else go("finale");
      return;
    }
    const p = hit(run, model, accepted);
    if (!p) return;
    setPending(p);
    setSelected(p.options.find((o) => o.recommended)?.id ?? null);
    setRun(advance(run, p.disruption.month));
    setLastChanged([]);
    go("event");
    setShock((n) => n + 1);
    if (!reduce && phoneScope.current) animatePhone(phoneScope.current, { x: [0, -10, 10, -7, 7, -3, 0] }, { duration: 0.45 });
  };

  const choose = () => {
    if (!run || !pending || !selected) return;
    const opt = pending.options.find((o) => o.id === selected);
    if (!opt?.available) return;
    setRun(resolve(run, model, pending, selected));
    setLastChanged(opt.changes?.map((c) => c.stepId) ?? []);
    setPending(null);
    showToast(opt.recommended ? `Plan updated: ${opt.label}.` : `Your call: ${opt.label}.`);
    go("live", "accept");
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
      setIndex(steps.length - 1);
      go("step", "back");
    } else if (screen === "options") go("event", "back");
    else if (screen === "live" && run && run.history.length === 0 && run.month === 0) go("plan", "back");
    else if (screen === "finale") go("live", "back");
    else if (screen === "home") toPlayers();
  };

  // Keys: → / Enter next, ← back, S skip, F fill the plan, 1–4 pick an option, R restart, C players, P presenter, W weak signals.
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  const onKey = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    const onControl = !!t && ["BUTTON", "INPUT", "A", "TEXTAREA"].includes(t.tagName);
    const k = e.key.toLowerCase();

    if (screen === "select") {
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
    if (screen === "options" && pending && /^[1-9]$/.test(k)) {
      const o = rankOptions(pending.options)[Number(k) - 1];
      if (o?.available) setSelected(o.id);
      return;
    }
    if (k === "escape" && screen === "home" && notif) return setDismissed(true);
    if (k === "arrowleft") return back();
    if (k === "s") {
      if (screen === "step") skip();
      else if (screen === "intent") go("declined");
      return;
    }
    if (k === "arrowright" || (k === "enter" && !onControl)) {
      e.preventDefault();
      if (screen === "home" && (notif || dismissed)) go("intent");
      else if (screen === "intent") confirm();
      else if (screen === "declined") reset();
      else if (screen === "path") go("step");
      else if (screen === "step") primary();
      else if (screen === "plan") startPlan();
      else if (screen === "live") fastForward();
      else if (screen === "event") go("options");
      else if (screen === "options") choose();
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
    return <CharacterSelect3D selected={picked} onSelect={setPicked} onPlay={play} compact={!framed} playRef={pickerPlay} />;
  }

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

  const screenKey = screen === "step" ? `step-${index}` : screen === "event" || screen === "options" ? `${screen}-${pending?.disruption.id}` : screen;
  const showAppFinale = finale && !stageFinale;

  const phase: Phase =
    screen === "home" || screen === "intent" || screen === "declined"
      ? "detect"
      : screen === "path" || screen === "step" || screen === "plan"
        ? "plan"
        : screen === "event" || screen === "options"
          ? "adapt"
          : run && isComplete(run, model) && run.month >= finishLine
            ? "outcome"
            : "execute";
  const adaptStep: AdaptStep | null = screen === "event" ? "replan" : screen === "options" ? "decide" : null;
  const eventIndex = run?.next ?? 0;

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
          {screen === "step" && state && step && (
            <StepScreen
              state={state}
              index={index}
              board={board}
              consentMode={modes[step.id] ?? "proposed"}
              onPrimary={primary}
              onWithoutSharing={() => accept("none")}
              onSkip={skip}
              onBack={back}
              onChoose={() => setSheet("consent")}
            />
          )}
          {screen === "plan" && state && (
            <PlanScreen state={state} onImpact={startPlan} onBack={back} onAdvisor={() => showToast("A KBC advisor will call you back. Nothing is booked in this demo.")} />
          )}
          {(screen === "live" || (stageFinale && run)) && state && run && (
            <LiveScreen
              persona={persona}
              state={state}
              run={run}
              lastChanged={lastChanged}
              finishLine={finishLine}
              final={stageFinale}
              onNext={fastForward}
              onAdvisor={() => showToast("A KBC advisor will call you back. Nothing is booked in this demo.")}
            />
          )}
          {stageFinale && !run && state && <PlanScreen state={state} final onImpact={() => {}} onBack={back} onAdvisor={() => {}} />}
          {screen === "event" && pending && <EventScreen persona={persona} pending={pending} index={eventIndex} onOptions={() => go("options")} />}
          {screen === "options" && pending && (
            <OptionsScreen persona={persona} pending={pending} selected={selected} onSelect={setSelected} onChoose={choose} onBack={back} />
          )}
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
      <ConsentSheet
        open={sheet === "consent"}
        step={step}
        consents={step && state ? state.consents[step.id] ?? {} : {}}
        onToggle={(f, ok) => {
          if (!state || !step) return;
          let st = state;
          // First edit: start from the proposed selection (everything) so the switches match the sentence.
          if ((modes[step.id] ?? "proposed") === "proposed") for (const x of step.dataShared) st = setConsent(st, step.id, x, true);
          setModes((m) => ({ ...m, [step.id]: "custom" }));
          setState(setConsent(st, step.id, f, ok));
        }}
        onClose={() => setSheet(null)}
      />
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
          <AnimatePresence>
            {presenter && (
              <PresenterPanel
                key="presenter"
                signals={signals}
                model={persona.intentModel}
                intent={intent}
                step={step}
                state={state}
                board={board}
                weak={signalSet === "weak"}
                onToggleWeak={() => reset(signalSet === "weak" ? "real" : "weak")}
              />
            )}
          </AnimatePresence>
          <motion.div layout transition={{ type: "spring", bounce: 0, duration: 0.6 }}>
            <div ref={phoneScope} data-phone-anchor>
              <Phone scale={scale} framed>{phoneContent}</Phone>
            </div>
          </motion.div>
          <AnimatePresence mode="popLayout">
            {showHud && <EngineHud key="hud" persona={persona} run={run} pending={pending} phase={phase} adaptStep={adaptStep} />}
            {stageFinale && (
              <motion.div key="finale" layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.2 } }}>
                <Finale persona={persona} run={run} board={board} onEstimate={() => setSheet("estimate")} onRestart={() => reset()} onPlayers={toPlayers} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </LayoutGroup>

      {stageFinale && (
        <div className="pointer-events-none absolute inset-0">
          <div className="pointer-events-auto relative mx-auto h-full max-w-[560px]">
            <EstimateSheet open={sheet === "estimate"} state={state} onClose={() => setSheet(null)} />
          </div>
        </div>
      )}

      <footer className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-between px-8 pb-4 text-[13px] text-white/60">
        <span>{customer.name}, {customer.age} · {customer.city} · synthetic demo customer</span>
        <span>{presenter ? "" : "Press P for the presenter view · "}Built for the KBC challenge at Tectonic Hackathon 2026</span>
      </footer>
    </main>
  );
}

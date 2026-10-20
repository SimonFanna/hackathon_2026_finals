"use client";

import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildJourney, buyHouseSignalWeights, decide, demoCustomer, demoSignals, detectIntents, initState, scoreboard, setConsent,
  type Journey, type JourneyState, type Scoreboard,
} from "@/engine";
import { fetchDemoProfile } from "@/lib/bankClient";
import { providerName } from "./copy";
import { Finale } from "./Finale";
import { HomeScreen } from "./HomeScreen";
import { DeclinedScreen, IntentScreen } from "./IntentScreen";
import { PathScreen } from "./PathScreen";
import { FRAME_H, Phone } from "./Phone";
import { PlanScreen } from "./PlanScreen";
import { PresenterPanel } from "./PresenterPanel";
import { ConsentSheet, EstimateSheet, WhySheet } from "./Sheets";
import { StepScreen, type ConsentMode } from "./StepScreen";
import { useViewport } from "./useViewport";

type Screen = "home" | "intent" | "declined" | "path" | "step" | "plan" | "finale";
type SheetName = null | "why" | "consent" | "estimate";
type Move = "forward" | "accept" | "skip" | "back";
/** "sofie" = the demo customer's real signals; "weak" = one weak signal, so the engine deliberately does nothing. */
type Scenario = "sofie" | "weak";

/** Accept every step and share every field: the state the ?demo=finale backup jumps to. */
function acceptAll(journey: Journey): JourneyState {
  let st = initState(journey);
  for (const s of journey.steps) {
    for (const f of s.dataShared) st = setConsent(st, s.id, f, true);
    st = decide(st, s.id, "accepted");
  }
  return st;
}

const EMPTY: Scoreboard = {
  customer: { eurOneOff: 0, eurPerYear: 0, kwhPerYear: 0, co2KgPerYear: 0 },
  kbc: { productsActivated: 0, revenueEur: 0 },
  partners: { leads: 0, valueEur: 0 },
};

export function Stage() {
  // Sofie's profile is read from Supabase; the bundled snapshot of the same rows covers offline demos.
  const [profile, setProfile] = useState({ customer: demoCustomer, signals: demoSignals, source: "snapshot" as "supabase" | "snapshot" });
  useEffect(() => {
    let live = true;
    fetchDemoProfile("sofie", new Date().toISOString().slice(0, 10)).then((p) => {
      if (live && p) setProfile({ ...p, source: "supabase" });
    });
    return () => { live = false; };
  }, []);
  const customer = profile.customer;
  const [scenario, setScenario] = useState<Scenario>("sofie");
  const signals = useMemo(() => {
    const own = profile.signals.filter((s) => s.customerId === customer.id);
    return scenario === "weak" ? own.filter((s) => s.type === "renovation_research") : own;
  }, [profile.signals, customer.id, scenario]);
  const intent = useMemo(() => detectIntents(customer, signals)[0], [customer, signals]);
  const speaks = !!intent && intent.level !== "none";

  const [screen, setScreen] = useState<Screen>("home");
  const [notif, setNotif] = useState(false);
  const [state, setState] = useState<JourneyState | null>(null);
  const [index, setIndex] = useState(0);
  const [modes, setModes] = useState<Record<string, ConsentMode>>({});
  const [sheet, setSheet] = useState<SheetName>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [presenter, setPresenter] = useState(false);
  const [move, setMove] = useState<Move>("forward");
  const reduce = useReducedMotion();

  const { w, h } = useViewport();
  const framed = w >= 520;
  const finale = screen === "finale";
  const stageFinale = finale && framed && w >= 1100;
  const base = Math.min((h * 0.92) / FRAME_H, 1.3);
  const scale = stageFinale ? base * 0.82 : base;

  const board = state ? scoreboard(state) : EMPTY;
  const steps = state?.journey.steps ?? [];
  const step = screen === "step" ? steps[index] ?? null : null;
  const acceptedCount = state ? steps.filter((s) => state.decisions[s.id] === "accepted").length : 0;

  // Kate's notification arrives shortly after the home screen settles, unless the engine chose NO_ACTION.
  useEffect(() => {
    if (screen !== "home" || !speaks) return;
    const t = setTimeout(() => setNotif(true), 1200);
    return () => clearTimeout(t);
  }, [screen, speaks]);

  // Pitch backups: ?demo=finale, ?demo=step[&n=6], ?demo=intent, ?demo=weak (NO_ACTION).
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const demo = p.get("demo");
    if (!demo) return;
    const t = setTimeout(() => {
      if (demo === "weak") return setScenario("weak");
      if (!intent) return;
      const journey = buildJourney(intent.intentId, customer, signals);
      if (demo === "intent") return setScreen("intent");
      if (demo === "finale") {
        setState(acceptAll(journey));
        return setScreen("finale");
      }
      if (demo === "step") {
        const n = Math.min(Math.max(Number(p.get("n") ?? 1) || 1, 1), journey.steps.length);
        setState(initState(journey));
        setIndex(n - 1);
        setScreen("step");
      }
    }, 0);
    return () => clearTimeout(t);
    // Run once on load: deep links only set the starting point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    setScreen(s);
  };

  const reset = (next: Scenario = scenario) => {
    setScenario(next);
    setState(null);
    setIndex(0);
    setModes({});
    setNotif(false);
    setToast(null);
    go("home", "back");
  };

  const confirm = () => {
    if (!intent) return;
    setState(initState(buildJourney(intent.intentId, customer, signals)));
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
    } else if (screen === "finale") go("plan", "back");
  };

  // Presenter keys: → / Enter next, ← back, S skip, R restart, P presenter view.
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  const onKey = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    const onControl = !!t && ["BUTTON", "INPUT", "A", "TEXTAREA"].includes(t.tagName);
    const k = e.key.toLowerCase();
    if (k === "p") return setPresenter((v) => !v);
    if (k === "r") return reset();
    if (k === "w" && presenter) return reset(scenario === "weak" ? "sofie" : "weak");
    if (sheet) return;
    if (k === "arrowleft") return back();
    if (k === "s") {
      if (screen === "step") skip();
      else if (screen === "intent") go("declined");
      return;
    }
    if (k === "arrowright" || (k === "enter" && !onControl)) {
      e.preventDefault();
      if (screen === "home" && notif) go("intent");
      else if (screen === "intent") confirm();
      else if (screen === "declined") reset();
      else if (screen === "path") go("step");
      else if (screen === "step") primary();
      else if (screen === "plan") go("finale");
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

  const screenKey = screen === "step" ? `step-${index}` : screen;
  const showAppFinale = finale && !stageFinale;

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
          {screen === "home" && <HomeScreen customer={customer} showNotification={notif} onOpen={() => go("intent")} />}
          {screen === "intent" && intent && (
            <IntentScreen intent={intent} signals={signals} onConfirm={confirm} onDecline={() => go("declined")} onBack={back} onWhy={() => setSheet("why")} />
          )}
          {screen === "declined" && <DeclinedScreen onHome={() => reset()} />}
          {screen === "path" && state && <PathScreen journey={state.journey} city={customer.city} onStart={() => go("step")} onBack={back} />}
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
          {(screen === "plan" || stageFinale) && state && (
            <PlanScreen state={state} final={stageFinale} onImpact={() => go("finale")} onBack={back} onAdvisor={() => showToast("A KBC advisor will call you back. Nothing is booked in this demo.")} />
          )}
          {showAppFinale && <Finale variant="app" board={board} steps={acceptedCount} onEstimate={() => setSheet("estimate")} onRestart={() => reset()} />}
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

      <WhySheet open={sheet === "why"} signals={signals} onClose={() => setSheet(null)} />
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

  if (!framed) {
    return (
      <main>
        <Phone scale={1} framed={false}>{phoneContent}</Phone>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-[100dvh] flex-col bg-[linear-gradient(180deg,#021e43_0%,#0d2a50_100%)]">
      <LayoutGroup>
        <div className="flex flex-1 items-center justify-center gap-14 px-10 py-[4vh]">
          <AnimatePresence>
            {presenter && (
              <PresenterPanel
                key="presenter"
                signals={signals}
                source={profile.source}
                weights={buyHouseSignalWeights}
                intent={intent}
                step={step}
                state={state}
                board={board}
                weak={scenario === "weak"}
                onToggleWeak={() => reset(scenario === "weak" ? "sofie" : "weak")}
              />
            )}
          </AnimatePresence>
          <motion.div layout transition={{ type: "spring", bounce: 0, duration: 0.6 }}>
            <Phone scale={scale} framed>{phoneContent}</Phone>
          </motion.div>
          <AnimatePresence>
            {stageFinale && (
              <motion.div key="finale" layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.2 } }}>
                <Finale board={board} steps={acceptedCount} onEstimate={() => setSheet("estimate")} onRestart={() => reset()} />
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

"use client";

import { ArrowLeft, ArrowRight, CircleNotch } from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { startJourney, type BackendJourney, type Slug } from "@/lib/backend";
import { KateMark } from "../journey/Kate";
import { KbcLogo } from "../journey/KbcLogo";
import {
  applyToggles, base, BASE_SUMMARY, BASES, flip, initialToggles, PLANNABLE, score, TOGGLES,
  type BaseSlug, type Level, type MomentScore, type Toggles,
} from "./model";

/** The two plan templates map onto the two phone stories: the house buyer and the entrepreneur. */
export type PlanPersona = "house" | "business";
const PERSONA_FOR: Record<string, PlanPersona> = { BUY_AND_PREPARE_HOME: "house", START_BUSINESS: "business" };

const LEVEL: Record<Level, { text: string; tone: string }> = {
  NO_ACTION: { text: "Kate stays quiet", tone: "bg-white/10 text-white/70" },
  ASK: { text: "Kate asks first", tone: "bg-warning/20 text-[#ffb35c]" },
  SUGGEST: { text: "Kate suggests a plan", tone: "bg-green/20 text-[#5ee08a]" },
};
const pct = (x: number) => `${Math.round(x * 100)}%`;

/**
 * "Your own" player (Demo V2 P5): pick a base customer, switch life signals on and off, and watch the
 * trained moment model (client-side, same weights as the backend) change its mind. Then Kate plans it.
 */
export function CustomPlayer({ onBack, onPlan }: {
  onBack: () => void;
  /** live = the backend's goal + plan, or null when the API is unreachable (Stage then uses its local engine). */
  onPlan: (persona: PlanPersona, live: BackendJourney | null, slug: BaseSlug) => void;
}) {
  const reduce = !!useReducedMotion();
  const [slug, setSlug] = useState<BaseSlug>("thomas");
  const b = base(slug);
  const [toggles, setToggles] = useState<Toggles>(() => initialToggles(base("thomas")));
  const [busy, setBusy] = useState(false);
  const scores = useMemo(() => score(b, applyToggles(b, toggles)), [b, toggles]);
  const best = scores[0];
  const persona = best.level !== "NO_ACTION" && best.goalType && PLANNABLE.has(best.goalType) ? PERSONA_FOR[best.goalType] : undefined;

  const pick = (s: BaseSlug) => {
    setSlug(s);
    setToggles(initialToggles(base(s)));
  };

  const plan = async () => {
    if (!persona || !best.goalType || busy) return;
    setBusy(true);
    // The backend builds the plan from this customer's real (synthetic) facts; null → Stage's local engine.
    const live = await startJourney(slug as Slug, best.goalType);
    onPlan(persona, live, slug);
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onBack();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onBack]);

  const kate =
    best.level === "NO_ACTION"
      ? `Nothing clear enough yet: ${pct(best.confidence)} for ${best.label}, and I only ask from 50%. I stay quiet.`
      : persona
        ? best.level === "ASK"
          ? `${b.name}, it looks like you may be ${best.label} (${pct(best.confidence)}). I'd ask you first, then plan it with KBC and partners.`
          : `${b.name}, I see you're ${best.label} (${pct(best.confidence)}). I can build the plan with KBC and partners.`
        : `${b.name}, I see you're ${best.label} (${pct(best.confidence)}); that plan isn't ready yet.`;

  return (
    <main className="relative min-h-[100dvh] overflow-x-hidden bg-[linear-gradient(180deg,#021e43_0%,#0d2a50_100%)] px-6 pb-8 pt-5 text-white sm:px-10">
      <header className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="press flex items-center gap-2 rounded-full px-4 py-2 text-[14px] font-semibold text-white/80 ring-1 ring-white/20 hover:bg-white/10 hover:text-white"
        >
          <ArrowLeft size={16} weight="bold" /> Players
        </button>
        <span className="ml-3 rounded-full bg-white p-1.5"><KbcLogo size={26} /></span>
        <span className="text-[15px] font-bold">KBC Outcome Engine</span>
        <span className="ml-auto text-[13px] text-white/55">Synthetic data · trained model, running in your browser</span>
      </header>

      <div className="mx-auto mt-5 max-w-[1240px]">
        <p className="text-[15px] font-bold text-kate">Your own player</p>
        <h1 className="mt-1 text-[clamp(26px,2.4vw,38px)] font-extrabold leading-[1.1] tracking-[-0.02em]">
          Change the signals. Watch the model change its mind.
        </h1>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.1fr]">
          {/* Left: who, and what life is showing */}
          <section aria-label="Customer and signals" className="flex flex-col gap-5">
            <div>
              <h2 className="text-[13px] font-bold uppercase tracking-[0.08em] text-white/55">1 · Base customer</h2>
              <div role="radiogroup" aria-label="Base customer" className="mt-2 grid grid-cols-3 gap-2">
                {BASES.map((s) => {
                  const c = base(s);
                  const on = s === slug;
                  return (
                    <button
                      key={s}
                      role="radio"
                      aria-checked={on}
                      onClick={() => pick(s)}
                      className={`press rounded-[8px] px-3 py-2.5 text-left ring-1 transition-colors ${
                        on ? "bg-white text-night ring-white" : "bg-white/[0.06] text-white ring-white/12 hover:bg-white/10"
                      }`}
                    >
                      <span className="block text-[16px] font-extrabold leading-tight">{c.name}, {c.age}</span>
                      <span className={`mt-0.5 block truncate text-[12px] font-semibold ${on ? "text-night-300" : "text-white/55"}`}>{BASE_SUMMARY[s]}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <h2 className="text-[13px] font-bold uppercase tracking-[0.08em] text-white/55">2 · Life signals</h2>
              <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
                {TOGGLES.map((t) => {
                  const state = toggles[t.id] ?? "off";
                  const on = state !== "off";
                  return (
                    <li key={t.id} className="flex">
                      <button
                        role="switch"
                        aria-checked={on}
                        onClick={() => setToggles((x) => ({ ...x, [t.id]: flip(x[t.id]) }))}
                        className={`press flex w-full items-center gap-3 self-stretch rounded-[8px] px-3 py-2.5 text-left ring-1 transition-colors ${
                          on ? "bg-accent/15 ring-accent/60" : "bg-white/[0.04] ring-white/10 hover:bg-white/[0.08]"
                        }`}
                      >
                        <span aria-hidden className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${on ? "bg-accent" : "bg-white/20"}`}>
                          <span className={`absolute top-1 size-4 rounded-full bg-white transition-transform duration-200 ${on ? "translate-x-5" : "translate-x-1"}`} />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[15px] font-bold leading-tight">{t.label}</span>
                          <span className="block text-[12px] font-semibold text-white/50">
                            {state === "own" ? `From ${b.name}'s data` : state === "sim" ? "Simulated" : "Off"}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>

          {/* Right: what the model sees, and what Kate does with it */}
          <section aria-label="Model confidence" className="flex flex-col gap-4 rounded-[8px] bg-white/[0.05] p-5 ring-1 ring-white/10">
            <div className="flex items-baseline justify-between">
              <h2 className="text-[13px] font-bold uppercase tracking-[0.08em] text-white/55">3 · Model confidence</h2>
              <span className="text-[12px] text-white/45">logistic regression · lr-2026-10-20</span>
            </div>
            <ol className="flex flex-col gap-3">
              {scores.map((s, i) => <Bar key={s.moment} s={s} top={i === 0} reduce={reduce} />)}
            </ol>

            <div className="mt-auto rounded-[8px] bg-white p-4 text-night">
              <div className="flex items-start gap-3" aria-live="polite">
                <KateMark size={32} />
                <p className="pt-0.5 text-[17px] font-semibold leading-6">
                  <span className="sr-only">Kate says: </span>{kate}
                </p>
              </div>
              <button
                onClick={plan}
                disabled={!persona || busy}
                className="press mt-4 flex h-[54px] w-full items-center justify-center gap-2 rounded-full bg-accent text-[19px] font-bold text-white hover:bg-accent-600 disabled:bg-surface disabled:text-night-300"
              >
                {busy ? (
                  <><CircleNotch size={20} weight="bold" className="animate-spin" /> Kate is planning…</>
                ) : (
                  <>Let Kate plan it <ArrowRight size={20} weight="bold" /></>
                )}
              </button>
            </div>
          </section>
        </div>
        <p className="mt-4 text-[12px] text-white/45">
          Synthetic demo customers. Simulated signals use the backend&apos;s own strength formula (seen 3 times, last one a week ago). Figures are estimates.
        </p>
      </div>
    </main>
  );
}

function Bar({ s, top, reduce }: { s: MomentScore; top: boolean; reduce: boolean }) {
  const level = LEVEL[s.level];
  return (
    <li className={top ? "" : "opacity-75"}>
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1 truncate text-[16px] font-bold first-letter:uppercase">{s.label}</span>
        <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-bold ${level.tone}`}>{level.text}</span>
        <span className="tabular w-12 text-right text-[18px] font-extrabold">{pct(s.confidence)}</span>
      </div>
      <div className="relative mt-1.5 h-2.5 overflow-hidden rounded-full bg-white/10">
        <motion.div
          className={`absolute inset-y-0 left-0 w-full origin-left rounded-full ${s.level === "SUGGEST" ? "bg-green" : s.level === "ASK" ? "bg-warning" : "bg-accent"}`}
          initial={false}
          animate={{ scaleX: Math.max(0.005, s.confidence) }}
          transition={reduce ? { duration: 0 } : { type: "spring", bounce: 0, duration: 0.5 }}
        />
        {/* The backend thresholds: ask from 50%, suggest from 85%. */}
        <span aria-hidden className="absolute inset-y-0 left-1/2 w-px bg-white/40" />
        <span aria-hidden className="absolute inset-y-0 left-[85%] w-px bg-white/40" />
      </div>
      {top && s.why.length > 0 && (
        <p className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[12px] font-bold text-white/55">Why:</span>
          {s.why.map((w) => (
            <span key={w.label} className="rounded-[4px] bg-kate/15 px-2 py-0.5 text-[12px] font-semibold text-kate">{w.label}</span>
          ))}
        </p>
      )}
    </li>
  );
}

"use client";

import { ArrowRight } from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { personas, type Persona } from "@/engine";
import { CharacterSelect } from "../journey/CharacterSelect";
import { eur } from "../journey/format";
import { KbcLogo } from "../journey/KbcLogo";
import { EventBadge } from "../journey/outcome-ui";
import { hasWebGL, pickerMode } from "./capability";
import { ORDER, type PlayableId } from "./carousel";
import type { Band, DiveFn, PickerItem } from "./PickerCanvas";
import { createHandoff } from "./handoff";

// Drop-in for Victor's CharacterSelect (same props). Renders the page's DOM straight away, mounts the
// three.js carousel (code-split, never on the server) and falls back to Victor's 2D picker, unchanged,
// whenever the 3D can't be trusted: small screen, ?q=low, deep link, no WebGL, lost context, low fps.

const PickerCanvas = dynamic(() => import("./PickerCanvas"), { ssr: false, loading: () => null });

type PersonaId = Persona["id"];

export function CharacterSelect3D({
  selected, onSelect, onPlay, compact, playRef,
}: {
  selected: PersonaId;
  onSelect: (id: PersonaId) => void;
  onPlay: (id: PersonaId) => void;
  compact: boolean;
  /** Optional: Stage routes Enter through here so the keyboard also gets the dive. */
  playRef?: MutableRefObject<((id: PersonaId) => void) | null>;
}) {
  const reduce = !!useReducedMotion();
  const [mode, setMode] = useState<"pending" | "3d" | "2d" | "skip">("pending");
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const diveRef = useRef<DiveFn | null>(null);

  // The free band between the headline and the card: the 3D stage is fitted into it at any screen size.
  const mainRef = useRef<HTMLElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const [band, setBand] = useState<Band | null>(null);
  useEffect(() => {
    const main = mainRef.current;
    const head = headRef.current;
    const card = cardRef.current;
    if (mode !== "3d" || !main || !head || !card) return;
    const measure = () => {
      const m = main.getBoundingClientRect();
      const top = Math.round(head.getBoundingClientRect().bottom - m.top + 12);
      const bottom = Math.round(card.getBoundingClientRect().top - m.top - 16);
      setBand((b) => (b && b.top === top && b.bottom === bottom ? b : { top, bottom }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    [main, head, card].forEach((e) => ro.observe(e));
    return () => ro.disconnect();
  }, [mode]);

  // Decide after hydration (the server always renders the 3D shell; no mismatch).
  useEffect(() => {
    const t = setTimeout(() => {
      const search = window.location.search;
      const p = new URLSearchParams(search);
      // A deep link jumps straight past the picker: draw nothing for the split second before Stage switches.
      if (p.has("player") || p.has("demo")) return setMode("skip");
      setMode(pickerMode({ compact, search, webgl: hasWebGL() }));
    }, 0);
    return () => clearTimeout(t);
  }, [compact]);

  const fail = useCallback(() => setMode("2d"), []);

  const busy = useRef(false); // a ref, not state: two activations in the same task must not both start
  const play = useCallback(
    async (id: PersonaId) => {
      if (busy.current) return;
      busy.current = true;
      setPlaying(true);
      const h = createHandoff(reduce);
      try {
        const dive = diveRef.current;
        if (dive && ready && !reduce) {
          let cover: Promise<void> = Promise.resolve();
          await dive(id as PlayableId, (ms, rect) => {
            cover = h.cover(ms, rect);
          });
          await cover;
        } else {
          await h.cover(220);
        }
      } finally {
        onPlay(id); // Stage switches to the home screen; this component unmounts.
        void h.land();
      }
    },
    [onPlay, ready, reduce],
  );

  // Let Stage's Enter key go through the dive too (only while the 3D is the picker).
  useEffect(() => {
    if (!playRef) return;
    playRef.current = mode === "3d" ? (id) => void play(id) : null;
    return () => {
      playRef.current = null;
    };
  }, [mode, play, playRef]);

  if (mode === "2d") return <CharacterSelect selected={selected} onSelect={onSelect} onPlay={onPlay} compact={compact} />;
  if (mode === "skip") return <main className="min-h-[100dvh] bg-[linear-gradient(180deg,#021e43_0%,#0d2a50_100%)]" />;

  const persona = personas.find((p) => p.id === selected) ?? personas[0];
  const items: PickerItem[] = ORDER.map((id) => {
    const p = personas.find((x) => x.id === id)!;
    return { id, locked: false, label: `${p.customer.name}, ${p.customer.age}, ${p.customer.city}: ${p.copy.quest}` };
  });

  return (
    <main ref={mainRef} className="relative h-[100dvh] min-h-[600px] overflow-hidden bg-[linear-gradient(180deg,#021e43_0%,#0d2a50_100%)] text-white">
      <motion.div className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: ready ? 1 : 0 }} transition={{ duration: reduce ? 0.15 : 0.7 }}>
        {mode === "3d" && (
          <PickerCanvas
            items={items}
            selected={selected as PlayableId}
            onSelect={(id) => onSelect(id)}
            onActivate={(id) => void play(id)}
            onReady={() => setReady(true)}
            onFail={fail}
            diveRef={diveRef}
            reduce={reduce}
            band={band}
          />
        )}
      </motion.div>

      {/* Readability scrims, top and bottom: they leave with the UI so the dive is the scene alone. */}
      <motion.div aria-hidden className="pointer-events-none absolute inset-0" animate={{ opacity: playing ? 0 : 1 }} transition={{ duration: 0.16 }}>
        <div className="absolute inset-x-0 top-0 h-56 bg-[linear-gradient(180deg,rgb(2_30_67/0.92),rgb(2_30_67/0))]" />
        <div className="absolute inset-x-0 bottom-0 h-80 bg-[linear-gradient(0deg,rgb(2_30_67/0.95)_25%,rgb(2_30_67/0))]" />
      </motion.div>

      <motion.div
        className="pointer-events-none relative flex h-full flex-col px-6 pb-7 pt-6 sm:px-10"
        animate={reduce ? { opacity: playing ? 0 : 1 } : { opacity: playing ? 0 : 1, y: playing ? 12 : 0 }}
        transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
      >
        <header className="flex items-center gap-3">
          <span className="rounded-full bg-white p-1.5"><KbcLogo size={30} /></span>
          <span className="text-[15px] font-bold">KBC Outcome Engine</span>
          <span className="ml-auto hidden text-[13px] text-white/50 sm:block">Synthetic demo customers · illustrative figures</span>
        </header>

        <div ref={headRef} className="mx-auto mt-3 text-center">
          <p className="text-[15px] font-bold text-kate">Choose your player</p>
          <h1 className="mt-1 text-[clamp(26px,2.6vw,40px)] font-extrabold leading-[1.08] tracking-[-0.02em]">
            Pick a goal. Then watch life get in the way.
          </h1>
        </div>

        <div className="-mb-1 mt-auto flex flex-col items-center">
          <section ref={cardRef} data-player-card className="pointer-events-auto w-full max-w-[860px]">
            <PlayerCard persona={persona} onPlay={() => void play(persona.id)} disabled={playing} reduce={reduce} />
          </section>
          <p className="mt-4 text-[13px] text-white/50">← → or drag to choose · Enter to play</p>
        </div>
      </motion.div>
    </main>
  );
}

// The text crossfades per player; the Play button stays mounted so keyboard focus survives ← →.
function PlayerCard({ persona: p, onPlay, disabled, reduce }: { persona: Persona; onPlay: () => void; disabled: boolean; reduce: boolean }) {
  const partners = new Set(p.journey.steps.flatMap((s) => (s.provider.kind === "partner" ? [s.provider.name] : [])));
  const stats = [
    { label: p.outcome.constraints.find((c) => c.key === "cost")!.label, value: eur(p.outcome.baseline.limits.cost) },
    { label: "Horizon", value: `${p.outcome.horizon} months` },
    { label: "Steps", value: String(p.journey.steps.length) },
    { label: "Partners", value: String(partners.size) },
  ];
  const brief = `${stats[0].value} · ${stats[1].value} · ${stats[2].value} steps · ${stats[3].value} partners`;
  return (
    <div className="grid items-center gap-x-8 gap-y-3 rounded-[8px] bg-[rgb(2_30_67/0.72)] p-4 ring-1 ring-white/12 backdrop-blur-md sm:grid-cols-[1.25fr_1fr] sm:px-6 sm:py-5 [@media(max-height:859px)]:sm:py-3">
      <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={p.id}
        aria-live="polite"
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
        transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
        className="min-w-0"
      >
        <p className="text-[15px] font-semibold text-white/70">{p.customer.name}, {p.customer.age} · {p.customer.city}</p>
        <p className="mt-0.5 text-[clamp(24px,2.2vw,32px)] font-extrabold leading-[1.1] tracking-[-0.02em]">{p.copy.quest}</p>
        <p className="mt-1.5 text-[15px] leading-[21px] text-white/70">{p.copy.tagline}</p>
        <p className="mt-3 flex items-center gap-2 text-[13px] font-semibold text-white/60">
          <span className="flex gap-1.5" aria-label={`${p.outcome.disruptions.length} unexpected events`}>
            {p.outcome.disruptions.map((d) => <EventBadge key={d.id} kind={d.kind} size={26} />)}
          </span>
          {p.outcome.disruptions.length} things will go wrong
        </p>
      </motion.div>
      </AnimatePresence>
      <div>
        {/* Short screens (a 720p projector): one line of facts instead of the grid, so the scene keeps its room. */}
        <p className="tabular hidden truncate text-[14px] font-semibold text-white/75 [@media(max-height:859px)]:block">
          {brief}
        </p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-[8px] bg-white/[0.06] px-4 py-3 ring-1 ring-white/10 [@media(max-height:859px)]:hidden">
          {stats.map((s) => (
            <div key={s.label} className="min-w-0">
              <dt className="truncate text-[12px] font-semibold text-white/55">{s.label}</dt>
              <dd className="tabular whitespace-nowrap text-[17px] font-extrabold leading-tight">{s.value}</dd>
            </div>
          ))}
        </dl>
        <button
          type="button"
          onClick={onPlay}
          disabled={disabled}
          className="press mt-3 flex h-[54px] w-full items-center justify-center gap-2 rounded-full bg-accent text-[19px] font-bold text-white hover:bg-accent-600 disabled:opacity-60"
        >
          Play as {p.customer.name}
          <ArrowRight size={20} weight="bold" />
        </button>
      </div>
    </div>
  );
}

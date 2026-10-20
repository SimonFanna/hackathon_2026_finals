"use client";

import { ArrowRight, Baby, Car, House, LockSimple, PiggyBank, Storefront } from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";
import { personas, type Persona } from "@/engine";
import { KbcLogo } from "./KbcLogo";
import { EventBadge } from "./outcome-ui";
import { eur } from "./format";

const look: Record<Persona["id"], { skin: string; hair: string; shirt: string; style: "short" | "bun"; Icon: typeof House }> = {
  house: { skin: "#f1c7a5", hair: "#4a3426", shirt: "#0097db", style: "short", Icon: House },
  business: { skin: "#c68e6a", hair: "#1f1a17", shirt: "#00903d", style: "bun", Icon: Storefront },
};

/** Flat, friendly bust. No photos: these are synthetic customers. */
function Avatar({ id, size = 112 }: { id: Persona["id"]; size?: number }) {
  const l = look[id];
  return (
    <span className="relative inline-block shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 120 120" width={size} height={size} aria-hidden>
        <circle cx="60" cy="60" r="60" fill="#e5f4ff" />
        <clipPath id={`clip-${id}`}><circle cx="60" cy="60" r="60" /></clipPath>
        <g clipPath={`url(#clip-${id})`}>
          <path d="M14 120c2-26 20-38 46-38s44 12 46 38z" fill={l.shirt} />
          <rect x="51" y="62" width="18" height="22" rx="8" fill={l.skin} />
          <circle cx="60" cy="50" r="23" fill={l.skin} />
          {l.style === "short" ? (
            <path d="M36 47c0-16 11-25 25-25 13 0 23 8 23 22-5-6-14-9-25-9-9 0-17 4-23 12z" fill={l.hair} />
          ) : (
            <>
              <circle cx="60" cy="20" r="11" fill={l.hair} />
              <path d="M36 50c-1-17 10-27 24-27s25 10 24 27c-6-9-14-14-24-14s-18 5-24 14z" fill={l.hair} />
            </>
          )}
          <circle cx="52" cy="52" r="2.2" fill="#0d2a50" />
          <circle cx="68" cy="52" r="2.2" fill="#0d2a50" />
          <path d="M53 61c4 4 10 4 14 0" stroke="#0d2a50" strokeWidth="2.4" fill="none" strokeLinecap="round" />
        </g>
      </svg>
      <span className="absolute -bottom-1 -right-1 grid size-10 place-items-center rounded-full bg-night text-white ring-4 ring-white">
        <l.Icon size={20} weight="bold" />
      </span>
    </span>
  );
}

const locked = [
  { title: "Retire in 5 years", tags: "Pensions · Investing · Wealth", Icon: PiggyBank },
  { title: "Expecting a baby", tags: "Family · Protection · Savings", Icon: Baby },
  { title: "Switch to an electric car", tags: "Mobility · Energy", Icon: Car },
];

/** S0: pick a player. Two goals, one engine. */
export function CharacterSelect({
  selected, onSelect, onPlay, compact,
}: { selected: Persona["id"]; onSelect: (id: Persona["id"]) => void; onPlay: (id: Persona["id"]) => void; compact: boolean }) {
  const reduce = useReducedMotion();
  return (
    <main className="relative min-h-[100dvh] overflow-x-hidden bg-[linear-gradient(180deg,#021e43_0%,#0d2a50_100%)] px-5 pb-16 pt-6 text-white sm:px-10">
      <div className="mx-auto max-w-[1080px]">
        <header className="flex items-center gap-3">
          <span className="rounded-full bg-white p-1.5"><KbcLogo size={30} /></span>
          <span className="text-[15px] font-bold">KBC Outcome Engine</span>
          <span className="ml-auto hidden text-[13px] text-white/50 sm:block">Synthetic demo customers · illustrative figures</span>
        </header>

        <motion.div
          // Same initial state on server and client (no reduced-motion branch) to avoid a hydration mismatch.
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduce ? { duration: 0.15 } : { type: "spring", bounce: 0, duration: 0.6 }}
          className="mt-10 text-center sm:mt-14"
        >
          <p className="text-[15px] font-bold text-kate">Choose your player</p>
          <h1 className="mx-auto mt-2 max-w-[760px] text-[34px] font-extrabold leading-[38px] tracking-[-0.02em] sm:text-[52px] sm:leading-[56px]">
            Pick a goal. Then watch life get in the way.
          </h1>
          <p className="mx-auto mt-4 max-w-[640px] text-[17px] leading-[25px] text-white/70">
            One engine turns any goal into a plan with KBC and its partners, and re-plans it when something goes wrong. You stay in control.
          </p>
        </motion.div>

        <div role="radiogroup" aria-label="Players" className="mt-10 grid gap-5 md:grid-cols-2">
          {personas.map((p, i) => (
            <PlayerCard key={p.id} persona={p} n={i + 1} active={selected === p.id} onSelect={() => onSelect(p.id)} onPlay={() => onPlay(p.id)} delay={0.1 + i * 0.08} />
          ))}
        </div>

        <section className="mt-10">
          <h2 className="text-[15px] font-bold text-white/70">More players. Same engine, new data.</h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-3">
            {locked.map((l) => (
              <li key={l.title} className="flex items-center gap-3 rounded-[8px] bg-white/6 px-4 py-3 ring-1 ring-white/10">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white/10 text-white/70"><l.Icon size={20} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-bold text-white/85">{l.title}</span>
                  <span className="block truncate text-[12px] text-white/50">{l.tags}</span>
                </span>
                <LockSimple size={16} className="shrink-0 text-white/40" aria-label="Coming next" />
              </li>
            ))}
          </ul>
        </section>

        {!compact && <p className="mt-8 text-center text-[13px] text-white/45">← → to choose · Enter to play</p>}
      </div>
    </main>
  );
}

function PlayerCard({
  persona: p, n, active, onSelect, onPlay, delay,
}: { persona: Persona; n: number; active: boolean; onSelect: () => void; onPlay: () => void; delay: number }) {
  const reduce = useReducedMotion();
  const partners = new Set(p.journey.steps.flatMap((s) => (s.provider.kind === "partner" ? [s.provider.name] : [])));
  const ecosystems = [...new Set(p.journey.steps.map((s) => s.ecosystem))];
  const stats = [
    { label: p.outcome.constraints.find((c) => c.key === "cost")!.label, value: eur(p.outcome.baseline.limits.cost) },
    { label: "Horizon", value: `${p.outcome.horizon} months` },
    { label: "Steps", value: String(p.journey.steps.length) },
    { label: "Partners", value: String(partners.size) },
  ];

  return (
    <motion.div
      role="radio"
      aria-checked={active}
      tabIndex={0}
      onClick={onSelect}
      onDoubleClick={onPlay}
      onKeyDown={(e) => {
        if (e.key === " ") { e.preventDefault(); onSelect(); }
      }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0, scale: active && !reduce ? 1.015 : 1 }}
      transition={reduce ? { duration: 0.15 } : { type: "spring", bounce: 0, duration: 0.5, delay: active ? 0 : delay }}
      className={`relative cursor-pointer rounded-[8px] bg-white p-5 text-night outline-none transition-shadow sm:p-6 ${
        active ? "shadow-[0_0_0_4px_var(--color-accent),0_24px_60px_rgb(0_151_219/0.35)]" : "opacity-90 hover:opacity-100"
      }`}
    >
      <div className="flex items-center justify-between text-[13px] font-bold text-night-300">
        <span>Player {n}</span>
        <span className="flex items-center gap-1.5" aria-label={`${p.outcome.disruptions.length} unexpected events`}>
          {p.outcome.disruptions.map((d) => <EventBadge key={d.id} kind={d.kind} size={22} />)}
        </span>
      </div>

      <div className="mt-4 flex items-center gap-5">
        <Avatar id={p.id} />
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-night-300">{p.customer.name}, {p.customer.age} · {p.customer.city}</p>
          <p className="mt-0.5 text-[28px] font-extrabold leading-[32px] tracking-[-0.02em]">{p.copy.quest}</p>
          <p className="mt-1 text-[15px] leading-[21px] text-night-300">{p.copy.tagline}</p>
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-4 gap-2 rounded-[8px] bg-element p-3">
        {stats.map((s) => (
          <div key={s.label}>
            <dt className="truncate text-[11px] font-semibold text-night-300">{s.label}</dt>
            <dd className="tabular text-[16px] font-extrabold">{s.value}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-4 flex flex-wrap gap-1.5">
        {ecosystems.map((e) => (
          <span key={e} className="rounded-[4px] bg-accent-100 px-2 py-0.5 text-[12px] font-bold text-accent-600">{e}</span>
        ))}
      </p>

      <button
        onClick={(e) => { e.stopPropagation(); onPlay(); }}
        className={`press mt-5 flex h-[54px] w-full items-center justify-center gap-2 rounded-full text-[19px] font-bold ${
          active ? "bg-accent text-white hover:bg-accent-600" : "bg-surface text-night hover:bg-accent-100"
        }`}
      >
        Play as {p.customer.name}
        <ArrowRight size={20} weight="bold" />
      </button>
    </motion.div>
  );
}

"use client";

import { motion, useReducedMotion } from "motion/react";
import { goalReached, type Persona, type Run, type Scoreboard } from "@/engine";
import { AnimatedNumber } from "./AnimatedNumber";
import { eur, num, tonnes } from "./format";
import { EventBadge } from "./outcome-ui";

/** S6: the outcome and the triple win, as the pitch's closing frame. `variant="app"` renders it inside the phone on small screens. */
export function Finale({
  persona, run, board, onEstimate, onRestart, onPlayers, variant = "stage",
}: {
  persona: Persona;
  run: Run | null;
  board: Scoreboard;
  onEstimate: () => void;
  onRestart: () => void;
  onPlayers: () => void;
  variant?: "stage" | "app";
}) {
  const model = persona.outcome;
  const shocks = run?.history.length ?? 0;
  const reached = !!run && goalReached(run, model);
  const yourCalls = run?.history.filter((h) => h.optionId !== h.recommendedId).length ?? 0;
  const reduce = useReducedMotion();
  const col = (i: number) => ({
    initial: reduce ? { opacity: 0 } : { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0 },
    transition: { type: "spring" as const, bounce: 0, duration: 0.6, delay: 0.25 + i * 0.08 },
  });
  const stage = variant === "stage";

  return (
    <section aria-labelledby="finale-title" className={`text-white ${stage ? "w-[660px] max-w-full" : "phone-scroll h-full overflow-y-auto bg-night px-5 pb-10 pt-6"}`}>
      <motion.h1
        id="finale-title"
        {...col(-1)}
        className={`font-extrabold tracking-[-0.02em] ${stage ? "text-[52px] leading-[56px]" : "text-[32px] leading-[36px]"}`}
      >
        Life hit {shocks} {shocks === 1 ? "time" : "times"}.<br />{reached ? "The plan held." : "Kate is still on it."}
      </motion.h1>
      <motion.p {...col(-1)} className={`mt-3 text-white/75 ${stage ? "text-[19px] leading-[26px]" : "text-[16px] leading-[23px]"}`}>
        {reached ? model.goalReached : "Some limits are still broken. Kate keeps watching and will re-plan as soon as something changes."}
      </motion.p>
      {run && run.history.length > 0 && (
        <motion.ul {...col(-1)} className="mt-5 flex flex-wrap gap-2">
          {run.history.map((h) => {
            const d = model.disruptions.find((x) => x.id === h.disruptionId)!;
            return (
              <li key={h.disruptionId} className="flex items-center gap-2 rounded-full bg-white/8 py-1 pl-1 pr-3 text-[13px] font-semibold text-white/85">
                <EventBadge kind={d.kind} size={24} tone="done" />
                {d.options.find((o) => o.id === h.optionId)?.label}
              </li>
            );
          })}
        </motion.ul>
      )}
      {run && (
        <motion.p {...col(-1)} className="mt-3 text-[14px] text-white/60">
          {yourCalls === 0 ? "Kate recommended, the customer approved every change." : `The customer overruled Kate ${yourCalls} ${yourCalls === 1 ? "time" : "times"}. Their call, every time.`}
        </motion.p>
      )}

      <div className={`mt-8 grid gap-8 ${stage ? "grid-cols-3" : "grid-cols-1"}`}>
        <motion.div {...col(0)}>
          <h2 className="text-[18px] font-bold text-white/80">{persona.customer.name}</h2>
          <Stat value={board.customer.eurOneOff} format={eur} label="unlocked once" />
          <Stat value={board.customer.eurPerYear} format={eur} label="saved every year" />
          {board.customer.kwhPerYear > 0 && <Stat value={board.customer.kwhPerYear} format={num} unit="kWh" label="less energy every year" green />}
          {board.customer.co2KgPerYear > 0 && <Stat value={board.customer.co2KgPerYear} format={tonnes} unit="CO₂" label="less every year" green />}
        </motion.div>
        <motion.div {...col(1)}>
          <h2 className="text-[18px] font-bold text-white/80">KBC</h2>
          <Stat value={board.kbc.productsActivated} format={num} label="products in one journey, not one sale" />
          <Stat value={board.kbc.revenueEur} format={eur} label="estimated revenue" />
        </motion.div>
        <motion.div {...col(2)}>
          <h2 className="text-[18px] font-bold text-white/80">Partners</h2>
          <Stat value={board.partners.leads} format={num} label="qualified leads, each with consent" />
          <Stat value={board.partners.valueEur} format={eur} label="lead value, at the right moment" />
        </motion.div>
      </div>

      <motion.div {...col(3)} className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
        <button onClick={onEstimate} className="press rounded-full px-1 py-2 text-[16px] font-semibold text-white underline decoration-white/40 underline-offset-4 hover:decoration-white">
          How we estimate this
        </button>
        <button onClick={onRestart} className="press rounded-full px-5 py-2.5 text-[16px] font-semibold text-white ring-1 ring-white/30 hover:bg-white/10">
          Play again
        </button>
        <button onClick={onPlayers} className="press rounded-full px-5 py-2.5 text-[16px] font-semibold text-white ring-1 ring-white/30 hover:bg-white/10">
          Choose another player
        </button>
        <p className="w-full text-[13px] text-white/60">Illustrative figures for the demo, not KBC data.</p>
      </motion.div>
    </section>
  );
}

function Stat({ value, format, label, unit, green }: { value: number; format: (n: number) => string; label: string; unit?: string; green?: boolean }) {
  return (
    <p className="mt-4">
      <span className={`block text-[36px] font-extrabold leading-[40px] tracking-[-0.02em] ${green ? "text-green" : "text-white"}`}>
        <AnimatedNumber value={value} format={format} from={0} />
        {unit && <span className="ml-1.5 text-[20px] font-bold">{unit}</span>}
      </span>
      <span className="mt-1 block text-[15px] leading-[20px] text-white/70">{label}</span>
    </p>
  );
}

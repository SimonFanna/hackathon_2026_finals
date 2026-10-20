"use client";

import { motion, useReducedMotion } from "motion/react";
import type { Scoreboard } from "@/engine";
import { AnimatedNumber } from "./AnimatedNumber";
import { eur, num, tonnes } from "./format";

/** S6: the triple win, as the pitch's closing frame. `variant="app"` renders it inside the phone on small screens. */
export function Finale({
  board, steps, onEstimate, onRestart, variant = "stage",
}: { board: Scoreboard; steps: number; onEstimate: () => void; onRestart: () => void; variant?: "stage" | "app" }) {
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
        One intent. {steps} {steps === 1 ? "step" : "steps"}.<br />Everyone wins.
      </motion.h1>

      <div className={`mt-10 grid gap-8 ${stage ? "grid-cols-3" : "grid-cols-1"}`}>
        <motion.div {...col(0)}>
          <h2 className="text-[18px] font-bold text-white/80">Sofie</h2>
          <Stat value={board.customer.eurOneOff} format={eur} label="unlocked once: grants and a fair price" />
          <Stat value={board.customer.eurPerYear} format={eur} label="saved every year on energy" />
          <Stat value={board.customer.kwhPerYear} format={num} unit="kWh" label="less energy every year" green />
          <Stat value={board.customer.co2KgPerYear} format={tonnes} unit="CO₂" label="less every year" green />
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

      <motion.div {...col(3)} className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3">
        <button onClick={onEstimate} className="press rounded-full px-1 py-2 text-[16px] font-semibold text-white underline decoration-white/40 underline-offset-4 hover:decoration-white">
          How we estimate this
        </button>
        <button onClick={onRestart} className="press rounded-full px-5 py-2.5 text-[16px] font-semibold text-white ring-1 ring-white/30 hover:bg-white/10">
          Start again
        </button>
        <p className="w-full text-[13px] text-white/60">Illustrative figures for the demo, not KBC data.</p>
      </motion.div>
    </section>
  );
}

function Stat({ value, format, label, unit, green }: { value: number; format: (n: number) => string; label: string; unit?: string; green?: boolean }) {
  return (
    <p className="mt-5">
      <span className={`block text-[40px] font-extrabold leading-[44px] tracking-[-0.02em] ${green ? "text-green" : "text-white"}`}>
        <AnimatedNumber value={value} format={format} from={0} />
        {unit && <span className="ml-1.5 text-[20px] font-bold">{unit}</span>}
      </span>
      <span className="mt-1 block text-[15px] leading-[20px] text-white/70">{label}</span>
    </p>
  );
}

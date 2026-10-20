"use client";

import {
  ClockCountdown, CurrencyEur, FirstAidKit, Briefcase, TrendUp, Wallet, type Icon,
} from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";
import type { ConstraintCheck, ConstraintDef, DisruptionKind } from "@/engine";
import { AnimatedNumber } from "./AnimatedNumber";
import { formatLimit, formatValue, healthTone, healthWord } from "./copy";

export const kindIcon: Record<DisruptionKind, Icon> = {
  cost: CurrencyEur,
  delay: ClockCountdown,
  income: Briefcase,
  rate: TrendUp,
  cashflow: Wallet,
  health: FirstAidKit,
};

const toneBar = { good: "bg-green", risk: "bg-warning", bad: "bg-danger" } as const;
const toneText = { good: "text-green-600", risk: "text-warning", bad: "text-danger" } as const;
const toneTextDark = { good: "text-green", risk: "text-[#ffad4d]", bad: "text-[#ff6b81]" } as const;

const pct = (n: number) => `${Math.round(n)}%`;

/** Goal health, 0–100, like a game's life bar. `from` animates a drop (event) or a recovery (re-plan). */
export function HealthBar({ value, from, dark, size = "md" }: { value: number; from?: number; dark?: boolean; size?: "md" | "lg" }) {
  const reduce = useReducedMotion();
  const tone = healthTone(value);
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className={`text-[13px] font-bold ${dark ? "text-white/70" : "text-night-300"}`}>Goal health</span>
        <span className={`flex items-baseline gap-2 font-extrabold ${dark ? toneTextDark[tone] : toneText[tone]}`}>
          <span className="text-[13px] font-bold">{healthWord(value)}</span>
          <AnimatedNumber value={value} from={from} format={pct} className={size === "lg" ? "text-[28px] leading-8" : "text-[17px]"} />
        </span>
      </div>
      <div
        role="meter"
        aria-label="Goal health"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        className={`mt-1.5 overflow-hidden rounded-full ${dark ? "bg-white/12" : "bg-night-100/50"} ${size === "lg" ? "h-3" : "h-2"}`}
      >
        <motion.div
          className={`h-full rounded-full ${toneBar[tone]}`}
          initial={{ width: `${from ?? value}%` }}
          animate={{ width: `${value}%` }}
          transition={reduce ? { duration: 0 } : { type: "spring", bounce: 0, duration: 0.8, delay: 0.15 }}
        />
      </div>
    </div>
  );
}

/** One constraint: value against its limit, and how close to the edge it is. */
export function ConstraintRow({ def, check, dark }: { def: ConstraintDef; check: ConstraintCheck; dark?: boolean }) {
  const reduce = useReducedMotion();
  const fill = Math.min(check.usage, 1) * 100;
  const tone = !check.ok ? "bad" : check.usage > 0.95 ? "risk" : "good";
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-[13px] leading-[18px]">
        <span className={dark ? "text-white/70" : "text-night-300"}>{def.label}</span>
        <span className="tabular whitespace-nowrap">
          <b className={!check.ok ? (dark ? "text-[#ff6b81]" : "text-danger") : dark ? "text-white" : "text-night"}>{formatValue(def, check.value)}</b>
          <span className={dark ? "text-white/50" : "text-night-300"}> · {formatLimit(def, check.limit)}</span>
        </span>
      </div>
      <div className={`mt-1 h-1.5 overflow-hidden rounded-full ${dark ? "bg-white/12" : "bg-night-100/50"}`}>
        <motion.div
          className={`h-full rounded-full ${toneBar[tone]}`}
          animate={{ width: `${fill}%` }}
          transition={reduce ? { duration: 0 } : { type: "spring", bounce: 0, duration: 0.6 }}
        />
      </div>
    </div>
  );
}

export function EventBadge({ kind, size = 44, tone = "danger" }: { kind: DisruptionKind; size?: number; tone?: "danger" | "done" | "idle" }) {
  const I = kindIcon[kind];
  const cls = tone === "danger" ? "bg-danger text-white" : tone === "done" ? "bg-green text-white" : "bg-white/10 text-white/60";
  return (
    <span className={`grid shrink-0 place-items-center rounded-full ${cls}`} style={{ width: size, height: size }}>
      <I size={size * 0.52} weight="bold" />
    </span>
  );
}

"use client";

import { motion } from "motion/react";
import type { DetectedIntent, IntentModel, JourneyState, JourneyStep, Scoreboard, Signal } from "@/engine";
import { eur, num } from "./format";

/** Jury-only view (key P): what the engine sees and decides. Never shown to the customer. */
export function PresenterPanel({
  signals, model, intent, step, state, board, weak, onToggleWeak,
}: {
  signals: Signal[];
  model: IntentModel;
  intent: DetectedIntent | undefined;
  step: JourneyStep | null;
  state: JourneyState | null;
  board: Scoreboard;
  weak: boolean;
  onToggleWeak: () => void;
}) {
  const levelLabel = { none: "NO ACTION", ask: "ASK", suggest: "SUGGEST" } as const;
  const levelText = {
    none: "Weak evidence: Kate stays silent. Doing nothing is always an option.",
    ask: "Some evidence: ask the customer before building anything.",
    suggest: "Strong evidence: propose the plan, the customer still approves every step.",
  } as const;
  return (
    <motion.aside
      aria-label="Presenter view"
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -12, transition: { duration: 0.15 } }}
      transition={{ type: "spring", bounce: 0, duration: 0.35 }}
      className="w-[320px] shrink-0 text-[14px] leading-[20px] text-white/80"
    >
      <h2 className="text-[20px] font-bold text-white">What the engine sees</h2>

      <Block title="Signals (independent evidence)">
        <ul className="space-y-1.5">
          {signals.map((s) => (
            <li key={s.id} className="flex justify-between gap-3">
              <span>{s.label}</span>
              <span className="tabular shrink-0 font-semibold text-white">{model.weights[s.type]?.toFixed(2)}</span>
            </li>
          ))}
        </ul>
      </Block>

      <Block title="Decision">
        {intent ? (
          <>
            <p className="tabular">confidence = 1 − ∏(1 − w)</p>
            <p className="tabular mt-1 text-[18px] font-bold text-white">
              {intent.confidence.toFixed(2)} → {levelLabel[intent.level]}
            </p>
            <p className="tabular text-white/60">
              no action &lt; {model.askThreshold.toFixed(2)} · ask · suggest ≥ {model.suggestThreshold.toFixed(2)}
            </p>
            <p className="mt-1">{levelText[intent.level]}</p>
          </>
        ) : (
          <p className="font-semibold text-white">No signals → NO ACTION</p>
        )}
        <p className="mt-1 text-white/60">Deterministic rules. No language model decides.</p>
        <button
          onClick={onToggleWeak}
          className="press mt-3 rounded-full px-4 py-2 text-[14px] font-semibold text-white ring-1 ring-white/30 hover:bg-white/10"
        >
          {weak ? "Back to the real signals" : "Try weak signals (Kate stays silent)"}
        </button>
      </Block>

      {step && state && (
        <Block title={`Step ${step.order}: catalogue item`}>
          <p className="font-semibold text-white">{step.catalogueItem}</p>
          <p>{step.ecosystem} · {step.provider.kind === "partner" ? `partner ${step.provider.name}` : "KBC"} · {state.decisions[step.id]}</p>
          {step.dataShared.length > 0 && (
            <p className="mt-1">
              consent:{" "}
              {step.dataShared.map((f) => `${f} ${state.consents[step.id]?.[f] ? "yes" : "no"}`).join(", ")}
            </p>
          )}
        </Block>
      )}

      <Block title="Scoreboard (accepted steps only)">
        <p className="tabular">customer {eur(board.customer.eurOneOff)} once · {eur(board.customer.eurPerYear)}/yr</p>
        <p className="tabular">{num(board.customer.kwhPerYear)} kWh/yr · {num(board.customer.co2KgPerYear)} kg CO₂/yr</p>
        <p className="tabular">KBC {board.kbc.productsActivated} products · {eur(board.kbc.revenueEur)}</p>
        <p className="tabular">partners {board.partners.leads} leads · {eur(board.partners.valueEur)}</p>
        <p className="mt-1 text-white/60">A lead counts only if the step is accepted and at least one field is shared.</p>
      </Block>

      <Block title="Keys">
        <p>→ next · ← back · S skip · F fill the plan · 1–4 pick an option · R restart · C players · W weak signals · P hide this panel</p>
      </Block>
    </motion.aside>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5 border-t border-white/15 pt-4">
      <h3 className="mb-2 text-[13px] font-bold text-white/60">{title}</h3>
      {children}
    </section>
  );
}

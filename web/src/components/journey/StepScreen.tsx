"use client";

import { House, Lightning, ShieldCheck, SlidersHorizontal, Storefront } from "@phosphor-icons/react";
import type { Journey, JourneyState, JourneyStep, Scoreboard } from "@/engine";
import { AnimatedNumber } from "./AnimatedNumber";
import { outcomeLine, providerName, purposeFor } from "./copy";
import { eur, naturalList } from "./format";
import { KateLine } from "./Kate";
import { KbcLogo } from "./KbcLogo";
import { BackButton, PrimaryButton, ScreenLayout, TextButton } from "./ui";

export type ConsentMode = "proposed" | "custom";

/** S4: one step, one card, three honest choices. */
export function StepScreen({
  state, index, board, consentMode, onPrimary, onWithoutSharing, onSkip, onBack, onChoose,
}: {
  state: JourneyState;
  index: number;
  board: Scoreboard;
  consentMode: ConsentMode;
  onPrimary: () => void;
  onWithoutSharing: () => void;
  onSkip: () => void;
  onBack: () => void;
  onChoose: () => void;
}) {
  const step = state.journey.steps[index];
  const isPartner = step.provider.kind === "partner";
  const fields = step.dataShared;
  const consents = state.consents[step.id] ?? {};
  const chosen = fields.filter((f) => consents[f]);
  const outcome = outcomeLine(step);

  let primaryLabel = "Add to my plan";
  if (isPartner && fields.length > 0) {
    if (consentMode === "proposed" || chosen.length === fields.length) primaryLabel = "Share and continue";
    else if (chosen.length === 0) primaryLabel = "Continue without sharing";
    else primaryLabel = `Share ${chosen.length} of ${fields.length} and continue`;
  }
  const showWithout = isPartner && fields.length > 0 && primaryLabel !== "Continue without sharing";

  return (
    <ScreenLayout
      top={
        <>
          <div className="flex items-center justify-between">
            <BackButton onClick={onBack} />
            <ImpactPill board={board} />
          </div>
          <Progress journey={state.journey} state={state} index={index} />
          <p className="mt-2 text-[13px] font-semibold leading-[18px] text-night-300">
            {state.journey.chapters.find((c) => c.id === step.chapter)?.label} · <span className="tabular">{index + 1} of {state.journey.steps.length}</span>
          </p>
        </>
      }
      actions={
        <>
          <PrimaryButton onClick={onPrimary}>{primaryLabel}</PrimaryButton>
          {showWithout && <TextButton onClick={onWithoutSharing}>Continue without sharing</TextButton>}
          <TextButton onClick={onSkip} tone="muted">Skip</TextButton>
        </>
      }
    >
      <div className="pt-5">
        <KateLine key={step.id}>{step.why}</KateLine>

        <article className="mt-5 rounded-[8px] bg-white p-5 shadow-card">
          <ProviderRow step={step} />
          <h1 className="mt-4 text-[22px] font-bold leading-[27px] tracking-[-0.01em]">{step.title}</h1>
          {outcome && (
            <p className={`mt-2 text-[16px] font-semibold leading-[23px] ${outcome.green ? "text-green-600" : "text-night"}`}>{outcome.text}</p>
          )}

          <div className="mt-4 border-t border-night-100/70 pt-4">
            {isPartner && fields.length > 0 ? (
              <ConsentBlock step={step} chosen={chosen} mode={consentMode} onChoose={onChoose} />
            ) : (
              <p className="flex items-center gap-2 text-[15px] leading-[21px] text-night-300">
                <ShieldCheck size={20} weight="regular" className="shrink-0 text-accent-600" />
                Stays with KBC. Nothing is shared.
              </p>
            )}
          </div>
        </article>
      </div>
    </ScreenLayout>
  );
}

function ProviderRow({ step }: { step: JourneyStep }) {
  if (step.provider.kind === "kbc") {
    return (
      <div className="flex items-center gap-2.5">
        <KbcLogo size={30} />
        <span className="text-[15px] font-bold">KBC</span>
      </div>
    );
  }
  const Icon = step.ecosystem.startsWith("Energy") ? Lightning : step.ecosystem === "Housing" ? House : Storefront;
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid size-[30px] place-items-center rounded-[4px] bg-element text-accent-600">
        <Icon size={18} weight="regular" />
      </span>
      <span className="text-[15px] font-bold">{step.provider.name}</span>
      <span className="text-[13px] text-night-300">Partner of KBC</span>
    </div>
  );
}

function ConsentBlock({ step, chosen, mode, onChoose }: { step: JourneyStep; chosen: string[]; mode: ConsentMode; onChoose: () => void }) {
  const name = providerName(step);
  return (
    <div>
      <p className="text-[17px] font-semibold leading-[26px]">
        Share your{" "}
        {step.dataShared.map((f, i) => {
          const on = mode === "proposed" || chosen.includes(f);
          const sep = i === 0 ? "" : i === step.dataShared.length - 1 ? " and " : ", ";
          return (
            <span key={f}>
              {sep && <span className={sep.startsWith(",") ? "-ml-1" : ""}>{sep}</span>}
              <span className={`rounded-[4px] px-1 py-0.5 ${on ? "bg-accent-100 text-night" : "bg-surface text-night-300 line-through"}`}>{f}</span>
            </span>
          );
        })}{" "}
        with {name}?
      </p>
      <p className="mt-2 text-[15px] leading-[21px] text-night-300">{purposeFor(step)}</p>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-[13px] font-semibold text-night-300">Shared once</span>
        <button onClick={onChoose} className="press -mr-2 flex items-center gap-1.5 rounded-full px-2 py-1.5 text-[15px] font-semibold text-accent-600 hover:bg-accent-100">
          <SlidersHorizontal size={18} />
          Choose what to share
        </button>
      </div>
      <span className="sr-only">Will be shared: {naturalList(mode === "proposed" ? step.dataShared : chosen) || "nothing"}.</span>
    </div>
  );
}

/** Segmented progress, grouped by chapter: accepted, skipped, current, upcoming. */
function Progress({ journey, state, index }: { journey: Journey; state: JourneyState; index: number }) {
  return (
    <div className="mt-2 flex gap-2" role="progressbar" aria-valuemin={1} aria-valuemax={journey.steps.length} aria-valuenow={index + 1} aria-label="Journey progress">
      {journey.chapters.map((c) => {
        const steps = journey.steps.filter((s) => s.chapter === c.id);
        if (steps.length === 0) return null;
        return (
          <div key={c.id} className="flex gap-[3px]" style={{ flex: steps.length }}>
            {steps.map((s) => {
              const i = journey.steps.indexOf(s);
              const d = state.decisions[s.id];
              const color =
                i === index ? "bg-night" : d === "accepted" ? "bg-accent" : d === "skipped" ? "bg-night-100" : "bg-night-100/45";
              return <span key={s.id} className={`h-[5px] flex-1 rounded-full transition-colors duration-200 ${color}`} />;
            })}
          </div>
        );
      })}
    </div>
  );
}

/** Quiet running total that grows as steps are accepted. */
function ImpactPill({ board }: { board: Scoreboard }) {
  const { eurOneOff, eurPerYear } = board.customer;
  const empty = eurOneOff === 0 && eurPerYear === 0;
  return (
    <p
      className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-[14px] font-bold transition-colors duration-300 ${
        empty ? "bg-white/70 text-night-300" : "bg-white text-night shadow-card"
      }`}
      aria-label={`Your plan so far: ${eur(eurOneOff)} once and ${eur(eurPerYear)} a year`}
    >
      <AnimatedNumber value={eurOneOff} format={eur} />
      {eurPerYear > 0 && (
        <>
          <span className="text-night-300">+</span>
          <AnimatedNumber value={eurPerYear} format={eur} className="text-green-600" />
          <span className="text-[12px] font-semibold text-green-600">/yr</span>
        </>
      )}
    </p>
  );
}

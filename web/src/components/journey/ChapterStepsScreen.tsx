"use client";

import { ArrowCounterClockwise, Check, House, Lightning, ShieldCheck, Storefront } from "@phosphor-icons/react";
import type { JourneyState, JourneyStep, Scoreboard } from "@/engine";
import { AnimatedNumber } from "./AnimatedNumber";
import { outcomeLine } from "./copy";
import { eur } from "./format";
import { KateLine } from "./Kate";
import { KbcLogo } from "./KbcLogo";
import { pageTitle, type StepPage } from "./stepPages";
import { BackButton, PrimaryButton, ScreenLayout, TextButton } from "./ui";

/**
 * S4 (Demo V2): one page per part of the plan, its steps as compact cards. Every card shows who does it
 * (KBC or a named partner of the ecosystem), what is shared (pre-ticked, each detail can be unticked) and
 * what it is worth. A step can be skipped from its card; the primary button accepts the rest of the page.
 */
export function ChapterStepsScreen({
  state, pages, index, board, onAccept, onSkipPage, onBack, onToggleSkip, onToggleConsent,
}: {
  state: JourneyState;
  pages: StepPage[];
  index: number;
  board: Scoreboard;
  onAccept: () => void;
  onSkipPage: () => void;
  onBack: () => void;
  onToggleSkip: (stepId: string) => void;
  onToggleConsent: (stepId: string, field: string, ok: boolean) => void;
}) {
  const page = pages[index];
  const pending = page.steps.filter((s) => state.decisions[s.id] === "pending");
  const partners = new Set(page.steps.flatMap((s) => (s.provider.kind === "partner" ? [s.provider.name] : [])));
  const kate =
    index === 0
      ? "Here's the first part. Untick anything you'd rather not share, or skip a step."
      : index === pages.length - 1
        ? "Last part. Same rules: you decide what is shared, and with whom."
        : `Next: ${pageTitle(page).toLowerCase()}. You stay in control of every step.`;

  return (
    <ScreenLayout
      top={
        <>
          <div className="flex items-center justify-between">
            <BackButton onClick={onBack} />
            <ImpactPill board={board} />
          </div>
          <Progress pages={pages} state={state} index={index} />
          <p className="mt-2 text-[13px] font-semibold leading-[18px] text-night-300">
            Part <span className="tabular">{index + 1} of {pages.length}</span> · {page.steps.length} {page.steps.length === 1 ? "step" : "steps"}
            {partners.size > 0 && <> · KBC + {[...partners].join(" · ")}</>}
          </p>
        </>
      }
      actions={
        <>
          <PrimaryButton onClick={onAccept}>
            {pending.length === 0 ? "Continue" : pending.length === 1 ? "Accept this step" : `Accept these ${pending.length} steps`}
          </PrimaryButton>
          <TextButton onClick={onSkipPage} tone="muted">Skip this part</TextButton>
        </>
      }
    >
      <div className="pt-4">
        <KateLine key={index}>{kate}</KateLine>
        <h1 className="mt-4 text-[24px] font-extrabold leading-[28px] tracking-[-0.02em]">{pageTitle(page)}</h1>
        <div className="mt-3 space-y-4">
          {page.chapters.map((c) => (
            <section key={c.id}>
              {page.chapters.length > 1 && <h2 className="mb-1.5 text-[13px] font-bold uppercase tracking-[0.04em] text-night-300">{c.label}</h2>}
              <ul className="space-y-2">
                {c.steps.map((s) => (
                  <StepCard
                    key={s.id}
                    step={s}
                    decision={state.decisions[s.id]}
                    consents={state.consents[s.id] ?? {}}
                    onToggleSkip={() => onToggleSkip(s.id)}
                    onToggleConsent={(f, ok) => onToggleConsent(s.id, f, ok)}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </ScreenLayout>
  );
}

function StepCard({
  step, decision, consents, onToggleSkip, onToggleConsent,
}: {
  step: JourneyStep;
  decision: JourneyState["decisions"][string];
  consents: Record<string, boolean>;
  onToggleSkip: () => void;
  onToggleConsent: (field: string, ok: boolean) => void;
}) {
  const isPartner = step.provider.kind === "partner";
  const skipped = decision === "skipped";
  const accepted = decision === "accepted";
  const outcome = outcomeLine(step);
  return (
    <li
      className={`rounded-[8px] bg-white px-3.5 py-3 shadow-card transition-opacity duration-200 ${skipped ? "opacity-55" : ""} ${
        accepted ? "ring-2 ring-accent/60" : ""
      }`}
      aria-label={`${step.title}, ${skipped ? "skipped" : accepted ? "accepted" : "proposed"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <ProviderChip step={step} />
        {accepted ? (
          <span className="flex shrink-0 items-center gap-1 text-[13px] font-bold text-accent-600"><Check size={14} weight="bold" /> Added</span>
        ) : (
          <button
            onClick={onToggleSkip}
            className="press -mr-1 -mt-1 flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[13px] font-semibold text-night-300 hover:bg-surface"
            aria-pressed={skipped}
          >
            {skipped ? <><ArrowCounterClockwise size={14} weight="bold" /> Undo</> : "Skip"}
          </button>
        )}
      </div>
      <p className={`mt-1.5 text-[16px] font-bold leading-[21px] ${skipped ? "line-through" : ""}`}>{step.title}</p>
      {outcome && (
        <p className={`mt-0.5 text-[14px] font-semibold leading-[19px] ${outcome.green ? "text-green-600" : "text-night"}`}>{outcome.text}</p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {isPartner && step.dataShared.length > 0 ? (
          <>
            <span className="text-[13px] font-semibold text-night-300">Shares:</span>
            {step.dataShared.map((f) => {
              const on = !!consents[f];
              return (
                <button
                  key={f}
                  role="checkbox"
                  aria-checked={on}
                  disabled={skipped || accepted}
                  onClick={() => onToggleConsent(f, !on)}
                  className={`press flex items-center gap-1 rounded-full px-2 py-0.5 text-[13px] font-semibold transition-colors duration-150 first-letter:uppercase disabled:cursor-default ${
                    on ? "bg-accent-100 text-night" : "bg-surface text-night-300 line-through"
                  }`}
                >
                  {on && <Check size={12} weight="bold" className="text-accent-600" />}
                  {f.replace(/_/g, " ")}
                </button>
              );
            })}
          </>
        ) : (
          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-night-300">
            <ShieldCheck size={16} weight="regular" className="text-accent-600" />
            Stays with KBC
          </span>
        )}
      </div>
    </li>
  );
}

/** KBC, or the partner's name with its ecosystem: the visible part of the KBC network. */
function ProviderChip({ step }: { step: JourneyStep }) {
  if (step.provider.kind === "kbc") {
    return (
      <span className="flex min-w-0 items-center gap-2">
        <KbcLogo size={22} />
        <span className="text-[14px] font-bold">KBC</span>
      </span>
    );
  }
  const Icon = step.ecosystem.startsWith("Energy") ? Lightning : step.ecosystem === "Housing" ? House : Storefront;
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <span className="grid size-[22px] shrink-0 place-items-center rounded-[4px] bg-element text-accent-600">
        <Icon size={14} weight="regular" />
      </span>
      <span className="text-[14px] font-bold">{step.provider.name}</span>
      <span className="shrink-0 rounded-full bg-accent-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.04em] text-accent-600">
        Partner{step.ecosystem ? ` · ${step.ecosystem}` : ""}
      </span>
    </span>
  );
}

/** Segmented progress, one segment per step grouped by page: accepted, skipped, current page, upcoming. */
function Progress({ pages, state, index }: { pages: StepPage[]; state: JourneyState; index: number }) {
  const total = pages.reduce((n, p) => n + p.steps.length, 0);
  return (
    <div className="mt-2 flex gap-2" role="progressbar" aria-valuemin={1} aria-valuemax={pages.length} aria-valuenow={index + 1} aria-label="Plan progress">
      {pages.map((p, i) => (
        <div key={i} className="flex gap-[3px]" style={{ flex: p.steps.length / total }}>
          {p.steps.map((s) => {
            const d = state.decisions[s.id];
            const color = d === "accepted" ? "bg-accent" : d === "skipped" ? "bg-night-100" : i === index ? "bg-night" : "bg-night-100/45";
            return <span key={s.id} className={`h-[5px] flex-1 rounded-full transition-colors duration-200 ${color}`} />;
          })}
        </div>
      ))}
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

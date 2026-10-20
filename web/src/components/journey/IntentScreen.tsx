"use client";

import { CaretDown } from "@phosphor-icons/react";
import type { DetectedIntent, Signal } from "@/engine";
import { intentCopy, kateLineFor } from "./copy";
import { KateLine } from "./Kate";
import { BackButton, PrimaryButton, ScreenLayout, TextButton } from "./ui";

/** S2: Kate asks before assuming. */
export function IntentScreen({
  intent, signals, onConfirm, onDecline, onBack, onWhy,
}: { intent: DetectedIntent; signals: Signal[]; onConfirm: () => void; onDecline: () => void; onBack: () => void; onWhy: () => void }) {
  return (
    <ScreenLayout
      top={<BackButton onClick={onBack} />}
      actions={
        <>
          <PrimaryButton onClick={onConfirm}>
            {intent.needsConfirmation ? "Yes, I'm buying a home" : "Show my plan"}
          </PrimaryButton>
          <TextButton onClick={onDecline} tone="muted">Not now</TextButton>
        </>
      }
    >
      <div className="pt-6">
        <KateLine>{kateLineFor(signals)}</KateLine>
        <h1 className="mt-8 text-[30px] font-extrabold leading-[34px] tracking-[-0.02em]">
          {intent.needsConfirmation ? intentCopy.question : intentCopy.sure}
        </h1>
        {intent.needsConfirmation && <p className="mt-3 text-[16px] leading-[23px] text-night-300">{intentCopy.unsure}</p>}
        <button onClick={onWhy} className="press -ml-2 mt-6 flex items-center gap-1.5 rounded-full px-2 py-2 text-[16px] font-semibold text-accent-600 hover:bg-accent-100">
          Why am I seeing this?
          <CaretDown size={16} weight="bold" />
        </button>
      </div>
    </ScreenLayout>
  );
}

/** S2b: declined. Nothing built, nothing shared. */
export function DeclinedScreen({ onHome }: { onHome: () => void }) {
  return (
    <ScreenLayout actions={<PrimaryButton onClick={onHome}>Back to home</PrimaryButton>}>
      <div className="pt-16">
        <KateLine>{intentCopy.declined}</KateLine>
      </div>
    </ScreenLayout>
  );
}

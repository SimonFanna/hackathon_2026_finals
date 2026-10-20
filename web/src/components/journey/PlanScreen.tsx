"use client";

import { CheckCircle } from "@phosphor-icons/react";
import type { JourneyState } from "@/engine";
import { chapterLabel, chapterOrder, providerName } from "./copy";
import { KateLine } from "./Kate";
import { BackButton, PrimaryButton, ScreenLayout, TextButton } from "./ui";

/** S5: the plan Sofie built, plus an honest privacy recap. */
export function PlanScreen({ state, onImpact, onBack, onAdvisor, final }: { state: JourneyState; onImpact: () => void; onBack: () => void; onAdvisor: () => void; final?: boolean }) {
  const steps = state.journey.steps;
  const accepted = steps.filter((s) => state.decisions[s.id] === "accepted");
  const skipped = steps.filter((s) => state.decisions[s.id] === "skipped").length;

  const sharedWith = new Set<string>();
  let details = 0;
  for (const s of accepted) {
    const n = Object.values(state.consents[s.id] ?? {}).filter(Boolean).length;
    if (n > 0 && s.provider.kind === "partner") {
      details += n;
      sharedWith.add(s.provider.name);
    }
  }

  return (
    <ScreenLayout
      top={<BackButton onClick={onBack} />}
      actions={
        <>
          {!final && <PrimaryButton onClick={onImpact}>See the impact</PrimaryButton>}
          <TextButton onClick={onAdvisor}>Talk it through with a KBC advisor</TextButton>
        </>
      }
    >
      <div className="pt-3">
        <h1 className="text-[30px] font-extrabold leading-[34px] tracking-[-0.02em]">
          {accepted.length > 0 ? "Your plan is ready" : "Nothing added yet"}
        </h1>
        {accepted.length === 0 && (
          <div className="mt-5"><KateLine>Your plan stays here whenever you&apos;re ready.</KateLine></div>
        )}

        <div className="mt-5 space-y-5">
          {chapterOrder.map((c) => {
            const items = accepted.filter((s) => s.chapter === c);
            if (items.length === 0) return null;
            return (
              <section key={c}>
                <h2 className="text-[15px] font-bold text-night-300">{chapterLabel[c]}</h2>
                <ul className="mt-2 space-y-2">
                  {items.map((s) => (
                    <li key={s.id} className="flex items-start gap-3 rounded-[8px] bg-white px-4 py-3 shadow-card">
                      <CheckCircle size={22} weight="fill" className="mt-0.5 shrink-0 text-accent" />
                      <span>
                        <span className="block text-[16px] font-semibold leading-[22px]">{s.title}</span>
                        <span className="text-[13px] text-night-300">{providerName(s)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
        {skipped > 0 && <p className="mt-4 text-[14px] text-night-300">{skipped} {skipped === 1 ? "step" : "steps"} skipped. You can come back to them later.</p>}

        <div className="mt-5 rounded-[8px] bg-element p-4 text-[16px] leading-[23px]">
          {details > 0 ? (
            <>You shared <b className="tabular">{details}</b> {details === 1 ? "detail" : "details"} with <b className="tabular">{sharedWith.size}</b> {sharedWith.size === 1 ? "partner" : "partners"}. Nothing else left KBC.</>
          ) : (
            <>You shared nothing with partners. Everything stayed with KBC.</>
          )}
        </div>
      </div>
    </ScreenLayout>
  );
}

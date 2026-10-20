"use client";

import type { Journey } from "@/engine";
import { EcosystemStrip } from "./EcosystemStrip";
import { KateLine } from "./Kate";
import { groupPages, pageTitle } from "./stepPages";
import { BackButton, PrimaryButton, ScreenLayout } from "./ui";

/** S3: the whole path in a few parts, and the ecosystem behind it, before the first part. */
export function PathScreen({ journey, title, onStart, onBack }: { journey: Journey; title: string; onStart: () => void; onBack: () => void }) {
  const pages = groupPages(journey);
  return (
    <ScreenLayout top={<BackButton onClick={onBack} />} actions={<PrimaryButton onClick={onStart}>Start</PrimaryButton>}>
      <div className="pt-4">
        <KateLine>Great. Here’s the whole path, in {pages.length} short {pages.length === 1 ? "part" : "parts"}.</KateLine>
        <h1 className="mt-8 text-[30px] font-extrabold leading-[34px] tracking-[-0.02em]">{title}</h1>
        <ol className="mt-7 space-y-2.5">
          {pages.map((pg, i) => {
            const n = pg.steps.length;
            const partners = [...new Set(pg.steps.flatMap((s) => (s.provider.kind === "partner" ? [s.provider.name] : [])))];
            return (
              <li key={i} className="flex items-center gap-4 rounded-[8px] bg-white px-4 py-3.5 shadow-card">
                <span className="tabular grid size-8 shrink-0 place-items-center rounded-full bg-accent-100 text-[15px] font-bold text-accent-600">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[18px] font-bold leading-[24px]">{pageTitle(pg)}</span>
                  {partners.length > 0 && <span className="block text-[13px] leading-[18px] text-night-300">with {partners.join(" · ")}</span>}
                </span>
                <span className="shrink-0 text-[15px] text-night-300">{n} {n === 1 ? "step" : "steps"}</span>
              </li>
            );
          })}
        </ol>
        <div className="mt-5"><EcosystemStrip journey={journey} /></div>
        <p className="mt-4 text-[16px] leading-[23px] text-night-300">You decide what is shared, and with whom.</p>
      </div>
    </ScreenLayout>
  );
}

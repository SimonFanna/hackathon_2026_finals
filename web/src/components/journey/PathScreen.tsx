"use client";

import type { Journey } from "@/engine";
import { chapterLabel, chapterOrder } from "./copy";
import { KateLine } from "./Kate";
import { BackButton, PrimaryButton, ScreenLayout } from "./ui";

/** S3: the whole path in four chapters, before step one. */
export function PathScreen({ journey, city, onStart, onBack }: { journey: Journey; city: string; onStart: () => void; onBack: () => void }) {
  return (
    <ScreenLayout top={<BackButton onClick={onBack} />} actions={<PrimaryButton onClick={onStart}>Start</PrimaryButton>}>
      <div className="pt-4">
        <KateLine>Great. Here’s the whole path. We’ll take it one step at a time.</KateLine>
        <h1 className="mt-8 text-[30px] font-extrabold leading-[34px] tracking-[-0.02em]">Your path to a home in {city}</h1>
        <ol className="mt-7 space-y-2.5">
          {chapterOrder.map((c, i) => {
            const n = journey.steps.filter((s) => s.chapter === c).length;
            if (n === 0) return null;
            return (
              <li key={c} className="flex items-center gap-4 rounded-[8px] bg-white px-4 py-4 shadow-card">
                <span className="tabular grid size-8 shrink-0 place-items-center rounded-full bg-accent-100 text-[15px] font-bold text-accent-600">{i + 1}</span>
                <span className="flex-1 text-[18px] font-bold">{chapterLabel[c]}</span>
                <span className="text-[15px] text-night-300">{n} {n === 1 ? "step" : "steps"}</span>
              </li>
            );
          })}
        </ol>
        <p className="mt-6 text-[16px] leading-[23px] text-night-300">One step at a time. You decide what is shared, and with whom.</p>
      </div>
    </ScreenLayout>
  );
}

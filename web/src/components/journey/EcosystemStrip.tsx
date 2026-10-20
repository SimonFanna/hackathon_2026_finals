"use client";

import type { Journey } from "@/engine";
import { KbcLogo } from "./KbcLogo";
import { ecosystemOf } from "./stepPages";

/** "KBC + 4 partners: Immoscoop · Setle · …" — the ecosystem behind the plan, on the path and plan pages. */
export function EcosystemStrip({ journey, compact }: { journey: Journey; compact?: boolean }) {
  const { partners, ecosystems } = ecosystemOf(journey);
  return (
    <div className={`flex items-start gap-3 rounded-[8px] bg-element ${compact ? "px-3.5 py-2.5" : "px-4 py-3.5"}`}>
      <KbcLogo size={compact ? 26 : 32} />
      <div className="min-w-0">
        <p className="text-[15px] font-bold leading-[21px]">
          KBC + {partners.length} {partners.length === 1 ? "partner" : "partners"}
          {partners.length > 0 && <span className="font-semibold text-night-300">: {partners.join(" · ")}</span>}
        </p>
        {ecosystems.length > 0 && (
          <p className="mt-0.5 text-[13px] leading-[18px] text-night-300">
            {ecosystems.length === 1 ? "Ecosystem" : "Ecosystems"}: {ecosystems.join(" · ")}
          </p>
        )}
      </div>
    </div>
  );
}

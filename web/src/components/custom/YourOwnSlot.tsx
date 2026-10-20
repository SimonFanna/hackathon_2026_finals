"use client";

import { ArrowRight } from "@phosphor-icons/react";

/** Player 3 in the pickers: a night-blue silhouette with a "?" (the locked-goal look), opening the custom player. */
export function YourOwnSlot({ onOpen, variant }: { onOpen: () => void; variant: "3d" | "2d" }) {
  const floating = variant === "3d";
  return (
    <button
      type="button"
      onClick={onOpen}
      data-your-own
      aria-label="Player 3: build your own customer"
      className={`press group pointer-events-auto flex items-center gap-4 rounded-[8px] text-left text-white ring-1 ring-white/15 backdrop-blur-md hover:ring-accent ${
        floating ? "w-[210px] shrink-0 flex-col items-start self-stretch bg-[rgb(2_30_67/0.72)] p-4" : "w-full bg-white/[0.06] px-5 py-4"
      }`}
    >
      <svg viewBox="0 0 64 64" width={floating ? 56 : 64} height={floating ? 56 : 64} aria-hidden className="shrink-0">
        <circle cx="32" cy="32" r="32" fill="#0d2a50" />
        <clipPath id="your-own-clip"><circle cx="32" cy="32" r="32" /></clipPath>
        <g clipPath="url(#your-own-clip)" fill="#1d3d66">
          <circle cx="32" cy="25" r="12" />
          <path d="M8 64c1-14 11-21 24-21s23 7 24 21z" />
        </g>
        <text x="32" y="31" textAnchor="middle" fontSize="16" fontWeight="800" fill="#55c7df">?</text>
      </svg>
      <span className="min-w-0">
        <span className="block text-[12px] font-bold text-white/55">Player 3 · press 3</span>
        <span className="block text-[18px] font-extrabold leading-tight">Your own</span>
        <span className="block text-[13px] text-white/65">Build a customer, watch the model adapt</span>
      </span>
      <ArrowRight size={18} weight="bold" className={`${floating ? "hidden" : "ml-auto"} shrink-0 text-white/60 transition-transform group-hover:translate-x-0.5 group-hover:text-white`} />
    </button>
  );
}

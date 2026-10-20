"use client";

import { CaretLeft } from "@phosphor-icons/react";

/** Primary pill: KDL accent, 19px bold label (large-text AA on #0097DB). */
export function PrimaryButton({ children, onClick, autoFocus }: { children: React.ReactNode; onClick: () => void; autoFocus?: boolean }) {
  return (
    <button
      onClick={onClick}
      autoFocus={autoFocus}
      className="press flex h-[54px] w-full items-center justify-center rounded-full bg-accent px-6 text-[19px] font-bold text-white hover:bg-accent-600"
    >
      {children}
    </button>
  );
}

export function TextButton({ children, onClick, tone = "accent" }: { children: React.ReactNode; onClick: () => void; tone?: "accent" | "muted" }) {
  return (
    <button
      onClick={onClick}
      className={`press flex h-12 w-full items-center justify-center rounded-full text-[16px] font-semibold ${
        tone === "accent" ? "text-accent-600 hover:bg-accent-100" : "text-night-300 hover:bg-white"
      }`}
    >
      {children}
    </button>
  );
}

export function BackButton({ onClick, label = "Back" }: { onClick: () => void; label?: string }) {
  return (
    <button onClick={onClick} aria-label={label} className="press -ml-2 grid size-11 place-items-center rounded-full text-night hover:bg-white">
      <CaretLeft size={24} weight="bold" />
    </button>
  );
}

/** Screen body: scrollable content on top, actions pinned in the thumb zone. */
export function ScreenLayout({ top, children, actions }: { top?: React.ReactNode; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      {top && <div className="shrink-0 px-5 pt-1">{top}</div>}
      <div className="phone-scroll min-h-0 flex-1 overflow-y-auto px-5 pb-4">{children}</div>
      {actions && <div className="shrink-0 space-y-1 px-5 pb-7 pt-2">{actions}</div>}
    </div>
  );
}

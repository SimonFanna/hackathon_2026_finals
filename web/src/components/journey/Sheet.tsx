"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";

/** Bottom sheet inside the phone: scrim + panel, Escape closes, focus is trapped while open. */
export function Sheet({ open, title, onClose, children, dark }: { open: boolean; title: string; onClose: () => void; children: React.ReactNode; dark?: boolean }) {
  const reduce = useReducedMotion();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const el = panel.current;
    const focusables = () => Array.from(el?.querySelectorAll<HTMLElement>("button, [href], input, [tabindex]:not([tabindex='-1'])") ?? []);
    requestAnimationFrame(() => focusables()[0]?.focus());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
      if (e.key === "Tab") {
        const f = focusables();
        if (f.length === 0) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      prev?.focus?.();
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div key="sheet" className="absolute inset-0 z-40 flex flex-col justify-end" initial={{ opacity: 1 }} exit={{ opacity: 1 }}>
          <motion.button
            aria-label="Close"
            tabIndex={-1}
            onClick={onClose}
            className="absolute inset-0 bg-[rgb(13_42_80/0.4)]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.2 } }}
          />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={`relative max-h-[80%] overflow-y-auto rounded-t-[16px] px-5 pb-9 pt-3 ${dark ? "bg-night text-white" : "bg-white text-night"}`}
            initial={reduce ? { opacity: 0 } : { y: "100%" }}
            animate={reduce ? { opacity: 1 } : { y: 0 }}
            exit={reduce ? { opacity: 0 } : { y: "100%", transition: { duration: 0.2, ease: [0.23, 1, 0.32, 1] } }}
            transition={{ type: "spring", bounce: 0, duration: 0.35 }}
          >
            <span aria-hidden className={`mx-auto mb-4 block h-1 w-10 rounded-full ${dark ? "bg-white/30" : "bg-night-100"}`} />
            <h2 className="text-[22px] font-bold leading-[27px] tracking-[-0.01em]">{title}</h2>
            <div className="mt-4">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Switch({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="press flex min-h-14 w-full items-center justify-between gap-4 border-b border-night-100/60 text-left text-[17px] font-semibold last:border-b-0"
    >
      <span className="first-letter:uppercase">{label}</span>
      <span className={`relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200 ${on ? "bg-accent" : "bg-night-100"}`}>
        <span className={`absolute top-[2px] size-[27px] rounded-full bg-white shadow-card transition-transform duration-200 ${on ? "translate-x-[22px]" : "translate-x-[2px]"}`} />
      </span>
    </button>
  );
}

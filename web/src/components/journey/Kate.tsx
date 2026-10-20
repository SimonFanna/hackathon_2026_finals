"use client";

import { motion, useReducedMotion } from "motion/react";

/** Neutral Kate mark (the official Kate avatar is not public): a disc in the KDL Kate colour. */
export function KateMark({ size = 28 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="relative inline-grid shrink-0 place-items-center rounded-full bg-kate"
      style={{ width: size, height: size }}
    >
      <span className="rounded-full bg-white/90" style={{ width: size * 0.32, height: size * 0.32 }} />
    </span>
  );
}

/** One line spoken by Kate. Fades in like a chat message. */
export function KateLine({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, delay, ease: [0.23, 1, 0.32, 1] }}
      className="flex items-start gap-3"
      aria-live="polite"
    >
      <KateMark />
      <p className="pt-0.5 text-[17px] font-medium leading-6 text-night">
        <span className="sr-only">Kate says: </span>
        {children}
      </p>
    </motion.div>
  );
}

"use client";

import { animate, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";

/**
 * Counts to `value` (600ms ease-out) without re-rendering React on every frame.
 * Starts from `from` on mount when given (the finale counts up from 0), otherwise from the previous value.
 */
export function AnimatedNumber({ value, format, from, className }: { value: number; format: (n: number) => string; from?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(from ?? value);
  const reduce = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const start = prev.current;
    prev.current = value;
    if (reduce || start === value) {
      el.textContent = format(value);
      return;
    }
    const controls = animate(start, value, {
      duration: 0.6,
      ease: [0.23, 1, 0.32, 1],
      onUpdate: (v) => (el.textContent = format(v)),
    });
    return () => controls.stop();
  }, [value, format, reduce]);

  return (
    <span ref={ref} className={`tabular ${className ?? ""}`}>
      {format(from ?? value)}
    </span>
  );
}

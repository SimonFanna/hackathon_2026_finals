"use client";

import { motion } from "motion/react";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { PendingHit } from "@/engine";
import { hasWebGL } from "../picker/capability";
import type { BuildCanvasProps } from "./BuildCanvas";

// Left column of the stage (>= 1100 px): the player's own diorama builds piece by piece as plan steps
// are accepted (see docs/features/demo-v2-steps.md, P4). The three.js canvas is code-split and never
// rendered on the server; nothing shows with ?q=low, without WebGL, or after a lost context. The demo
// never depends on it: the phone and the HUD are unchanged when this returns null.

const BuildCanvas = dynamic(() => import("./BuildCanvas"), { ssr: false, loading: () => null });

export type BuildStageProps = Omit<BuildCanvasProps, "onFail">;

/** The step a disruption's options change (Kate's recommendation first), or null for the whole building. */
export function affectedStep(pending: PendingHit | null): string | null {
  if (!pending) return null;
  const ranked = [...pending.options].sort((a, b) => Number(!!b.recommended) - Number(!!a.recommended));
  for (const o of ranked) {
    const id = o.changes?.[0]?.stepId;
    if (id) return id;
  }
  return pending.options.find((o) => o.requiresStep)?.requiresStep ?? null;
}

export function BuildStage(props: BuildStageProps) {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      const q = new URLSearchParams(window.location.search);
      setOk(q.get("q") !== "low" && hasWebGL());
    }, 0);
    return () => clearTimeout(t);
  }, []);
  if (!ok) return null;
  return (
    <motion.div
      aria-hidden
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.2 } }}
      transition={{ type: "spring", bounce: 0, duration: 0.6 }}
      className="relative h-[min(84vh,820px)] w-[min(34vw,640px)] shrink-0 overflow-hidden rounded-[20px]"
      data-build-stage
    >
      <BuildCanvas {...props} onFail={() => setOk(false)} />
      <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-[12px] font-semibold text-white/50">
        Built as you accept each step · estimates, synthetic data
      </p>
    </motion.div>
  );
}

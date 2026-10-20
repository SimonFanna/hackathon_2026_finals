"use client";

import { useCallback, useEffect, useState } from "react";
import { Stage } from "../journey/Stage";
import { PainTunnel } from "./PainTunnel";
import { readEntry } from "./model";

export function IntroExperience() {
  const [entry, setEntry] = useState<ReturnType<typeof readEntry> | null>(null);
  const [mode, setMode] = useState<"intro" | "players" | "replay">("intro");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const initial = readEntry(window.location.search);
      setEntry(initial);
      if (initial.skip) setMode("players");
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const leave = useCallback((replay: boolean) => {
    const url = new URL(window.location.href);
    ["pain", "hit", "still", "demo", "player"].forEach((key) => url.searchParams.delete(key));
    url.searchParams.set("intro", "0");
    if (replay) url.searchParams.set("player", "house");
    window.history.replaceState(null, "", url);
    window.scrollTo(0, 0);
    setMode(replay ? "replay" : "players");
  }, []);
  const replay = useCallback(() => leave(true), [leave]);
  const skip = useCallback(() => leave(false), [leave]);

  if (!entry) return <main className="grid min-h-dvh place-items-center bg-night-600 text-white" aria-label="Loading the interactive story"><span className="font-mono text-sm tracking-widest">LOADING PLAYER 01…</span></main>;
  if (mode !== "intro") return <Stage startAtHome={mode === "replay"} />;
  return <PainTunnel initialFrame={entry.frame} still={entry.still} onReplay={replay} onSkip={skip} />;
}

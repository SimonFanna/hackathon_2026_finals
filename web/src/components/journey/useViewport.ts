"use client";

import { useSyncExternalStore } from "react";

type Size = { w: number; h: number };
let cached: Size | null = null;

function subscribe(cb: () => void) {
  window.addEventListener("resize", cb);
  return () => window.removeEventListener("resize", cb);
}
function getSnapshot(): Size {
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (!cached || cached.w !== w || cached.h !== h) cached = { w, h };
  return cached;
}
const server: Size = { w: 1440, h: 900 };

/** Viewport size; a stable desktop default during prerender. */
export function useViewport(): Size {
  return useSyncExternalStore(subscribe, getSnapshot, () => server);
}

// Simple in-memory fixed-window limiter (per server instance). Enough for a demo; not a distributed limiter.
const hits = new Map<string, { windowStart: number; count: number }>();

export function rateLimit(key: string, limit = 10, windowMs = 60_000, now = Date.now()): { ok: boolean; retryAfterS: number } {
  const h = hits.get(key);
  if (!h || now - h.windowStart >= windowMs) {
    hits.set(key, { windowStart: now, count: 1 });
    if (hits.size > 5000) for (const [k, v] of hits) if (now - v.windowStart >= windowMs) hits.delete(k);
    return { ok: true, retryAfterS: 0 };
  }
  h.count += 1;
  return h.count <= limit ? { ok: true, retryAfterS: 0 } : { ok: false, retryAfterS: Math.ceil((h.windowStart + windowMs - now) / 1000) };
}

/** Client key: first X-Forwarded-For hop (set by the hosting proxy), else a shared bucket. */
export function clientKey(req: Request, route: string): string {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "anon";
  return `${route}:${ip}`;
}

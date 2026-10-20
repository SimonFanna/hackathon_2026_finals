// T7 — server-only wiring: which database client and which runtime store the API uses.
// SUPABASE_SECRET_KEY never leaves the server (no NEXT_PUBLIC_ prefix, `server-only` guard).
import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Deps } from "../pipeline";
import type { Db } from "./db";
import { memoryRepo, type Repo, supabaseRepo } from "./repo";

const REQUEST_TIMEOUT_MS = 4000; // no Supabase call may hang a demo request
const PROBE_TIMEOUT_MS = 1500;
const ONLINE_TTL_MS = 60_000;
const OFFLINE_TTL_MS = 20_000;

type G = typeof globalThis & { __kbcOnline?: Deps; __kbcOffline?: Deps; __kbcVerdict?: { at: number; online: boolean } };
const g = globalThis as G;

const timedFetch: typeof fetch = (input, init) => fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS) });

function client(url: string | undefined, key: string | undefined): Db | null {
  return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: timedFetch } }) : null;
}

/** Snapshot + in-memory state: the demo without network. */
function offlineDeps(): Deps {
  return (g.__kbcOffline ??= { db: null, repo: memoryRepo() });
}

/**
 * - Secret key set: read and write Supabase (runtime tables need it).
 * - Only the publishable key: read the demo personas and config from Supabase, keep state in memory.
 * - Nothing set, BACKEND_OFFLINE=1, or Supabase unreachable (cached probe): snapshot + memory.
 */
export async function serverDeps(): Promise<Deps> {
  if (process.env.BACKEND_OFFLINE === "1") return offlineDeps();
  if (!g.__kbcOnline) {
    const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const secret = client(url, process.env.SUPABASE_SECRET_KEY);
    const reader = secret ?? client(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
    if (!reader) return offlineDeps();
    const repo: Repo = secret ? supabaseRepo(secret) : memoryRepo();
    g.__kbcOnline = { db: reader, repo };
  }
  return (await reachable(g.__kbcOnline.db!)) ? g.__kbcOnline : offlineDeps();
}

async function reachable(db: Db): Promise<boolean> {
  const v = g.__kbcVerdict;
  if (v && Date.now() - v.at < (v.online ? ONLINE_TTL_MS : OFFLINE_TTL_MS)) return v.online;
  const probe = Promise.resolve(db.from("ecosystems").select("id").limit(1)).then((r) => !r.error, () => false);
  const timeout = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), PROBE_TIMEOUT_MS));
  const online = await Promise.race([probe, timeout]);
  if (!online && (!v || v.online)) console.warn("[backend] Supabase unreachable: serving the offline snapshot with in-memory state");
  g.__kbcVerdict = { at: Date.now(), online };
  return online;
}

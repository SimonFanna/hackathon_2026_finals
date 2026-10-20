// T7 — server-only wiring: which database client and which runtime store the API uses.
// SUPABASE_SECRET_KEY never leaves the server (no NEXT_PUBLIC_ prefix, `server-only` guard).
import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Deps } from "../pipeline";
import type { Db } from "./db";
import { memoryRepo, type Repo, supabaseRepo } from "./repo";

const g = globalThis as typeof globalThis & { __kbcDeps?: Deps; __kbcMemoryRepo?: Repo };

function client(url: string | undefined, key: string | undefined): Db | null {
  return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
}

/**
 * - Secret key set: read and write Supabase (runtime tables need it).
 * - Only the publishable key: read the demo personas and config from Supabase, keep state in memory.
 * - Nothing set, or BACKEND_OFFLINE=1: snapshot + memory (the demo still works without network).
 */
export function serverDeps(): Deps {
  if (g.__kbcDeps) return g.__kbcDeps;
  const offline = process.env.BACKEND_OFFLINE === "1";
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = offline ? null : client(url, process.env.SUPABASE_SECRET_KEY);
  const reader = offline ? null : (secret ?? client(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY));
  g.__kbcMemoryRepo ??= memoryRepo();
  g.__kbcDeps = { db: reader, repo: secret ? supabaseRepo(secret) : g.__kbcMemoryRepo };
  return g.__kbcDeps;
}

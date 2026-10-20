// T7 — tiny helpers around supabase-js. No `server-only` here: the snapshot script and tests import this file.
import type { SupabaseClient } from "@supabase/supabase-js";

export type Db = SupabaseClient;

/** An untyped database row (we have no generated Database types; mappers convert rows to contract types). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;

interface Result {
  data: unknown;
  error: { message: string } | null;
}

/** Throw on a PostgREST error, return the data otherwise. */
export async function must<T = Row[]>(q: PromiseLike<Result>): Promise<T> {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data as T;
}

const PAGE = 1000; // PostgREST max rows per request

/** Every row of a query, page by page (`build(from, to)` must apply `.range(from, to)` and a stable order). */
export async function all<T = Row>(build: (from: number, to: number) => PromiseLike<Result>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const page = await must<T[] | null>(build(from, from + PAGE - 1));
    rows.push(...(page ?? []));
    if (!page || page.length < PAGE) return rows;
  }
}

/** PostgREST returns numeric columns as numbers or strings depending on size: normalise. */
export const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
export const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

/** An embedded to-one relation can come back as an object or a one-element array. */
export function one<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

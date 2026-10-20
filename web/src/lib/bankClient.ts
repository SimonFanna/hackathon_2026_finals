import { mapBankProfile, type BankCustomerRow, type BankEventRow, type Customer, type Signal } from "@/engine";

// Reads a demo persona from the Supabase Data API with the publishable key. RLS only exposes the
// six demo personas and the catalogue. Any failure (offline, timeout, missing env) returns null,
// and the caller keeps the bundled snapshot.

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export interface BankProfile { customer: Customer; signals: Signal[] }

async function get<T>(path: string, signal: AbortSignal): Promise<T> {
  const res = await fetch(`${URL}/rest/v1/${path}`, { headers: { apikey: KEY! }, signal, cache: "no-store" });
  if (!res.ok) throw new Error(`Supabase ${res.status}`);
  return res.json() as Promise<T>;
}

export async function fetchDemoProfile(slug: string, today: string, timeoutMs = 3000): Promise<BankProfile | null> {
  if (!URL || !KEY) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const [row] = await get<BankCustomerRow[]>(
      `customers?demo_slug=eq.${encodeURIComponent(slug)}&select=id,first_name,birth_date,city,marital_status,customer_children(count)`,
      ctrl.signal,
    );
    if (!row) return null;
    const events = await get<BankEventRow[]>(
      `app_events?customer_id=eq.${row.id}&select=event_type,channel,occurred_at,detail,ecosystem_items(name)&order=occurred_at`,
      ctrl.signal,
    );
    return mapBankProfile(row, events, today);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

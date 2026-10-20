// T1 · ② Signals: events (facts) → signals (interpretations), driven by `signal_rules`.
// strength = rule.strength × saturation(count) × decay(age of the most recent matching event).
import type { Event, PersistentContext, Signal, SignalRule } from "../types";
import { evalCondition } from "./condition";
import { ageDays } from "./events";

const DAY_MS = 86_400_000;
const NO_CTX = {} as PersistentContext; // signal rules only look at `detail.*` / `event.*`

/** Diminishing returns: 1 event → 0.5, 2 → 0.75, 3 → 0.875… */
export function saturation(count: number): number {
  return count <= 0 ? 0 : 1 - 0.5 ** count;
}

/** Exponential decay by age (days) with the rule's half-life. Future events never decay above 1. */
export function decay(age: number, halfLifeDays: number): number {
  if (halfLifeDays <= 0) return 1;
  return 0.5 ** (Math.max(0, age) / halfLifeDays);
}

const round = (x: number, d = 4) => Math.round(x * 10 ** d) / 10 ** d;
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const sum = (es: Event[], key: string) => es.reduce((s, e) => s + (num(e.detail[key]) ?? 0), 0);

function inWindow(e: Event, windowDays: number, asOf: string): boolean {
  const age = ageDays(e.at, asOf);
  return age >= 0 && age <= windowDays;
}

function detailOk(e: Event, rule: SignalRule): boolean {
  return evalCondition(rule.match.detail ?? null, { ctx: NO_CTX, detail: e.detail, event: e });
}

/** "YYYY-MM" of the month before asOf's month (the last full month). */
function lastFullMonth(asOf: string): string {
  const d = new Date(asOf);
  const prev = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
  return prev.toISOString().slice(0, 7);
}
function monthsBefore(month: string, n: number): string[] {
  const [y, m] = month.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => new Date(Date.UTC(y, m - 2 - i, 1)).toISOString().slice(0, 7));
}

interface Match { events: Event[]; value?: number; count?: number }
type Pattern = (events: Event[], rule: SignalRule, asOf: string) => Match | null;

/** Regular salary in each of the 3 months before the last full month, none in the last full month. */
function salaryGap(events: Event[], rule: SignalRule, asOf: string) {
  const last = lastFullMonth(asOf);
  const prior = monthsBefore(last, 3);
  const salaries = events.filter((e) => e.kind === "tx:salary" && inWindow(e, rule.windowDays, asOf));
  const byMonth = new Map<string, Event[]>();
  for (const e of salaries) byMonth.set(e.at.slice(0, 7), [...(byMonth.get(e.at.slice(0, 7)) ?? []), e]);
  if (byMonth.has(last) || !prior.every((m) => byMonth.has(m))) return null;
  const avgSalary = prior.reduce((s, m) => s + sum(byMonth.get(m) ?? [], "inflow"), 0) / prior.length;
  return { last, salaries, avgSalary };
}

const INCOME_KINDS = ["tx:salary", "tx:freelance_income", "tx:transfer_in", "tx:benefits", "tx:pension_income"];

/** Aggregate signals that need a pattern rather than a single event (`kind: "pattern:<name>"`). */
export const PATTERNS: Record<string, Pattern> = {
  // Monthly saving over the last 60 days ≥ 1.2 × the monthly saving before (or a new habit ≥ €100/month).
  saving_growth(events, rule, asOf) {
    const base = events.filter((e) => e.kind === "tx:savings_transfer" && inWindow(e, rule.windowDays, asOf) && detailOk(e, rule));
    const recent = base.filter((e) => ageDays(e.at, asOf) <= 60);
    if (!recent.length) return null;
    const recentMonthly = sum(recent, "outflow") / 2;
    const baselineMonths = Math.max(1, (rule.windowDays - 60) / 30);
    const baselineMonthly = sum(base.filter((e) => ageDays(e.at, asOf) > 60), "outflow") / baselineMonths;
    const grows = baselineMonthly > 0 ? recentMonthly >= 1.2 * baselineMonthly : recentMonthly >= 100;
    return grows ? { events: recent, value: Math.round(recentMonthly) } : null;
  },
  // ≥ 2 invoice payments from ≥ 2 different clients; value = monthly freelance income (last 90 days).
  freelance(events, rule, asOf) {
    const base = events.filter((e) => e.kind === "tx:freelance_income" && inWindow(e, rule.windowDays, asOf) && detailOk(e, rule));
    const clients = new Set(base.map((e) => e.detail.counterparty));
    if (base.length < 2 || clients.size < 2) return null;
    const last90 = base.filter((e) => ageDays(e.at, asOf) <= 90);
    return { events: base, value: Math.round(sum(last90, "inflow") / 3) };
  },
  // A salary seen every month is missing in the last full month.
  salary_missing(events, rule, asOf) {
    const gap = salaryGap(events, rule, asOf);
    if (!gap) return null;
    return { events: gap.salaries, value: Math.round(gap.avgSalary) };
  },
  // Salary missing AND income observed since the start of the last full month < 75% of the usual salary.
  income_drop(events, rule, asOf) {
    const gap = salaryGap(events, rule, asOf);
    if (!gap) return null;
    const start = `${gap.last}-01`;
    const since = events.filter((e) => INCOME_KINDS.includes(e.kind) && e.at >= start && ageDays(e.at, asOf) >= 0);
    const months = Math.max(1, (Date.parse(asOf) - Date.parse(start)) / DAY_MS / 30.44);
    const observed = sum(since, "inflow") / months;
    if (observed >= 0.75 * gap.avgSalary) return null;
    return { events: [...gap.salaries.slice(-3), ...since], value: Math.round(observed) };
  },
};

function valueOf(rule: SignalRule, matched: Event[]): number | undefined {
  const latest = matched[matched.length - 1];
  const kind = latest.kind;
  if (rule.code === "RATE_CHANGE") return num(latest.detail.rateDeltaPct);
  if (kind === "simulation") {
    const amounts = matched.map((e) => num(e.detail.amount)).filter((v): v is number => v !== undefined);
    return amounts.length ? Math.max(...amounts) : undefined;
  }
  if (kind.startsWith("tx:")) return Math.round(matched.reduce((s, e) => s + Math.abs(num(e.detail.amount) ?? 0), 0) * 100) / 100;
  if (kind.startsWith("partner:")) return num(latest.detail.overrunEur) ?? num(latest.detail.delayDays) ?? num(latest.detail.amount);
  if (kind === "profile:loan") return Math.min(...matched.map((e) => num(e.detail.monthsLeft) ?? Infinity));
  if (kind === "profile:child") return Math.min(...matched.map((e) => num(e.detail.ageMonths) ?? Infinity));
  return undefined;
}

function genericMatch(events: Event[], rule: SignalRule, asOf: string): Match | null {
  const kinds = rule.match.kind.split("|");
  const rows = rule.match.sourceRows;
  const words = rule.match.textAny?.map((w) => w.toLowerCase());
  const matched = events.filter((e) => {
    if (!kinds.includes(e.kind) || !inWindow(e, rule.windowDays, asOf)) return false;
    if (rows && rows.length && (e.sourceRow === undefined || !rows.includes(e.sourceRow))) return false;
    if (words && words.length) {
      const q = String(e.detail.question ?? e.detail.query ?? "").toLowerCase();
      if (!words.some((w) => q.includes(w))) return false;
    }
    return detailOk(e, rule);
  });
  return matched.length ? { events: matched } : null;
}

/** One signal per rule that matches inside its window. Deterministic: uses `asOf`, never the clock. */
export function extractSignals(events: Event[], rules: SignalRule[], asOf: string): Signal[] {
  const signals: Signal[] = [];
  for (const rule of rules) {
    const kind = rule.match.kind;
    const m = kind.startsWith("pattern:") ? PATTERNS[kind.slice("pattern:".length)]?.(events, rule, asOf) ?? null
                                          : genericMatch(events, rule, asOf);
    if (!m || !m.events.length) continue;
    const ordered = [...m.events].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
    const latest = ordered[ordered.length - 1];
    const count = m.count ?? ordered.length;
    const value = m.value ?? valueOf(rule, ordered);
    signals.push({
      code: rule.code,
      customerId: latest.customerId,
      strength: round(rule.strength * saturation(count) * decay(ageDays(latest.at, asOf), rule.halfLifeDays)),
      at: latest.at,
      count,
      ...(value !== undefined && Number.isFinite(value) ? { value } : {}),
      evidence: ordered.map((e) => e.id),
      isDisruption: rule.isDisruption,
    });
  }
  return signals.sort((a, b) => b.strength - a.strength || (a.code < b.code ? -1 : 1));
}

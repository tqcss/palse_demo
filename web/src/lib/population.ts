import { supabase } from "./supabase.ts";
import type { RiskLevel } from "./patient.ts";
import { RISK_TIERS } from "./tiers.ts";

/**
 * Typed supabase.rpc layer for the Population Overview aggregates
 * (supabase/migrations/20261103000000_population_overview.sql).
 *
 * PRIVACY: aggregates only — the functions return counts per tier/day and
 * no patient identifiers. Org scoping is server-side via RLS (security
 * invoker); nothing org-related is accepted from the client.
 */

export interface TierCount {
  tier: RiskLevel;
  count: number;
}

export interface TrendDay {
  /** Local calendar day, ISO "YYYY-MM-DD", in the caller's time zone. */
  day: string;
  counts: Record<RiskLevel, number>;
  total: number;
}

interface OverviewRow {
  tier: string | null;
  patient_count: number | null;
}

interface TrendRow {
  day: string | null;
  tier: string | null;
  patient_count: number | null;
}

/** Caller's IANA zone (--browser hardening: fall back to UTC). */
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function tierOf(value: string | null): RiskLevel {
  return (RISK_TIERS as readonly string[]).includes(value ?? "")
    ? (value as RiskLevel)
    : "pending";
}

function zeroCounts(): Record<RiskLevel, number> {
  return { high: 0, moderate: 0, low: 0, pending: 0 };
}

/** Current tier snapshot, zero-filled across all four tiers. */
export async function fetchPopulationOverview(): Promise<TierCount[]> {
  const { data, error } = await supabase.rpc("population_overview");
  if (error != null) throw error;

  const counts = zeroCounts();
  for (const row of (data ?? []) as OverviewRow[]) {
    counts[tierOf(row.tier)] += Math.max(0, row.patient_count ?? 0);
  }
  return RISK_TIERS.map((tier) => ({ tier, count: counts[tier] }));
}

/**
 * Day-by-day tier counts for the last `pDays` days (1..90). The RPC is
 * zero-filled, but the client re-guards so a partial result can never render
 * NaN or a missing tier.
 */
export async function fetchRiskTrend(pDays: number): Promise<TrendDay[]> {
  const { data, error } = await supabase.rpc("risk_trend", {
    p_days: pDays,
    p_tz: browserTimeZone(),
  });
  if (error != null) throw error;

  const byDay = new Map<string, TrendDay>();
  for (const row of (data ?? []) as TrendRow[]) {
    if (row.day == null) continue;
    let entry = byDay.get(row.day);
    if (entry == null) {
      entry = { day: row.day, counts: zeroCounts(), total: 0 };
      byDay.set(row.day, entry);
    }
    const count = Math.max(0, row.patient_count ?? 0);
    entry.counts[tierOf(row.tier)] += count;
    entry.total += count;
  }
  return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
}

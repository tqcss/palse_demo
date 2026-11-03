import { useCallback, useEffect, useRef, useState } from "react";import {
  fetchPopulationOverview,
  fetchRiskTrend,
  type TierCount,
  type TrendDay,
} from "../lib/population.ts";

/**
 * Cached data hooks for the Population Overview aggregates. The app uses a
 * plain-`useEffect` data pattern (no React Query), so this adds a tiny
 * module-level cache in the same style instead of pulling a dependency:
 *
 * - results are cached per key with a 60 s stale window (Realtime is not
 *   enabled for patients/assessments, so a short staleness is the fallback),
 * - every window focus refetches (fresh tab counts),
 * - in-flight requests are deduplicated,
 * - `retry()` forces a reload for the per-card Retry buttons.
 */

const STALE_MS = 60_000;

interface CacheEntry {
  data: unknown;
  fetchedAt: number;
  promise: Promise<unknown> | null;
}

const cache = new Map<string, CacheEntry>();

interface UseCachedResult<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  retry: () => void;
}

function useCached<T>(key: string, loader: () => Promise<T>, deps: unknown[]): UseCachedResult<T> {
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const cached = cache.get(key);
  const [data, setData] = useState<T | null>((cached?.data as T | undefined) ?? null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(cached == null);

  const load = useCallback((refresh: boolean) => {
    let entry = cache.get(key);
    if (entry == null) {
      entry = { data: null, fetchedAt: 0, promise: null };
      cache.set(key, entry);
    }
    const fresh = refresh || Date.now() - entry.fetchedAt > STALE_MS;
    if (!fresh) {
      setData(entry.data as T | null);
      setLoading(false);
      return;
    }
    if (entry.promise != null) return; // in-flight; both callers resolve together

    setLoading(true);
    const request = loaderRef
      .current()
      .then((result) => {
        if (cache.get(key) === entry) {
          entry = { data: result, fetchedAt: Date.now(), promise: null };
          cache.set(key, entry);
        }
        setData(result);
        setError(null);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : "Request failed.");
        // Swallow: every subscriber resolves; state carries the failure.
      })
      .finally(() => {
        const current = cache.get(key);
        if (current != null) cache.set(key, { ...current, promise: null });
        if (cache.get(key) === entry) setLoading(false);
      });
    entry.promise = request;
  }, [key]);

  useEffect(() => {
    void load(false);
    return () => undefined;
  }, [load, ...deps]);

  useEffect(() => {
    function handleFocus() {
      void load(true);
    }
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [load]);

  const retry = useCallback(() => load(true), [load]);
  return { data, error, loading, retry };
}

/** Current tier snapshot for the caller's organization (cached 60 s). */
export function usePopulationOverview(): UseCachedResult<TierCount[]> {
  return useCached<TierCount[]>("population_overview", () => fetchPopulationOverview(), []);
}

const trendLoaderFor = (days: number) => () => fetchRiskTrend(days);

/** Daily tier counts (cached per day-range). */
export function useRiskTrend(days: number): UseCachedResult<TrendDay[]> {
  return useCached<TrendDay[]>(`risk_trend:${days}`, trendLoaderFor(days), [days]);
}

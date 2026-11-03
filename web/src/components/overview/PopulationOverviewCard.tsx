import { lazy, Suspense, useCallback, useState } from "react";

import MsIcon from "../MsIcon.tsx";
import RiskDonut from "./RiskDonut.tsx";
import KeyInsights from "./KeyInsights.tsx";
import ErrorBlock from "./ErrorBlock.tsx";
import CardShell from "./CardShell.tsx";
import { POPULATION_OVERVIEW_TITLE } from "../../content/riskOverview.ts";
import { usePopulationOverview, useRiskTrend } from "../../hooks/usePopulation.ts";
import { RISK_TIERS } from "../../lib/tiers.ts";

/* The chart is the heaviest bit of the section — lazy-loaded so the section
   (and especially the intake form below it) never waits for it. */
const RiskTrendChart = lazy(() => import("./RiskTrendChart.tsx"));

const RANGES = [7, 14, 30] as const;
type Range = (typeof RANGES)[number];

/**
 * "Population Overview" — LIVE tier aggregates for the caller's organization
 * (aggregates only; the RPC layer never selects identifiers). Skeleton while
 * loading, per-card error state with Retry, empty states inside each block.
 */
export default function PopulationOverviewCard() {
  const overview = usePopulationOverview();
  const [range, setRange] = useState<Range>(14);
  const trend = useRiskTrend(range);

  const total = overview.data?.reduce((sum, entry) => sum + entry.count, 0) ?? 0;
  const loading = overview.loading;
  const errored = overview.error != null;

  const retry = useCallback(() => {
    overview.retry();
    trend.retry();
  }, [overview, trend]);

  return (
    <CardShell>
      {/* Header */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-theme-cream">
            <MsIcon name="group" className="text-[20px] text-theme-maroon" optical={22} />
          </span>
          <h2 className="text-base font-bold text-theme-ink">{POPULATION_OVERVIEW_TITLE}</h2>
        </div>
        {!loading && !errored ? (
          <span className="text-xs font-semibold text-theme-gray">
            {`Total patients ${total}`}
          </span>
        ) : null}
      </div>

      {loading && overview.data == null ? (
        <PopulationSkeleton />
      ) : errored && overview.data == null ? (
        <ErrorBlock message="Could not load the population overview." onRetry={retry} />
      ) : (
        <>
          {/* a) Four donuts (2x2 below xl inside the narrower card) */}
          <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
            {RISK_TIERS.map((tier) => (
              <RiskDonut
                key={tier}
                tier={tier}
                count={overview.data?.find((entry) => entry.tier === tier)?.count ?? 0}
                total={total}
              />
            ))}
          </div>

          {/* b) Trend line chart with range control */}
          <section aria-labelledby="risk-trend-title" className="mt-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3
                id="risk-trend-title"
                className="text-xs font-bold uppercase tracking-wide text-theme-gray"
              >
                Risk level trend (patients)
              </h3>
              <div role="group" aria-label="Trend range in days" className="flex gap-1">
                {RANGES.map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={range === value}
                    onClick={() => setRange(value)}
                    className={[
                      "min-h-8 rounded-full border px-2.5 text-[11px] font-semibold transition-colors",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-theme-maroon",
                      range === value
                        ? "border-theme-maroon bg-theme-maroon text-theme-white"
                        : "border-theme-line bg-white text-theme-gray hover:border-theme-maroon/40 hover:text-theme-ink",
                    ].join(" ")}
                  >
                    {value}d
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-2">
              {trend.loading && trend.data == null ? (
                <div className="h-44 animate-pulse rounded-control bg-theme-line/50" aria-hidden />
              ) : trend.error != null && trend.data == null ? (
                <ErrorBlock message="Could not load the risk trend." onRetry={trend.retry} />
              ) : (
                <Suspense
                  fallback={
                    <div className="h-44 animate-pulse rounded-control bg-theme-line/50" aria-hidden />
                  }
                >
                  <RiskTrendChart data={trend.data ?? []} />
                </Suspense>
              )}
            </div>
          </section>
        </>
      )}

      {/* c) Insights (live data, generated — unchecked state shows nothing bad) */}
      {overview.data != null ? <KeyInsights overview={overview.data} /> : null}
    </CardShell>
  );
}

/** Skeleton matching the card's final dimensions (no layout shift). */
function PopulationSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
        {RISK_TIERS.map((tier) => (
          <div key={tier} className="flex flex-col items-center gap-2">
            <span className="h-3.5 w-16 animate-pulse rounded-full bg-theme-line/60" />
            <span className="block h-16 w-16 animate-pulse rounded-full bg-theme-line/60" />
            <span className="block h-3 w-10 animate-pulse rounded-full bg-theme-line/60" />
          </div>
        ))}
      </div>
      <div className="h-44 animate-pulse rounded-control bg-theme-line/50" />
      <div className="flex flex-col gap-2">
        {[0, 1, 2].map((row) => (
          <span
            key={row}
            className="block h-4 animate-pulse rounded-control bg-theme-line/50"
            style={{ width: `${90 - row * 14}%` }}
          />
        ))}
      </div>
    </div>
  );
}

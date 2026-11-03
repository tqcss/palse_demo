import { Link } from "react-router-dom";

import MsIcon from "../MsIcon.tsx";
import { formatPercent } from "../../lib/percent.ts";
import type { RiskLevel } from "../../lib/patient.ts";
import type { TierCount } from "../../lib/population.ts";
import { RISK_TIERS, TIER_BG_CLASSES, TIER_LABELS } from "../../lib/tiers.ts";
import { INSIGHT_FOLLOWUPS } from "../../content/riskOverview.ts";

/**
 * "Key Insights" — up to three generated from the live aggregate (never
 * hardcoded): the dominant tier (ties reported as ties), moderate share when
 * applicable, and pending-assessment count. Every insight links to the
 * matching pre-filtered registry view; tier is conveyed by text, not color.
 */
export default function KeyInsights({ overview }: { overview: TierCount[] }) {
  const total = overview.reduce((sum, entry) => sum + entry.count, 0);

  if (total === 0) {
    return (
      <section aria-labelledby="key-insights-title" className="mt-5">
        <InsightHeading />
        <a
          href="#intake-workflow"
          className="mt-2 flex min-h-10 items-start gap-2.5 text-left text-sm text-theme-ink-soft underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-theme-maroon rounded-control"
        >
          <span
            aria-hidden
            className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-theme-cream"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-theme-maroon" />
          </span>
          <span>
            {INSIGHT_FOLLOWUPS.empty}
            <span className="ml-1 font-semibold text-theme-maroon">
              Start the intake workflow.
            </span>
          </span>
        </a>
      </section>
    );
  }

  const counts = new Map<RiskLevel, number>(RISK_TIERS.map((t) => [t, overview.find((e) => e.tier === t)?.count ?? 0]));

  const insights = generateInsights(counts);

  return (
    <section aria-labelledby="key-insights-title" className="mt-5">
      <div className="flex items-center justify-between">
        <InsightHeading />
        <Link
          to="/reports"
          className="inline-flex min-h-10 items-center gap-1 text-xs font-semibold text-theme-maroon underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-theme-maroon"
        >
          View details
          <MsIcon name="arrow_forward" className="text-[14px]" optical={16} />
        </Link>
      </div>
      <ul className="mt-2 flex flex-col gap-2">
        {insights.map((insight) => (
          <li key={insight.text}>
            <Link
              to={insight.href}
              className="flex min-h-10 items-start gap-2.5 text-left text-sm text-theme-ink-soft transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-theme-maroon"
            >
              <span
                aria-hidden
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${TIER_BG_CLASSES[insight.tier]}`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${dotClass(insight.tier)}`}
                />
              </span>
              <span className="leading-snug">
                {insight.text}
                {insight.followUp ? (
                  <span className="text-theme-gray"> {insight.followUp}</span>
                ) : null}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function InsightHeading() {
  return (
    <h3 id="key-insights-title" className="text-xs font-bold uppercase tracking-wide text-theme-gray">
      Key Insights
    </h3>
  );
}

function dotClass(tier: RiskLevel): string {
  const map: Record<RiskLevel, string> = {
    high: "bg-risk-high-fg",
    moderate: "bg-risk-moderate-fg",
    low: "bg-risk-low-fg",
    pending: "bg-risk-pending-fg",
  };
  return map[tier];
}

interface Insight {
  tier: RiskLevel;
  text: string;
  followUp?: string;
  href: string;
}

/** All sentences are live-computed from the aggregate; nothing hardcoded. */
function generateInsights(counts: Map<RiskLevel, number>): Insight[] {
  const results: Insight[] = [];
  const total = [...counts.values()].reduce((sum, c) => sum + c, 0);

  // 1) Dominant tier among non-empty ones; ties are reported as a tie.
  const nonEmpty = RISK_TIERS.filter((t) => counts.get(t)! > 0);
  const top = Math.max(...nonEmpty.map((t) => counts.get(t)!));
  const leaders = nonEmpty.filter((t) => counts.get(t) === top);
  if (leaders.length === 1) {
    const tier = leaders[0];
    results.push({
      tier,
      href: `/patients?risk=${tier}`,
      text: `${TIER_LABELS[tier]} cases are most common in your unit (${formatPercent(
        top,
        total,
      )}).`,
      followUp: INSIGHT_FOLLOWUPS.dominant,
    });
  } else {
    results.push({
      tier: leaders[0],
      href: `/patients?risk=${leaders[0]}`,
      text: `${leaders.map((t) => TIER_LABELS[t]).join(" and ")} are tied (${formatPercent(
        top,
        total,
      )} each).`,
      followUp: INSIGHT_FOLLOWUPS.dominant,
    });
  }

  // 2) Moderate share, when it isn't already the headline.
  const moderate = counts.get("moderate") ?? 0;
  if (moderate > 0 && !leaders.includes("moderate")) {
    results.push({
      tier: "moderate",
      href: "/patients?risk=moderate",
      text: `Moderate risk cases account for ${formatPercent(moderate, total)} of patients.`,
      followUp: INSIGHT_FOLLOWUPS.moderate,
    });
  }

  // 3) Pending count.
  const pending = counts.get("pending") ?? 0;
  if (pending > 0) {
    results.push({
      tier: "pending",
      href: "/patients?risk=pending",
      text: `${pending} ${pending === 1 ? "patient is" : "patients are"} pending risk assessment.`,
      followUp: INSIGHT_FOLLOWUPS.pending,
    });
  }

  return results;
}

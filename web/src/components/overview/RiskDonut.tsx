import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { formatPercent } from "../../lib/percent.ts";
import type { RiskLevel } from "../../lib/patient.ts";
import { TIER_COLOR_VARS, TIER_LABELS } from "../../lib/tiers.ts";

/**
 * One scan-guard ring of the Population Overview: count in the middle, the
 * tier label above and the share below. The whole ring links to the
 * pre-filtered registry (/patients?risk=<tier>).
 *
 * Never color-only: the tier is named in text right above the ring, and the
 * aria-label repeats label + count + percent.
 */
export default function RiskDonut({
  tier,
  count,
  total,
}: {
  tier: RiskLevel;
  count: number;
  total: number;
}) {
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const shareFraction = total > 0 ? Math.min(1, count / total) : 0;
  const targetOffset = circumference * (1 - shareFraction);

  // Fill animates on mount (~600ms; prefers-reduced-motion zeroes it).
  const [offset, setOffset] = useState(count === 0 ? circumference : targetOffset);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setOffset(targetOffset));
    return () => cancelAnimationFrame(frame);
  }, [targetOffset]);

  return (
    <Link
      to={`/patients?risk=${tier}`}
      className="group flex min-w-16 flex-col items-center gap-1 rounded-control p-1.5"
      role="img"
      aria-label={`${TIER_LABELS[tier]}: ${count} patients, ${formatPercent(count, total)} percent`}
    >
      <span className={`text-[11px] font-semibold ${tierTextClass(tier)}`}>{TIER_LABELS[tier]}</span>
      <span className="relative inline-flex" aria-hidden>
        <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90" focusable="false">
          {/* Muted track ring */}
          <circle
            cx={32}
            cy={32}
            r={radius}
            fill="none"
            stroke="var(--color-theme-line)"
            strokeWidth={7}
          />
          <circle
            cx={32}
            cy={32}
            r={radius}
            fill="none"
            stroke={TIER_COLOR_VARS[tier]}
            strokeWidth={7}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-[stroke-dashoffset] duration-600 ease-out"
          />
        </svg>
        <span className="absolute inset-0 grid place-items-center">
          <span className="text-sm font-bold text-theme-ink">{count}</span>
        </span>
      </span>
      <span className="text-[11px] text-theme-gray">{formatPercent(count, total)}</span>
    </Link>
  );
}

function tierTextClass(tier: RiskLevel): string {
  // Tier color on the label text, never as the only signal — text is present.
  const map: Record<RiskLevel, string> = {
    high: "text-risk-high-fg",
    moderate: "text-risk-moderate-fg",
    low: "text-risk-low-fg",
    pending: "text-risk-pending-fg",
  };
  return map[tier];
}

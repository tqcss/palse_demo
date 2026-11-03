import type { RiskLevel } from "./patient.ts";

/**
 * Single source of truth for the four risk tiers: display labels, badge/pill
 * styling and chart colors all derive from here, so badges, donuts, charts,
 * legends and insights always agree. RiskBadge is the canonical *renderer*
 * for pills; this module is the canonical *mapping*.
 */
export const RISK_TIERS = ["high", "moderate", "low", "pending"] as const;

export const TIER_LABELS: Record<RiskLevel, string> = {
  high: "High risk",
  moderate: "Moderate risk",
  low: "Low risk",
  pending: "Pending",
};

/** Singular form for correct pluralization in insights ("High risk case(s)"). */
export const TIER_LABEL_SINGULAR: Record<RiskLevel, string> = {
  high: "High risk case",
  moderate: "Moderate risk case",
  low: "Low risk case",
  pending: "Patient",
};

/** Tailwind classes for the badge family (bg / border fg / fg). */
export const TIER_PILL_CLASSES: Record<RiskLevel, string> = {
  high: "border-risk-high-fg/25 bg-risk-high-bg text-risk-high-fg",
  moderate: "border-risk-moderate-fg/30 bg-risk-moderate-bg text-risk-moderate-fg",
  low: "border-risk-low-fg/25 bg-risk-low-bg text-risk-low-fg",
  pending: "border-risk-pending-fg/30 bg-risk-pending-bg text-risk-pending-fg",
};

/** Light tint fill class (insight icon circles, tinted chips). */
export const TIER_BG_CLASSES: Record<RiskLevel, string> = {
  high: "bg-risk-high-bg",
  moderate: "bg-risk-moderate-bg",
  low: "bg-risk-low-bg",
  pending: "bg-risk-pending-bg",
};

/** Foreground class (dots, chart strokes via currentColor). */
export const TIER_FG_CLASSES: Record<RiskLevel, string> = {
  high: "text-risk-high-fg",
  moderate: "text-risk-moderate-fg",
  low: "text-risk-low-fg",
  pending: "text-risk-pending-fg",
};

/** CSS token for SVG paint (stroke/fill) — keeps charts on the token scale. */
export const TIER_COLOR_VARS: Record<RiskLevel, string> = {
  high: "var(--color-risk-high-fg)",
  moderate: "var(--color-risk-moderate-fg)",
  low: "var(--color-risk-low-fg)",
  pending: "var(--color-risk-pending-fg)",
};

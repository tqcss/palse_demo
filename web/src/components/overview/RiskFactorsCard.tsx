import { useState } from "react";

import MsIcon from "../MsIcon.tsx";
import BodyHologram from "./BodyHologram.tsx";
import CardShell from "./CardShell.tsx";
import {
  CITATIONS,
  RISK_FACTOR_CARDS,
  RISK_FACTORS_DISCLAIMER,
  RISK_FACTORS_SUBTITLE,
  RISK_FACTORS_TITLE,
  type RiskFactorCard,
} from "../../content/riskOverview.ts";

/**
 * "Sepsis Risk Factors" (left card): a column of evidence factor cards, the
 * interactive hologram with body systems in the middle (BodyHologram), and
 * the clinical-safety disclaimer. Static content — no data fetching, so this
 * card can never delay the intake workflow.
 */
export default function RiskFactorsCard() {
  return (
    <CardShell>
      <div className="mb-5 flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-theme-cream">
          <MsIcon
            name="ecg_heart"
            className="text-[20px] text-theme-maroon"
            optical={22}
          />
        </span>
        <div>
          <h2 className="text-base font-bold text-theme-ink">
            {RISK_FACTORS_TITLE}
          </h2>
          <p className="text-xs text-theme-gray">{RISK_FACTORS_SUBTITLE}</p>
        </div>
      </div>

      {/* Factor cards | hologram. Below md the hologram stacks under the list. */}
      <div className="grid items-center gap-5 md:grid-cols-[minmax(0,215px)_minmax(0,1fr)] md:gap-6">
        <ul className="flex flex-col gap-2.5" aria-label="Sepsis risk factors">
          {RISK_FACTOR_CARDS.map((factor) => (
            <li key={factor.id}>
              <FactorCard factor={factor} />
            </li>
          ))}
        </ul>

        <BodyHologram />
      </div>

      <footer className="mt-4 flex items-start gap-2 border-t border-theme-line pt-3 text-[11px] leading-relaxed text-theme-gray">
        <MsIcon
          name="info"
          className="mt-[1px] shrink-0 text-[14px] text-theme-maroon"
          optical={16}
        />
        {/* TODO(clinical-review): this disclaimer must stay visible. */}
        {RISK_FACTORS_DISCLAIMER}
      </footer>
    </CardShell>
  );
}

/* ------------------------------------------------------------------ */

function FactorCard({ factor }: { factor: RiskFactorCard }) {
  const [expanded, setExpanded] = useState(false);

  function toggleOrOpen(next: boolean) {
    setExpanded(next);
  }

  return (
    <button
      type="button"
      aria-expanded={expanded}
      onMouseEnter={() => toggleOrOpen(true)}
      onMouseLeave={() => toggleOrOpen(false)}
      onFocus={() => toggleOrOpen(true)}
      onBlur={() => toggleOrOpen(false)}
      onClick={() => setExpanded((value) => !value)}
      className={[
        "group w-full rounded-control border border-theme-line bg-white/80 px-3.5 py-2.5 text-left shadow-card transition-colors",
        "hover:border-theme-maroon/30 hover:bg-white",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-theme-maroon",
      ].join(" ")}
    >
      <div className="flex gap-2.5">
        {/* Tier-colored dot — the tier name always appears in text too. */}
        <span
          aria-hidden
          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TIER_DOT_CLASS[factor.accent]}`}
        />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-theme-ink">
            {factor.title}
          </div>
          <div className="text-xs text-theme-gray">{factor.detail}</div>
          {factor.subline ? (
            <div className="mt-1 text-xs font-semibold text-theme-ink-soft">
              {factor.subline}
            </div>
          ) : null}

          {/* Full citation on hover/focus/click; grid-rows animation keeps it
              smooth (reduced-motion zeroes the transition globally). */}
          <div
            className={[
              "grid transition-[grid-template-rows,opacity] duration-200 ease-out",
              expanded
                ? "[grid-template-rows:1fr] opacity-100"
                : "[grid-template-rows:0fr] opacity-0",
            ].join(" ")}
          >
            <div className="min-h-0 overflow-hidden"></div>
          </div>
        </div>
      </div>
    </button>
  );
}

const TIER_DOT_CLASS: Record<RiskFactorCard["accent"], string> = {
  high: "bg-risk-high-fg",
  moderate: "bg-risk-moderate-fg",
  low: "bg-risk-low-fg",
  pending: "bg-risk-pending-fg",
};

import { useState } from "react";

import MsIcon from "../MsIcon.tsx";
import RiskFactorsCard from "./RiskFactorsCard.tsx";
import PopulationOverviewCard from "./PopulationOverviewCard.tsx";

/**
 * Dashboard top section: "Sepsis Risk Factors" (7 cols at xl) + "Population
 * Overview" (5 cols) side by side; they stack below 1280px. Collapsible via a
 * small header toggle for clinicians who only need the intake workflow.
 * The preference persists per user in localStorage (fail-safe try/catch).
 *
 * Collapse animates via a 0fr/1fr grid-rows + opacity transition (~180ms);
 * the global prefers-reduced-motion rule turns the animation off, and the
 * header/toggle stay visible when collapsed.
 */

const HIDDEN_KEY = "palse.riskOverviewHidden";

function readHiddenPref(): boolean {
  try {
    return window.localStorage.getItem(HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
}

function writeHiddenPref(hidden: boolean): void {
  try {
    window.localStorage.setItem(HIDDEN_KEY, hidden ? "1" : "0");
  } catch {
    /* private mode / storage disabled — preference simply won't persist */
  }
}

export default function RiskOverviewSection() {
  const [hidden, setHidden] = useState<boolean>(readHiddenPref);

  function toggle(): void {
    setHidden((current) => {
      const next = !current;
      writeHiddenPref(next);
      return next;
    });
  }

  return (
    <section aria-label="Sepsis risk factors and population overview">
      {/* Section header: stays put when the body is collapsed. */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="flex items-center gap-2">
          <MsIcon
            name={hidden ? "expand_more" : "expand_less"}
            className="text-[18px] text-theme-maroon"
            optical={20}
            aria-hidden
          />
          <span className="text-xs font-semibold text-theme-gray">
            {hidden
              ? "Population & risk-factor overview is hidden"
              : "Population & risk-factor overview"}
          </span>
        </span>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!hidden}
          aria-controls="risk-overview-body"
          className="inline-flex min-h-8 items-center gap-1 rounded-full border border-theme-line bg-white px-3 py-1 text-xs font-semibold text-theme-ink transition-colors hover:border-theme-maroon/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-theme-maroon"
        >
          <MsIcon
            name={hidden ? "expand_more" : "expand_less"}
            className="text-[16px]"
            optical={18}
            aria-hidden
          />
          {hidden ? "Show overview" : "Hide overview"}
        </button>
      </div>

      {/* Collapsible body: 1fr/0fr grid trick keeps the animation height-aware
          without measuring DOM; `inert` removes collapsed content from the
          tab order and from assistive tech. */}
      <div
        id="risk-overview-body"
        aria-hidden={hidden}
        className={[
          "grid transition-[grid-template-rows,opacity] duration-200 ease-out",
          hidden
            ? "[grid-template-rows:0fr] opacity-0"
            : "[grid-template-rows:1fr] opacity-100",
        ].join(" ")}
      >
        <div className={hidden ? "min-h-0 overflow-hidden" : "min-h-0"}>
          <div
            inert={hidden || undefined}
            className="flex flex-col gap-6 xl:grid xl:grid-cols-12"
          >
            {/* Left card at 7 of 12 columns (xl ≥1280px); stacked below. */}
            <div className="xl:col-span-7">
              <RiskFactorsCard />
            </div>
            <div className="xl:col-span-5">
              <PopulationOverviewCard />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

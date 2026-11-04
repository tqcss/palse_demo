// TODO(clinical-review): verify wording and citations before release.
// Every clinical statement, statistic and citation shown in the Dashboard
// "Sepsis Risk Factors" + "Population Overview" section lives here so a
// reviewer has exactly one file to check. Copy below comes from the design
// mockup and is NOT verified; nothing was invented beyond what the mockup
// contained. Where the mockup gave no citation, the key is omitted and the
// UI renders no citation line at all.

export interface RiskFactorCard {
  id: string;
  title: string;
  detail: string;
  subline: string;
  /** "high" | "moderate" | "low" | "pending" drives the dot color only. */
  accent: "high" | "moderate" | "low" | "pending";
}

export const RISK_FACTOR_CARDS: readonly RiskFactorCard[] = [
  {
    id: "premature",
    title: "Premature Birth",
    detail: "< 37 weeks gestation",
    subline: "Increases risk by 2-4x",
    accent: "high",
  },
  {
    id: "birth-weight",
    title: "Low Birth Weight",
    detail: "< 2500 g",
    subline: "Associated with higher risk",
    accent: "moderate",
  },
  {
    id: "maternal",
    title: "Maternal Infection",
    detail: "Chorioamnionitis or fever",
    subline: "Significant risk factor",
    accent: "pending",
  },
  {
    id: "early-onset",
    title: "Early Onset (0-72h)",
    detail: "Higher risk than late onset",
    subline: "",
    accent: "low",
  },
];

export const RISK_FACTORS_DISCLAIMER =
  "These risk factors are based on published evidence and support early identification, not diagnosis.";

export const RISK_FACTORS_SUBTITLE = "Key indicators from the latest research";
export const POPULATION_OVERVIEW_TITLE = "Population Overview";

export const RISK_FACTORS_TITLE = "Sepsis Risk Factors";

/**
 * Insight one-liners under the main sentence. UI guidance only — no clinical
 * claims in the follow-ups except the pending line, which is mockup copy
 * (flagged for clinical review above).
 */
export const INSIGHT_FOLLOWUPS = {
  dominant: "Open the filtered list to review the latest scored assessments.",
  moderate: "Check the Monitoring page for this cohort's live readings.",
  pending: "Complete intake sections for accurate prediction.",
  empty: "No patients yet. Register a patient to see population insights.",
};

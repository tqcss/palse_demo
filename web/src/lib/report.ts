import type { Assessment, AssessmentStatus } from "./assessment.ts";
import { assessmentPrediction } from "./db.ts";
import type { Patient, RiskLevel } from "./patient.ts";

interface ReportStats {
  totalAssessments: number;
  completed: number;
  drafts: number;
  highRiskPatients: number;
  /** Patient counts per risk tier (drives the distribution chart). */
  distribution: Record<RiskLevel, number>;
  /** Assessments with an engine score stored (`prediction` JSONB). */
  totalScored: number;
  /** Engine-scored assessments whose label was HIGH RISK. */
  scoredHighRisk: number;
  /** Mean inference_ms across scored assessments (null when none scored). */
  avgResponseMs: number | null;
  /**
   * Accuracy = share of scored assessments whose predicted_eos agrees with the
   * patient's retroactive outcome (confirmed_eos ⇔ EOS predicted,
   * ruled_out ⇔ not predicted). null until outcomes are recorded.
   */
  accuracyPercent: number | null;
  /** Scored assessments that already carry a confirmed outcome. */
  confirmedScored: number;
}

export interface ReportEntry {
  id: string;
  /** Printed identity: uppercase initials ("—") + MRN — no stored names. */
  patientInitials: string;
  mrn: string | null;
  status: AssessmentStatus;
  createdAt: string;
  /** Engine risk label of the assessment, or null when unscored. */
  riskLabel: string | null;
  /** Engine probability (0-1), or null when unscored. */
  probability: number | null;
  /** Response time of the engine call, or null when unscored. */
  inferenceMs: number | null;
}

export function computeReportStats(
  assessments: Assessment[],
  patients: Patient[],
): ReportStats {
  const completed = assessments.filter(
    (assessment) => assessment.status === "complete",
  ).length;

  const distribution: Record<RiskLevel, number> = {
    low: 0,
    moderate: 0,
    high: 0,
    pending: 0,
  };
  for (const patient of patients) {
    distribution[patient.riskLevel] += 1;
  }

  const scored = assessments.filter(
    (assessment) => assessment.prediction != null,
  );
  const scoredHighRisk = scored.filter(
    (assessment) => assessment.prediction?.risk_label === "HIGH RISK",
  ).length;

  const responseTimes = scored
    .map((assessment) => assessment.prediction?.inference_ms ?? null)
    .filter((ms): ms is number => ms != null && ms >= 0);
  const avgResponseMs =
    responseTimes.length === 0
      ? null
      : responseTimes.reduce((sum, ms) => sum + ms, 0) / responseTimes.length;

  const outcomeByPatientId = new Map(
    patients.map((patient) => [patient.id, patient.outcome ?? "pending"]),
  );
  let agreed = 0;
  let confirmedScored = 0;
  for (const assessment of scored) {
    const prediction = assessmentPrediction(assessment);
    const outcome = outcomeByPatientId.get(assessment.patientId);
    if (prediction == null || outcome == null || outcome === "pending") continue;
    confirmedScored += 1;
    if (
      (prediction.predictedEos && outcome === "confirmed_eos") ||
      (!prediction.predictedEos && outcome === "ruled_out")
    ) {
      agreed += 1;
    }
  }
  const accuracyPercent =
    confirmedScored === 0 ? null : Math.round((agreed / confirmedScored) * 100);

  return {
    totalAssessments: assessments.length,
    completed,
    drafts: assessments.length - completed,
    highRiskPatients: distribution.high,
    distribution,
    totalScored: scored.length,
    scoredHighRisk,
    avgResponseMs,
    accuracyPercent,
    confirmedScored,
  };
}

/**
 * Self-contained printable HTML summary of the current registry state —
 * downloaded client-side with no canvas/html2canvas whatsoever.
 *
 * Standalone document: it cannot resolve the app's CSS variables, so the
 * brand palette is duplicated here (audited exception — see
 * scripts/check-tokens.mjs and DESIGN_SYSTEM.md §1).
 */
export function buildReportHtml(
  stats: ReportStats,
  entries: ReportEntry[],
  options: { clinicName?: string } = {},
): string {
  const generatedAt = new Intl.DateTimeFormat(undefined, {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date());
  const clinicName = options.clinicName ?? "Pal.se Clinical Team";

  const rows = entries
    .map(
      (entry) => `<tr>
        <td class="mono">${escapeHtml(entry.id.slice(0, 8))}</td>
        <td>
          <div class="patient">${escapeHtml(entry.patientInitials)}</div>
          ${entry.mrn != null ? `<div class="mrn">MRN ${escapeHtml(entry.mrn)}</div>` : ""}
        </td>
        <td><span class="pill ${entry.status}">${entry.status === "complete" ? "Completed" : "Draft"}</span></td>
        <td>${
          entry.riskLabel != null
            ? `<span class="riskline"><span class="dot ${riskClass(entry.riskLabel)}"></span>${escapeHtml(entry.riskLabel)}<span class="pct">${entry.probability != null ? (entry.probability * 100).toFixed(1) : "?"}%</span></span>`
            : `<span class="placeholder-note">Not scored</span>`
        }</td>
        <td class="nowrap">${escapeHtml(dateLabel(entry.createdAt))}</td>
      </tr>`,
    )
    .join("");

  const distribution = (["high", "moderate", "low", "pending"] as const)
    .map((tier) => {
      const count = stats.distribution[tier];
      const pct = stats.totalAssessments > 0 ? count / stats.totalAssessments : 0;
      return `<div class="bar-row">
        <span class="bar-label">${tier === "pending" ? "Pending" : `${tier[0].toUpperCase()}${tier.slice(1)} risk`}</span>
        <span class="bar-track"><span class="bar-fill ${tier}" style="width:${Math.round(pct * 100)}%"></span></span>
        <span class="bar-count">${count}</span>
      </div>`;
    })
    .join("");

  const emptyDistribution = Object.values(stats.distribution).every(
    (n) => n === 0,
  );

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Pal.se — Neonatal Sepsis Report — ${escapeHtml(new Date().toLocaleDateString())}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    font-family: "Inter", -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    margin: 0; background: #f3f2ee; color: #0f1720;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .page { max-width: 860px; margin: 0 auto; padding: 40px 24px 48px; }

  /* Header band */
  .report-header {
    background: #5b1616; color: #fbf8f5; border-radius: 16px;
    padding: 30px 34px; display: flex; align-items: flex-start; justify-content: space-between; gap: 20px;
  }
  .brand { display: flex; align-items: center; gap: 12px; }
  .brand-mark {
    width: 38px; height: 38px; border-radius: 10px; background: rgb(251 248 245 / 14%);
    display: grid; place-items: center; font-size: 19px; font-weight: 800; letter-spacing: -0.5px;
  }
  .brand-name { font-size: 20px; font-weight: 800; letter-spacing: 0.2px; margin: 0; }
  .brand-sub { font-size: 12.5px; margin: 2px 0 0; opacity: 0.75; }
  .report-meta { text-align: right; font-size: 12px; line-height: 1.7; opacity: 0.82; }
  .report-meta strong { font-size: 13px; }

  /* Card sections */
  section.card {
    background: #fbf8f5; border: 1px solid #e8e3dd; border-radius: 16px;
    padding: 26px 30px; margin-top: 18px; box-shadow: 0 1px 2px rgb(91 22 22 / 5%);
  }
  .eyebrow { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #9a8f8c; margin: 0 0 4px; }
  h2 { font-size: 17px; font-weight: 700; margin: 0 0 18px; color: #0f1720; }

  /* KPI grid */
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
  .stat { border: 1px solid #e8e3dd; border-radius: 12px; padding: 15px 17px; background: #fff; position: relative; overflow: hidden; }
  .stat::before { content: ""; position: absolute; inset: 0 auto 0 0; width: 4px; background: #5b1616; }
  .stat.tier::before { background: var(--tier, #5b1616); }
  .stat .label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #9a8f8c; }
  .stat .value { font-size: 30px; font-weight: 800; margin-top: 5px; color: #0f1720; }
  .stat .sub { font-size: 12px; color: #9a8f8c; margin-top: 3px; }

  /* Risk distribution bars */
  .bars { display: flex; flex-direction: column; gap: 11px; }
  .bar-row { display: grid; grid-template-columns: 112px 1fr 36px; align-items: center; gap: 12px; }
  .bar-label { font-size: 12.5px; font-weight: 600; color: #2b2b2b; }
  .bar-track { height: 10px; border-radius: 999px; background: #efece6; overflow: hidden; }
  .bar-fill { display: block; height: 100%; border-radius: 999px; min-width: 6px; }
  .bar-fill.high { background: #b42318; }
  .bar-fill.moderate { background: #9a5b00; }
  .bar-fill.low { background: #1f7a45; }
  .bar-fill.pending { background: #9a8f8c; }
  .bar-count { font-size: 13px; font-weight: 700; text-align: right; }

  /* Assessments table */
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #9a8f8c; border-bottom: 1px solid #e8e3dd; padding: 8px 10px; }
  td { border-bottom: 1px solid #f0ece6; padding: 10px; vertical-align: top; }
  tr:last-child td { border-bottom: 0; }
  .patient { font-weight: 700; letter-spacing: 0.04em; }
  .mrn { font-size: 11px; color: #9a8f8c; margin-top: 2px; }
  .num { font-weight: 700; }
  .mono { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 12px; color: #57504d; }
  .nowrap { white-space: nowrap; color: #57504d; }
  .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; }
  .dot.high { background: #b42318; }
  .dot.moderate { background: #9a5b00; }
  .dot.low { background: #1f7a45; }
  .riskline { display: inline-flex; align-items: center; gap: 6px; }
  .pct { color: #9a8f8c; font-size: 12px; }
  .pill { font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 999px; border: 1px solid; }
  .pill.complete { color: #1f7a45; background: #e8f5ee; border-color: #cfe8d9; }
  .pill.draft { color: #9a5b00; background: #fff3cf; border-color: #f2e3b4; }
  .placeholder-note { font-size: 12.5px; color: #9a8f8c; }

  /* Footer */
  footer { text-align: center; font-size: 11px; color: #9a8f8c; padding: 22px 20px 8px; line-height: 1.6; }

  .empty-note { padding: 18px 4px; }

  @page { margin: 14mm; }
  @media print {
    body { background: #fff; }
    .page { margin: 0; padding: 0; max-width: none; }
    section.card, .report-header { box-shadow: none; break-inside: avoid; }
    tr, .bar-row, .stat { break-inside: avoid; }
  }
</style>
</head>
<body>
  <div class="page">
    <header class="report-header">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true">P</span>
        <div>
          <h1 class="brand-name">Pal.se</h1>
          <p class="brand-sub">Early-Onset Neonatal Sepsis Prediction</p>
        </div>
      </div>
      <div class="report-meta">
        <strong>Population &amp; Outcomes Report</strong><br />
        ${escapeHtml(clinicName)}<br />
        Generated ${escapeHtml(generatedAt)}
      </div>
    </header>

    <section class="card">
      <p class="eyebrow">Summary</p>
      <h2>Registry volume &amp; engine activity</h2>
      <div class="stats">
        <div class="stat" style="--tier:#5b1616"><div class="label">Total assessments</div><div class="value">${stats.totalAssessments}</div><div class="sub">${stats.completed} completed · ${stats.drafts} draft${stats.drafts === 1 ? "" : "s"} · ${stats.totalScored} scored</div></div>
        <div class="stat tier" style="--tier:#b42318"><div class="label">High-risk cases</div><div class="value">${stats.highRiskPatients}</div><div class="sub">${stats.scoredHighRisk} engine-scored HIGH RISK</div></div>
        <div class="stat tier" style="--tier:#1f7a45"><div class="label">Accuracy rate</div><div class="value">${stats.accuracyPercent != null ? `${stats.accuracyPercent}%` : "—"}</div><div class="sub">${stats.accuracyPercent != null ? `${stats.confirmedScored} confirmed outcome${stats.confirmedScored === 1 ? "" : "s"}` : "Pending confirmed outcomes"}</div></div>
        <div class="stat tier" style="--tier:#9a5b00"><div class="label">Avg response time</div><div class="value">${stats.avgResponseMs != null ? (Math.round(stats.avgResponseMs) >= 1000 ? `${(stats.avgResponseMs / 1000).toFixed(1)} s` : `${Math.round(stats.avgResponseMs)} ms`) : "—"}</div><div class="sub">${stats.avgResponseMs != null ? "Engine inference latency" : "Pending engine scores"}</div></div>
      </div>
    </section>

    <section class="card">
      <p class="eyebrow">Distribution</p>
      <h2>Risk tiers across the registry</h2>
      ${emptyDistribution
        ? `<p class="placeholder-note empty-note">No patients registered yet — the distribution fills as the registry grows.</p>`
        : `<div class="bars">${distribution}</div>`}
    </section>

    <section class="card">
      <p class="eyebrow">Activity</p>
      <h2>Recent assessments</h2>
      ${entries.length === 0
        ? `<p class="placeholder-note empty-note">No assessments recorded yet — run the first one from the dashboard.</p>`
        : `<table>
            <thead><tr><th>Assessment</th><th>Patient</th><th>Status</th><th>Engine result</th><th>Created</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>`}
    </section>

    <footer>
      Patient identity is minimized (initials + medical record number).
      Screening support generated by the Pal.se prediction engine — not a clinical diagnosis.<br />
      Confidential — for authorized clinical use only.
    </footer>
  </div>
</body>
</html>`;
}

function riskClass(riskLabel: string): string {
  const tier = riskLabel.split(" ")[0].toLowerCase();
  if (tier === "high") return "high";
  if (tier === "low") return "low";
  return "moderate";
}

/** Locale "medium" date stamp for table cells. */
function dateLabel(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(parsed);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Triggers a browser download; returns the suggested file name. */
export function downloadReport(html: string, fileName: string): string {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return fileName;
}

import type { AssessmentSections, MaternalSection, NeonatalSection } from "./assessment.ts";
import type { PredictionResult } from "./ml.ts";

/**
 * Client-side PDF report for a freshly scored assessment (jsPDF, lazily
 * imported on click so the library never loads during normal browsing).
 * Data stays entirely in the browser — the engine is never involved.
 */

export interface ScoredReportContext {
  patientId: string;
  patientName: string;
  mrn: string | null;
  /** ISO timestamp of the scoring moment. */
  scoredAt: string;
  /** The exact wizard inputs as scored (owned snapshot, post-reset safe). */
  sections: AssessmentSections;
  result: PredictionResult;
}

type JsPdfDoc = import("jspdf").jsPDF & {
  lastAutoTable?: { finalY: number };
};

const NEONATAL_SIGNS: ReadonlyArray<readonly [string, keyof NeonatalSection]> = [
  ["Poor feeding", "poorFeeding"],
  ["Lethargy", "lethargy"],
  ["Convulsions", "convulsions"],
  ["Respiratory distress", "respiratoryDistress"],
  ["Jaundice", "jaundice"],
  ["Bulging fontanelle", "bulgingFontanelle"],
];

const TREATMENTS: ReadonlyArray<readonly [string, string]> = [
  ["Central venous line", "centralVenousLine"],
  ["Umbilical arterial line", "umbilicalArterialLine"],
  ["Inotrope", "inotrope"],
  ["Intubated", "intubated"],
];

const COMORBIDITIES: ReadonlyArray<readonly [string, string]> = [
  ["Necrotizing enterocolitis", "necrotizingEnterocolitis"],
  ["Non-cardiac surgical disease", "nonCardiacSurgicalDisease"],
  ["Chronic lung disease", "chronicLungDisease"],
  ["Congenital cardiac disease", "congenitalCardiacDisease"],
];

const MAROON: [number, number, number] = [91, 22, 22];
const GRAY: [number, number, number] = [122, 112, 110];

const TIER_COLORS: Record<string, [number, number, number]> = {
  HIGH: [180, 35, 24],
  MODERATE: [154, 91, 0],
  LOW: [31, 122, 69],
};

function yesNo(value: boolean | null): string {
  return value == null ? "—" : value ? "Yes" : "No";
}

function onOff(value: boolean): string {
  return value ? "Present" : "Absent";
}

function dash(value: string): string {
  const trimmed = value.trim();
  return trimmed === "" ? "—" : trimmed;
}

/** "2026-10-22T09:15:00Z" → "22 Oct 2026, 09:15 (local)"-style text. */
function fmtDate(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

/** Per-section key/value rows for the report tables. */
function sectionRows(sections: AssessmentSections): [string, [string, string][]][] {
  const maternal: MaternalSection = sections.maternal;
  const neonatal = sections.neonatal;
  const vitals = sections.vitals;
  const laboratory = sections.laboratory;

  return [
    [
      "Patient & perinatal",
      [
        ["Sex", sections.demographic.sex == null ? "—" : titleCase(sections.demographic.sex)],
        ["Gestational age", dash(sections.demographic.gestationalAgeWeeks) === "—" ? "—" : `${sections.demographic.gestationalAgeWeeks.trim()} weeks`],
        ["Birth weight", dash(sections.demographic.birthWeightGrams) === "—" ? "—" : `${sections.demographic.birthWeightGrams.trim()} g`],
        [
          "Delivery mode",
          sections.demographic.deliveryMode == null
            ? "—"
            : titleCase(sections.demographic.deliveryMode),
        ],
        ["Multiple birth", yesNo(sections.demographic.multipleBirth)],
      ],
    ],
    [
      "Maternal factors",
      [
        ["Maternal age", dash(maternal.maternalAge)],
        ["ANC visits ≥ 4", yesNo(maternal.ancVisitsFourPlus)],
        ["PROM > 18h", yesNo(maternal.promOver18h)],
        ["Fever ≥ 38°C", yesNo(maternal.feverAtLeast38C)],
        ["UTI during pregnancy", yesNo(maternal.utiDuringPregnancy)],
        ["HIV positive", yesNo(maternal.hivPositive)],
      ],
    ],
    [
      "Neonatal clinical signs",
      [
        ["Age at admission", dash(neonatal.ageAtAdmissionHours) === "—" ? "—" : `${neonatal.ageAtAdmissionHours.trim()} h`],
        ["APGAR 1 min", dash(neonatal.apgarOneMinute)],
        ["APGAR 5 min", dash(neonatal.apgarFiveMinutes)],
        ["APGAR 10 min", dash(neonatal.apgarTenMinutes)],
        ...NEONATAL_SIGNS.map(
          ([label, key]) => [label, onOff(neonatal[key] as boolean)] as [string, string],
        ),
      ],
    ],
    [
      "Physiological (vitals)",
      [
        ["Heart rate", dash(vitals.heartRateBpm) === "—" ? "—" : `${vitals.heartRateBpm.trim()} bpm`],
        ["Temperature", dash(vitals.temperatureC) === "—" ? "—" : `${vitals.temperatureC.trim()} °C`],
        ["Blood pressure", dash(vitals.bloodPressure)],
        ["O2 saturation", dash(vitals.oxygenSaturationPct) === "—" ? "—" : `${vitals.oxygenSaturationPct.trim()} %`],
        ["Respiratory rate", dash(vitals.respiratoryRatePerMin) === "—" ? "—" : `${vitals.respiratoryRatePerMin.trim()} /min`],
      ],
    ],
    [
      "Laboratory results",
      [
        ["CRP", dash(laboratory.crpMgL) === "—" ? "—" : `${laboratory.crpMgL.trim()} mg/L`],
        ["WBC count", dash(laboratory.wbcCount) === "—" ? "—" : `${laboratory.wbcCount.trim()} /µL`],
        ["Platelets", dash(laboratory.plateletCount) === "—" ? "—" : `${laboratory.plateletCount.trim()} /µL`],
      ],
    ],
    [
      "Current treatment",
      TREATMENTS.map(
        ([label, key]) =>
          [label, onOff(Boolean(sections.treatment[key as keyof AssessmentSections["treatment"]]))] as [string, string],
      ),
    ],
    [
      "Comorbidities",
      COMORBIDITIES.map(
        ([label, key]) =>
          [label, onOff(Boolean(sections.comorbidities[key as keyof AssessmentSections["comorbidities"]]))] as [string, string],
      ),
    ],
  ];
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function safeFileSegment(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "patient";
}

/** Builds and downloads the PDF. Throws on library/render failure; callers
 * surface a friendly message. */
export async function downloadScoredReport(ctx: ScoredReportContext): Promise<void> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const doc = new jsPDF({ unit: "mm", format: "a4" }) as JsPdfDoc;
  const PAGE_W = doc.internal.pageSize.getWidth();
  const MARGIN = 16;
  const contentW = PAGE_W - MARGIN * 2;
  const tier = ctx.result.riskLabel.split(" ")[0];
  const tierColor = TIER_COLORS[tier] ?? TIER_COLORS.MODERATE;

  /* Header */
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...MAROON);
  doc.text("Pal.se", MARGIN, 20);
  doc.setFontSize(13);
  doc.setTextColor(20, 20, 20);
  doc.text("Neonatal Sepsis Risk Report", MARGIN, 27);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...GRAY);
  doc.text(`Scored ${fmtDate(ctx.scoredAt)}`, MARGIN, 32.5);
  doc.setDrawColor(...MAROON);
  doc.setLineWidth(0.6);
  doc.line(MARGIN, 35.5, PAGE_W - MARGIN, 35.5);

  /* Patient identification line */
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(20, 20, 20);
  doc.text(ctx.patientName, MARGIN, 42);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(...GRAY);
  doc.text(
    ctx.mrn ? `MRN ${ctx.mrn}` : `Patient ID ${ctx.patientId}`,
    PAGE_W - MARGIN,
    42,
    { align: "right" },
  );

  /* Result banner */
  let y = 47;
  doc.setFillColor(tierColor[0], tierColor[1], tierColor[2]);
  doc.roundedRect(MARGIN, y, contentW, 16, 3, 3, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(255, 255, 255);
  doc.text(ctx.result.riskLabel, MARGIN + 5, y + 10);
  doc.setFontSize(16);
  doc.text(`${ctx.result.probabilityPercent}%`, PAGE_W - MARGIN - 5, y + 10.5, {
    align: "right",
  });
  y += 22;

  /* Section tables */
  const rows = sectionRows(ctx.sections);
  for (const [title, pairs] of rows) {
    autoTable(doc, {
      startY: y,
      head: [[title, ""]],
      body: pairs.map(([k, v]) => [k, v]),
      theme: "grid",
      margin: { left: MARGIN, right: MARGIN },
      tableWidth: contentW,
      styles: { fontSize: 9, cellPadding: 1.8, textColor: [30, 30, 30] },
      headStyles: { fillColor: MAROON, fontSize: 9.5, halign: "left" },
      columnStyles: {
        0: { cellWidth: contentW * 0.55, fontStyle: "normal" },
        1: { halign: "right" },
      },
    });
    y = (doc.lastAutoTable?.finalY ?? y) + 7;
    if (y > doc.internal.pageSize.getHeight() - 30) {
      doc.addPage();
      y = 20;
    }
  }

  /* Footer + page numbers */
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    const height = doc.internal.pageSize.getHeight();
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(...GRAY);
    doc.text(
      "Screening support generated by the Pal.se prediction engine — not a clinical diagnosis.",
      MARGIN,
      height - 10,
    );
    doc.setFont("helvetica", "normal");
    doc.text(`Page ${page} of ${pages}`, PAGE_W - MARGIN, height - 10, {
      align: "right",
    });
  }

  const stamp = ctx.scoredAt.slice(0, 16).replace(/[-:T]/g, "");
  doc.save(`palse-report-${safeFileSegment(ctx.mrn ?? ctx.patientId)}-${stamp}.pdf`);
}

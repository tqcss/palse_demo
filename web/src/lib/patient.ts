export type Sex = "female" | "male" | null;
export type RiskLevel = "pending" | "low" | "moderate" | "high";

/** Retroactive sepsis confirmation used by reports accuracy stats. */
export type Outcome = "pending" | "confirmed_eos" | "ruled_out";

/** Shape of `public.patients` rows as exposed to the app. */
export interface Patient {
  id: string;
  createdBy: string;
  mrn: string | null;
  /**
   * Optional 1-4 character initials (identity is carried by the MRN — see
   * migrations/20261104110000_patient_initials.sql).
   */
  initials: string | null;
  sex: Sex;
  /** ISO date string. */
  dateOfBirth: string | null;
  gestationalAgeWeeks: number | null;
  birthWeightGrams: number | null;
  deliveryMode: "vaginal" | "cesarean" | null;
  riskLevel: RiskLevel;
  outcome: Outcome;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Uppercased initials for display; "—" when the patient has none. */
export function formatPatientInitials(patient: Patient): string {
  const value = patient.initials?.trim();
  if (value == null || value === "") return "—";
  return value.toUpperCase();
}

/**
 * Inline identity label for sentences ("U0 · MRN 0102034") where a full name
 * used to be shown. Keeps the registry privacy-minimized: initials + MRN only.
 */
export function formatPatientLabel(patient: Patient): string {
  const mrn = patient.mrn != null && patient.mrn.trim() !== "" ? patient.mrn : null;
  return [formatPatientInitials(patient), mrn != null ? `MRN ${mrn}` : null]
    .filter(Boolean)
    .join(" · ");
}

/** Short human date for table cells and record stamps (e.g. "Jan 24, 2026"). */
export function formatDateLabel(iso: string | null): string {
  if (iso == null || iso === "") return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Human date + time for "recorded at" stamps (e.g. "Oct 22, 3:41 PM"). */
export function formatDateTimeLabel(iso: string | null): string {
  if (iso == null || iso === "") return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

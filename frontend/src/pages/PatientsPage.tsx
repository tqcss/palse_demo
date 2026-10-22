import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import FormInput from "../components/FormInput.tsx";
import Modal from "../components/Modal.tsx";
import Notice from "../components/Notice.tsx";
import Panel from "../components/Panel.tsx";
import PatientModal from "../components/PatientModal.tsx";
import RiskBadge from "../components/RiskBadge.tsx";
import {
  deletePatient,
  latestEngineScores,
  listAssessments,
  listPatients,
  listVitalObservations,
  riskLevelFromLabel,
  type EngineScoreStamp,
} from "../lib/db.ts";
import { engineConfigured } from "../lib/ml.ts";
import { guide } from "../lib/authErrors.ts";
import type { RiskLevel } from "../lib/patient.ts";
import {
  formatDateLabel,
  formatPatientName,
} from "../lib/patient.ts";
import type { Patient } from "../lib/patient.ts";
import { usePageTitle } from "../hooks/usePageTitle.ts";

type Filter = RiskLevel | "all";

const FILTER_ORDER: ReadonlyArray<Filter> = [
  "all",
  "high",
  "moderate",
  "low",
  "pending",
];

function matches(filter: Filter, patient: Patient): boolean {
  return filter === "all" || patient.riskLevel === filter;
}

export default function PatientsPage() {
  usePageTitle("Patients");

  const [patients, setPatients] = useState<Patient[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [deleting, setDeleting] = useState<Patient | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  /** Records-to-be-removed counts for the delete dialog (null = unknown). */
  const [deleteCounts, setDeleteCounts] = useState<{
    assessments: number | null;
    observations: number | null;
  } | null>(null);
  /** Confirmation token typed by the user (MRN, or DELETE without an MRN). */
  const [deleteConfirm, setDeleteConfirm] = useState("");
  /** Newest engine score per patient (provenance captions). */
  const [engineScores, setEngineScores] = useState<
    Record<string, EngineScoreStamp> | null
  >(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const countsLoadRef = useRef(0);

  useEffect(() => {
    let active = true;
    latestEngineScores()
      .then((scores) => {
        if (active) setEngineScores(scores);
      })
      .catch((scoresError: unknown) => {
        // Provenance captions are cosmetic; the registry still loads.
        console.error("[palse] engine score lookup failed", scoresError);
        if (active) setEngineScores({});
      });
    return () => {
      active = false;
    };
  }, []);

  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    setLoadError(null);
    listPatients()
      .then((rows) => {
        if (active) setPatients(rows);
      })
      .catch((error: unknown) => {
        if (active) {
          setPatients([]);
          setLoadError(guide(error, "Could not load the patient registry."));
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const counts = useMemo(() => {
    const result: Record<Filter, number> = { all: 0, high: 0, moderate: 0, low: 0, pending: 0 };
    for (const patient of patients ?? []) {
      result.all += 1;
      result[patient.riskLevel] += 1;
    }
    return result;
  }, [patients]);

  const visible = useMemo(
    () => (patients ?? []).filter((patient) => matches(filter, patient)),
    [patients, filter],
  );

  function patientAdded(patient: Patient) {
    setPatients((prev) => [patient, ...(prev ?? [])]);
    setAddOpen(false);
  }

  /** Opens the delete dialog and resolves the records-to-be-removed counts
   * that make its warning concrete (and feed the audit trail). */
  function startDelete(patient: Patient) {
    setDeleting(patient);
    setDeleteCounts(null);
    setDeleteConfirm("");
    setActionError(null);
    const loadId = countsLoadRef.current + 1;
    countsLoadRef.current = loadId;
    void (async () => {
      try {
        const [assessments, observations] = await Promise.all([
          listAssessments(patient.id),
          listVitalObservations(patient.id),
        ]);
        // countsLoadRef guards against a stale response after reopening the
        // dialog for a different patient while this fetch is in flight.
        if (countsLoadRef.current === loadId) {
          setDeleteCounts({
            assessments: assessments.length,
            observations: observations.length,
          });
        }
      } catch (countError) {
        console.error("[palse] delete preview counts failed", countError);
        if (countsLoadRef.current === loadId) {
          setDeleteCounts({ assessments: null, observations: null });
        }
      }
    })();
  }

  /** The token the user must type to confirm deletion: the MRN when one is
   * on record, otherwise the explicit word DELETE. */
  function deleteConfirmationToken(deleting: Patient): string {
    const mrn = deleting.mrn?.trim();
    return mrn != null && mrn !== "" ? mrn : "DELETE";
  }

  async function confirmDelete() {
    if (deleting == null || deletePending) return;
    setDeletePending(true);
    try {
      await deletePatient(deleting.id, {
        assessments: deleteCounts?.assessments ?? null,
        observations: deleteCounts?.observations ?? null,
      });
      setPatients((prev) => prev?.filter((p) => p.id !== deleting.id) ?? null);
      setDeleting(null);
    } catch (error) {
      console.error("[palse] patient delete failed", error);
      setActionError(guide(error, "Could not delete the patient. Please try again."));
      setDeleting(null);
    } finally {
      setDeletePending(false);
    }
  }

  const loading = patients === null;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-bold uppercase tracking-wide text-theme-maroon">
            Clinical registry
          </p>
          <h1 className="text-2xl font-bold text-theme-ink">Patients</h1>
          <p className="text-sm text-theme-gray">
            {loading
              ? "Loading registry…"
              : engineConfigured()
                ? `${counts.all} registered ${counts.all === 1 ? "patient" : "patients"} · risk levels are set by the prediction engine on completion and can be overridden manually`
                : `${counts.all} registered ${counts.all === 1 ? "patient" : "patients"} · risk levels are set manually until the prediction engine is configured`}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="rounded-lg bg-theme-maroon px-4 py-2.5 text-sm font-semibold text-theme-white transition-colors hover:bg-theme-maroon-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-theme-maroon"
        >
          ＋ Add patient
        </button>
      </header>

      {loadError ? <Notice tone="danger">{loadError}</Notice> : null}
      {actionError ? <Notice tone="danger">{actionError}</Notice> : null}

      {/* Filter pills with counts */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by risk level">
        {FILTER_ORDER.map((tier) => {
          const active = filter === tier;
          const label =
            tier === "all"
              ? "All"
              : tier === "pending"
                ? "Pending"
                : `${tier[0].toUpperCase()}${tier.slice(1)}`;
          return (
            <button
              key={tier}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(tier)}
              className={[
                "rounded-full border px-4 py-1.5 text-xs font-semibold transition-colors duration-150",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-theme-maroon",
                active
                  ? "border-theme-maroon bg-theme-maroon text-theme-white"
                  : "border-theme-line bg-white text-theme-gray hover:border-theme-maroon/40 hover:text-theme-ink",
              ].join(" ")}
            >
              {label}
              <span className={active ? "ml-1.5 opacity-80" : "ml-1.5 text-theme-placeholder"}>
                {counts[tier]}
              </span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <LoadingList />
      ) : visible.length === 0 ? (
        <EmptyList
          isRegistryEmpty={(patients ?? []).length === 0}
          filter={filter}
          onAdd={() => setAddOpen(true)}
        />
      ) : (
        <PatientTable
          patients={visible}
          engineScores={engineScores}
          onEdit={(id) => void navigate(`/patients/${id}/edit`)}
          onMonitor={(id) => void navigate(`/monitor?patient=${id}`)}
          onDelete={startDelete}
        />
      )}

      {addOpen ? (
        <PatientModal
          mode="full"
          title="Register a new patient"
          onClose={() => setAddOpen(false)}
          onCreated={patientAdded}
        />
      ) : null}

      {deleting != null ? (
        <Modal title="Delete patient" onClose={() => setDeleting(null)}>
          <div className="flex flex-col gap-5">
            <p className="text-sm text-theme-ink-soft">
              Delete <strong>{formatPatientName(deleting)}</strong>
              {deleting.mrn ? ` (MRN ${deleting.mrn})` : ""}?
            </p>
            <p className="text-sm text-theme-ink-soft">
              {deleteCounts == null
                ? "Counting the records that will be removed…"
                : deleteCounts.assessments === null &&
                    deleteCounts.observations === null
                  ? "All registry entries for this patient will be removed from the registry view. This cannot be undone."
                  : `This removes ${deleteCounts.assessments ?? 0} ${deleteCounts.assessments === 1 ? "assessment" : "assessments"} and ${deleteCounts.observations ?? 0} ${deleteCounts.observations === 1 ? "vital reading" : "vital readings"}. The record is kept as an audit entry but no longer appears in the registry. This cannot be undone.`}
            </p>
            <FormInput
              id="delete-confirm"
              label={`Type ${deleteConfirmationToken(deleting)} to confirm`}
              placeholder={deleteConfirmationToken(deleting)}
              value={deleteConfirm}
              onChange={(event) => setDeleteConfirm(event.target.value)}
            />
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleting(null)}
                className="rounded-lg border border-theme-line px-4 py-2 text-sm font-semibold text-theme-ink transition-colors hover:bg-theme-light-gray"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  deletePending ||
                  deleteConfirm.trim().toUpperCase() !==
                    deleteConfirmationToken(deleting).toUpperCase()
                }
                aria-busy={deletePending}
                onClick={() => void confirmDelete()}
                className="flex items-center gap-2 rounded-lg bg-risk-high-fg px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-risk-high-fg disabled:opacity-60"
              >
                {deletePending ? (
                  <span
                    aria-hidden
                    className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                  />
                ) : null}
                Delete patient
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

/** Where the patient's risk level came from: a live engine score (when the
 * label still agrees with the latest scoring) or a manual registry override. */
function riskProvenance(
  patient: Patient,
  engineScores: Record<string, EngineScoreStamp> | null,
): { label: string; engine: boolean } {
  if (patient.riskLevel === "pending") {
    return { label: "Awaiting scoring", engine: false };
  }
  const score = engineScores?.[patient.id];
  if (score == null) {
    return { label: "Set manually", engine: false };
  }
  const engineRisk = riskLevelFromLabel(score.riskLabel);
  if (engineRisk === patient.riskLevel) {
    return { label: `Engine · ${formatDateLabel(score.predictedAt)}`, engine: true };
  }
  return { label: "Manual override", engine: false };
}

function PatientTable({
  patients,
  engineScores,
  onEdit,
  onMonitor,
  onDelete,
}: {
  patients: Patient[];
  engineScores: Record<string, EngineScoreStamp> | null;
  onEdit: (id: string) => void;
  onMonitor: (id: string) => void;
  onDelete: (patient: Patient) => void;
}) {
  return (
    <>
      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-xl border border-theme-line bg-white shadow-sm md:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-theme-line bg-theme-light-gray/50 text-left text-xs font-bold uppercase tracking-wide text-theme-gray">
              <th className="px-5 py-3">Patient</th>
              <th className="px-3 py-3">Sex</th>
              <th className="px-3 py-3">GA (wk)</th>
              <th className="px-3 py-3">Weight (g)</th>
              <th className="px-3 py-3">Risk level</th>
              <th className="px-3 py-3">Added</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {patients.map((patient) => {
              const provenance = riskProvenance(patient, engineScores);
              return (
              <tr
                key={patient.id}
                className="border-b border-theme-line/60 last:border-0 odd:bg-white even:bg-theme-light-gray/25"
              >
                <td className="px-5 py-3.5">
                  <div className="font-semibold text-theme-ink">
                    {formatPatientName(patient)}
                  </div>
                  <div className="text-xs text-theme-gray">
                    {patient.mrn ? `MRN ${patient.mrn}` : "No MRN"}
                  </div>
                </td>
                <td className="px-3 py-3.5 capitalize text-theme-ink-soft">
                  {patient.sex ?? "—"}
                </td>
                <td className="px-3 py-3.5 text-theme-ink-soft">
                  {patient.gestationalAgeWeeks ?? "—"}
                </td>
                <td className="px-3 py-3.5 text-theme-ink-soft">
                  {patient.birthWeightGrams ?? "—"}
                </td>
                <td className="px-3 py-3.5">
                  <div className="flex flex-col items-start gap-1">
                    <RiskBadge level={patient.riskLevel} />
                    <span
                      className={
                        provenance.engine
                          ? "text-xs font-medium text-theme-ink-soft"
                          : "text-xs text-theme-gray"
                      }
                    >
                      {provenance.label}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-3.5 text-theme-gray">
                  {formatDateLabel(patient.createdAt)}
                </td>
                <td className="px-5 py-3.5">
                  <div className="flex justify-end gap-1.5">
                    <RowAction label="Edit" onClick={() => onEdit(patient.id)} />
                    <RowAction label="Monitor" onClick={() => onMonitor(patient.id)} />
                    <RowAction
                      label="Delete"
                      tone="danger"
                      onClick={() => onDelete(patient)}
                    />
                  </div>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile stacked cards */}
      <ul className="flex flex-col gap-3 md:hidden">
        {patients.map((patient) => {
          const provenance = riskProvenance(patient, engineScores);
          return (
          <li
            key={patient.id}
            className="rounded-xl border border-theme-line bg-white p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-theme-ink">
                  {formatPatientName(patient)}
                </div>
                <div className="text-xs text-theme-gray">
                  {patient.mrn ? `MRN ${patient.mrn}` : "No MRN"} · added{" "}
                  {formatDateLabel(patient.createdAt)}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <RiskBadge level={patient.riskLevel} />
                <span
                  className={
                    provenance.engine
                      ? "text-xs font-medium text-theme-ink-soft"
                      : "text-xs text-theme-gray"
                  }
                >
                  {provenance.label}
                </span>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-theme-gray">
              <span>Sex: <span className="font-medium text-theme-ink-soft capitalize">{patient.sex ?? "—"}</span></span>
              <span>GA: <span className="font-medium text-theme-ink-soft">{patient.gestationalAgeWeeks ?? "—"} wk</span></span>
              <span>Weight: <span className="font-medium text-theme-ink-soft">{patient.birthWeightGrams ?? "—"} g</span></span>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => onEdit(patient.id)}
                className="flex-1 rounded-lg border border-theme-line px-3 py-2 text-xs font-semibold text-theme-ink transition-colors hover:bg-theme-light-gray"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => onMonitor(patient.id)}
                className="flex-1 rounded-lg border border-theme-line px-3 py-2 text-xs font-semibold text-theme-ink transition-colors hover:bg-theme-light-gray"
              >
                Monitor
              </button>
              <button
                type="button"
                onClick={() => onDelete(patient)}
                className="flex-1 rounded-lg border border-theme-line px-3 py-2 text-xs font-semibold text-risk-high-fg transition-colors hover:bg-risk-high-bg"
              >
                Delete
              </button>
            </div>
          </li>
          );
        })}
      </ul>
    </>
  );
}

function RowAction({
  label,
  tone = "neutral",
  onClick,
}: {
  label: string;
  tone?: "neutral" | "danger";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-theme-maroon",
        tone === "danger"
          ? "text-risk-high-fg hover:bg-risk-high-bg"
          : "text-theme-ink-soft hover:bg-theme-light-gray",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function LoadingList() {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      {[0, 1, 2].map((row) => (
        <div
          key={row}
          className="h-16 animate-pulse rounded-xl border border-theme-line bg-white/70"
        />
      ))}
    </div>
  );
}

function EmptyList({
  isRegistryEmpty,
  filter,
  onAdd,
}: {
  isRegistryEmpty: boolean;
  filter: Filter;
  onAdd: () => void;
}) {
  return (
    <Panel className="items-center gap-4 py-14 text-center">
      <h2 className="text-lg font-bold text-theme-ink">
        {isRegistryEmpty
          ? "The registry is empty"
          : `No ${filter === "pending" ? "pending" : `${filter}-risk`} patients`}
      </h2>
      <p className="max-w-sm text-sm text-theme-gray">
        {isRegistryEmpty
          ? "Register the first patient to start running neonatal sepsis assessments."
          : "Try a different risk filter, or register a new patient."}
      </p>
      <button
        type="button"
        onClick={onAdd}
        className="rounded-lg bg-theme-maroon px-5 py-2.5 text-sm font-semibold text-theme-white transition-colors hover:bg-theme-maroon-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-theme-maroon"
      >
        ＋ Add patient
      </button>
    </Panel>
  );
}

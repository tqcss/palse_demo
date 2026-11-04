import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import Notice from "../components/Notice.tsx";
import Panel from "../components/Panel.tsx";
import PatientModal from "../components/PatientModal.tsx";
import PrimaryButton from "../components/PrimaryButton.tsx";
import RiskBadge from "../components/RiskBadge.tsx";
import ConfirmDialog from "../components/ui/ConfirmDialog.tsx";
import PageHeader from "../components/ui/PageHeader.tsx";
import { Skeleton } from "../components/ui/Skeleton.tsx";
import EmptyState from "../components/ui/EmptyState.tsx";
import { deletePatient, listPatients } from "../lib/db.ts";
import { guide } from "../lib/authErrors.ts";
import type { RiskLevel } from "../lib/patient.ts";
import {
  formatDateLabel,
  formatPatientInitials,
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

  const [searchParams, setSearchParams] = useSearchParams();
  // URL-driven filter: /patients?risk=high|moderate|low|pending (used by the
  // dashboard's donuts and insights; "all"/absent = unfiltered).
  const riskParam = searchParams.get("risk");
  const filter: Filter = (FILTER_ORDER as readonly string[]).includes(riskParam ?? "")
    ? (riskParam as Filter)
    : "all";

  function updateFilter(next: Filter) {
    setSearchParams(
      (current) => {
        const params = new URLSearchParams(current);
        if (next === "all") params.delete("risk");
        else params.set("risk", next);
        return params;
      },
      { replace: true },
    );
  }

  const [patients, setPatients] = useState<Patient[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [deleting, setDeleting] = useState<Patient | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

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

  async function confirmDelete() {
    if (deleting == null || deletePending) return;
    setDeletePending(true);
    try {
      await deletePatient(deleting.id);
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
      <PageHeader
        eyebrow="Clinical registry"
        title="Patients"
        subtitle={
          loading
            ? "Loading registry…"
            : `${counts.all} registered ${counts.all === 1 ? "patient" : "patients"} · risk levels are set manually until the prediction engine is live`
        }
        actions={
          <PrimaryButton
            type="button"
            inline
            onClick={() => setAddOpen(true)}
          >
            ＋ Add patient
          </PrimaryButton>
        }
      />

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
              onClick={() => updateFilter(tier)}
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
          onEdit={(id) => void navigate(`/patients/${id}/edit`)}
          onMonitor={(id) => void navigate(`/monitor?patient=${id}`)}
          onDelete={setDeleting}
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
        <ConfirmDialog
          title="Delete patient"
          tone="danger"
          pending={deletePending}
          confirmLabel="Delete patient"
          onClose={() => setDeleting(null)}
          onConfirm={() => void confirmDelete()}
          body={
            <p>
              Delete <strong>{formatPatientName(deleting)}</strong>
              {deleting.mrn ? ` (MRN ${deleting.mrn})` : ""}? All of their
              assessment records are removed together with the patient. This
              cannot be undone.
            </p>
          }
        />
      ) : null}
    </div>
  );
}

function PatientTable({
  patients,
  onEdit,
  onMonitor,
  onDelete,
}: {
  patients: Patient[];
  onEdit: (id: string) => void;
  onMonitor: (id: string) => void;
  onDelete: (patient: Patient) => void;
}) {
  return (
    <>
      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-card border border-theme-line bg-white shadow-card md:block">
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
            {patients.map((patient) => (
              <tr
                key={patient.id}
                className="border-b border-theme-line/60 last:border-0 odd:bg-white even:bg-theme-light-gray/25"
              >
                <td className="px-5 py-3.5">
                  {/* Initials + MRN for privacy; full name for assistive tech. */}
                  <div
                    className="font-semibold text-theme-ink"
                    aria-label={formatPatientName(patient)}
                  >
                    <span aria-hidden title={formatPatientName(patient)}>
                      {formatPatientInitials(patient)}
                    </span>
                  </div>
                  <div className="text-xs text-theme-gray">
                    MRN {patient.mrn ?? "—"}
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
                  <RiskBadge level={patient.riskLevel} />
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
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile stacked cards */}
      <ul className="flex flex-col gap-3 md:hidden">
        {patients.map((patient) => (
          <li
            key={patient.id}
            className="rounded-card border border-theme-line bg-white p-4 shadow-card"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div
                  className="text-sm font-semibold text-theme-ink"
                  aria-label={formatPatientName(patient)}
                >
                  <span aria-hidden title={formatPatientName(patient)}>
                    {formatPatientInitials(patient)}
                  </span>
                </div>
                <div className="text-xs text-theme-gray">
                  MRN {patient.mrn ?? "—"} · added {formatDateLabel(patient.createdAt)}
                </div>
              </div>
              <RiskBadge level={patient.riskLevel} />
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
                className="flex-1 rounded-control border border-theme-line px-3 py-2 text-xs font-semibold text-theme-ink transition-colors hover:bg-theme-light-gray"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => onMonitor(patient.id)}
                className="flex-1 rounded-control border border-theme-line px-3 py-2 text-xs font-semibold text-theme-ink transition-colors hover:bg-theme-light-gray"
              >
                Monitor
              </button>
              <button
                type="button"
                onClick={() => onDelete(patient)}
                className="flex-1 rounded-control border border-theme-line px-3 py-2 text-xs font-semibold text-risk-high-fg transition-colors hover:bg-risk-high-bg"
              >
                Delete
              </button>
            </div>
          </li>
        ))}
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
        <Skeleton key={row} className="h-16 w-full rounded-card" />
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
    <Panel className="items-center gap-1 py-10 text-center">
      <EmptyState
        icon="person_add"
        title={
          isRegistryEmpty
            ? "The registry is empty"
            : `No ${filter === "pending" ? "pending" : `${filter}-risk`} patients`
        }
        body={
          isRegistryEmpty
            ? "Register the first patient to start running neonatal sepsis assessments."
            : "Try a different risk filter, or register a new patient."
        }
        action={
          <PrimaryButton type="button" inline onClick={onAdd}>
            ＋ Add patient
          </PrimaryButton>
        }
      />
    </Panel>
  );
}

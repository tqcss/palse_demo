import { useMemo, useState } from "react";
import type { KeyboardEvent } from "react";

import RiskBadge from "./RiskBadge.tsx";
import {
  formatPatientInitials,
  formatPatientLabel,
} from "../lib/patient.ts";
import type { Patient } from "../lib/patient.ts";

/**
 * MRN-first patient finder with INLINE results — no overlay/dropdown. As the
 * clinician types, matched patients render as a plain list in the document
 * flow below the input; picking one selects them. Matches cover the MRN and
 * the (optional) initials.
 *
 * Keyboard: ↑/↓ move the highlight, Enter picks, Escape clears.
 */
export default function PatientPicker({
  patients,
  selected,
  disabled,
  loading = false,
  onSelect,
  onQuickCreate,
}: {
  patients: Patient[] | null;
  selected: Patient | null;
  disabled?: boolean;
  loading?: boolean;
  onSelect: (id: string) => void;
  /** Optional "＋ New" companion (used in the wizard); skips when absent. */
  onQuickCreate?: () => void;
}) {
  const [query, setQuery] = useState("");

  const matches = useMemo(() => {
    const pool = patients ?? [];
    const needle = query.trim().toLowerCase();
    if (needle === "") return [];
    return pool
      .filter(
        (patient) =>
          (patient.mrn ?? "").toLowerCase().includes(needle) ||
          (patient.initials ?? "").toLowerCase().includes(needle),
      )
      .slice(0, 6);
  }, [patients, query]);

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setQuery("");
      event.stopPropagation();
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2.5">
        <div className="relative flex-1">
          <input
            id="patient"
            type="search"
            autoComplete="off"
            disabled={disabled}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            aria-describedby="patient-picker-hint"
            placeholder={
              loading ? "Loading registry…" : "Search patients by MRN or initials…"
            }
            className="w-full rounded-lg border border-theme-line bg-white px-3.5 py-2 text-sm text-theme-ink transition-colors placeholder:text-theme-gray focus:border-theme-maroon focus:outline-none focus:ring-2 focus:ring-theme-maroon/25 disabled:opacity-60"
          />
          {selected != null && matches.length === 0 ? (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-theme-gray">
              Selected: {formatPatientLabel(selected)}
            </span>
          ) : null}
        </div>
        {onQuickCreate != null ? (
          <button
            type="button"
            onClick={onQuickCreate}
            className="shrink-0 rounded-lg border border-theme-maroon px-3.5 py-2 text-sm font-semibold text-theme-maroon transition-colors hover:bg-theme-maroon/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-theme-maroon"
          >
            ＋ New
          </button>
        ) : null}
      </div>
      <p id="patient-picker-hint" className="text-xs text-theme-gray">
        MRN-search results appear here — no dropdowns; the full record number
        finds the patient.
      </p>

      {query.trim() !== "" ? (
        <ul className="flex flex-col gap-1.5" role="list" aria-label="Matching patients">
          {matches.map((patient) => (
            <li key={patient.id}>
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  onSelect(patient.id);
                }}
                className={`flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg border px-3.5 py-2 text-left transition-colors ${
                  selected?.id === patient.id
                    ? "border-theme-maroon bg-theme-maroon/5"
                    : "border-theme-line bg-white hover:bg-theme-light-gray"
                }`}
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-semibold text-theme-ink">
                    {formatPatientInitials(patient)}
                  </span>
                  <span className="text-xs text-theme-gray">
                    {patient.mrn != null && patient.mrn.trim() !== ""
                      ? `MRN ${patient.mrn}`
                      : "No MRN"}
                  </span>
                </span>
                <RiskBadge level={patient.riskLevel} />
              </button>
            </li>
          ))}
          {matches.length === 0 ? (
            <li className="px-1 py-2 text-sm text-theme-gray">
              No patient matches “{query.trim()}”
              {onQuickCreate != null
                ? " — use ＋ New to register them."
                : "."}
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";

import FormInput from "../../components/FormInput.tsx";
import Notice from "../../components/Notice.tsx";
import Panel from "../../components/Panel.tsx";
import PrimaryButton from "../../components/PrimaryButton.tsx";
import { useAuth } from "../../context/useAuth.ts";
import { guide } from "../../lib/authErrors.ts";
import { type AuditLogFilter, type AuditLogEntry, listAuditLogs } from "../../lib/admin.ts";

const PAGE_SIZE = 50;

/** Human copy for the server-generated audit actions. */
const ACTION_LABELS: Record<string, string> = {
  "patient.create": "Patient registered",
  "patient.update": "Patient updated",
  "patient.delete": "Patient deleted",
  "assessment.create": "Assessment started",
  "assessment.update": "Assessment saved",
  "assessment.delete": "Assessment deleted",
  "vitals.create": "Vitals recorded",
  "vitals.update": "Vitals updated",
  "vitals.delete": "Vitals deleted",
  "account.create": "Clinician account created",
  "account.temp_password": "Temporary password issued",
  "account.disable": "Account disabled",
  "account.enable": "Account re-enabled",
  "account.create_rejected": "Account creation failed",
  "organization.create": "Organization created",
  "organization.update": "Organization updated",
  "organization.delete": "Organization deleted",
  "org.create": "Organization created (setup)",
  "org.join": "Administrator joined via invite code",
  "org.rotate_invite_code": "Invite code rotated",
  "password_reset.requested": "Password reset requested",
};

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

function entityLabel(entity: AuditLogEntry["entity"]): string {
  switch (entity) {
    case "patient": return "Patient";
    case "assessment": return "Assessment";
    case "vitals": return "Vitals";
    case "account": return "Account";
    case "organization": return "Organization";
    case "password_reset": return "Password reset";
  }
}

function datetimeOf(iso: string): string {
  return new Date(iso).toLocaleString();
}

/**
 * Audit tab: server-generated activity of this organization. Only admins can
 * select audit_logs at all (RLS), and only rows of the caller's own org are
 * returned, so data of other organizations can never appear here.
 */
export default function AdminAuditPage() {
  const { profile } = useAuth();
  const orgId = profile?.org_id ?? null;

  const [logs, setLogs] = useState<AuditLogEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<AuditLogFilter>({ limit: PAGE_SIZE });
  const [filterKey, setFilterKey] = useState(0); // re-runs the effect on change

  const reload = useCallback(async () => {
    if (orgId == null) return;
    try {
      const rows = await listAuditLogs(filter);
      setLogs(rows);
      setLoadError(null);
    } catch (cause) {
      console.error("[palse audit]", cause);
      setLoadError(guide(cause, "Could not load the audit log. Try again."));
    }
  }, [orgId, filter]);

  useEffect(() => {
    void reload();
  }, [reload, filterKey]);

  function applyFilter(patch: Partial<AuditLogFilter>) {
    setFilter((previous) => ({ ...previous, ...patch }));
    setFilterKey((key) => key + 1);
  }

  function toIsoOrNull(value: string): string | null {
    const trimmed = value.trim();
    if (trimmed === "") return null;
    const date = new Date(trimmed);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  function handleFilterSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    applyFilter({
      entity: (data.get("entity") as string) === "" ? null : (data.get("entity") as AuditLogFilter["entity"]),
      actorEmail: (data.get("actor") as string) || null,
      action: (data.get("action") as string) || null,
      fromIso: toIsoOrNull((data.get("from") as string) ?? ""),
      toIso: toIsoOrNull((data.get("to") as string) ?? ""),
    });
  }

  function handleClear(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    setFilter({ limit: PAGE_SIZE });
    setFilterKey((key) => key + 1);
  }

  const hasFilter = filter.entity != null ||
    (filter.actorEmail != null && filter.actorEmail.trim() !== "") ||
    (filter.action != null && filter.action.trim() !== "") ||
    filter.fromIso != null ||
    filter.toIso != null;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1.5">
        <p className="text-xs font-bold uppercase tracking-wide text-theme-maroon">
          Activities · Who changed what
        </p>
        <h1 className="text-2xl font-bold text-theme-ink">Audit log</h1>
        <p className="text-sm text-theme-gray">
          Every clinical change in <strong className="text-theme-ink">your organization</strong>
          {" "}— recorded server-side, so it can&apos;t be edited or forged from the app.
        </p>
      </header>

      <Panel title="Filters">
        <form
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          onSubmit={handleFilterSubmit}
          noValidate
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-theme-gray">Category</span>
            <select
              name="entity"
              defaultValue={filter.entity ?? ""}
              className="rounded-lg border border-theme-line bg-white px-3 py-2 text-sm text-theme-ink focus:border-theme-maroon focus:outline-none"
            >
              <option value="">All categories</option>
              <option value="patient">Patients</option>
              <option value="assessment">Assessments</option>
              <option value="vitals">Vitals</option>
              <option value="account">Accounts</option>
              <option value="organization">Organization</option>
              <option value="password_reset">Password resets</option>
            </select>
          </label>

          <FormInput
            id="audit-action"
            label="Action"
            hintClass="hidden"
            name="action"
            defaultValue={filter.action ?? ""}
            placeholder="e.g. patient.create"
          />
          <FormInput
            id="audit-actor"
            label="Actor email"
            hintClass="hidden"
            name="actor"
            defaultValue={filter.actorEmail ?? ""}
            placeholder="name@hospital.org"
          />
          <FormInput
            id="audit-from"
            label="From"
            type="datetime-local"
            hintClass="hidden"
            name="from"
          />
          <FormInput
            id="audit-to"
            label="To"
            type="datetime-local"
            hintClass="hidden"
            name="to"
          />

          <div className="flex items-end gap-3">
            <PrimaryButton>
              Apply filters
            </PrimaryButton>
            {hasFilter ? (
              <button
                type="button"
                onClick={handleClear}
                className="rounded-lg border border-theme-line px-4 py-2.5 text-sm font-semibold text-theme-ink transition-colors hover:bg-theme-light-gray"
              >
                Clear
              </button>
            ) : null}
          </div>
        </form>
      </Panel>

      <Panel title="Activity">
        {loadError ? <Notice tone="danger">{loadError}</Notice> : null}
        {logs == null ? (
          <p className="text-sm text-theme-gray">Loading…</p>
        ) : logs.length === 0 ? (
          <p className="text-sm text-theme-gray">No matching activity.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-theme-line text-xs uppercase tracking-wide text-theme-gray">
                  <th className="pb-2 pr-4 font-semibold">When</th>
                  <th className="pb-2 pr-4 font-semibold">Who</th>
                  <th className="pb-2 pr-4 font-semibold">What</th>
                  <th className="pb-2 pr-4 font-semibold">Category</th>
                  <th className="pb-2 font-semibold">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-theme-line">
                {logs.map((row) => (
                  <tr key={row.id}>
                    <td className="py-3 pr-4 whitespace-nowrap text-theme-ink-soft">
                      {datetimeOf(row.created_at)}
                    </td>
                    <td className="py-3 pr-4">
                      <div className="font-medium text-theme-ink">
                        {row.actor_email ?? "—"}
                        {row.actor_id != null && row.actor_id === profile?.id ? (
                          <span className="ml-1.5 rounded bg-theme-maroon/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-theme-maroon">
                            you
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-theme-ink">{actionLabel(row.action)}</td>
                    <td className="py-3 pr-4 text-theme-ink-soft">{entityLabel(row.entity)}</td>
                    <td className="py-3 max-w-72 truncate text-xs text-theme-gray">
                      {row.entity_id != null ? row.entity_id : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {logs != null && logs.length >= PAGE_SIZE ? (
          <p className="text-xs text-theme-gray">
            Showing the {logs.length} newest matching entries. Narrow the filters to see more.
          </p>
        ) : null}
      </Panel>
    </div>
  );
}

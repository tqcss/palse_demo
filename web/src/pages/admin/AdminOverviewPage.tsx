import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import MsIcon from "../../components/MsIcon.tsx";
import Notice from "../../components/Notice.tsx";
import Panel from "../../components/Panel.tsx";
import RiskBadge from "../../components/RiskBadge.tsx";
import StatCard from "../../components/StatCard.tsx";
import { useAuth } from "../../context/useAuth.ts";
import { guide } from "../../lib/authErrors.ts";
import {
  assessmentPrediction,
  listAllAssessments,
  listPatients,
  riskLevelFromLabel,
} from "../../lib/db.ts";
import type { Assessment } from "../../lib/assessment.ts";
import { formatPatientName, type Patient, type RiskLevel } from "../../lib/patient.ts";
import {
  type AuditLogEntry,
  type OrgMember,
  type PasswordResetRequest,
  auditActionLabel,
  listAuditLogs,
  listOrgMembers,
  listPendingResetRequests,
} from "../../lib/admin.ts";

function datetimeOf(iso: string): string {
  return new Date(iso).toLocaleString();
}

/**
 * Console home at /admin: organization-wide counts, the most recent
 * assessments and the latest audit activity. An admin sees exactly the data
 * of their own organization — RLS scopes every query used here.
 */
export default function AdminOverviewPage() {
  const { profile } = useAuth();
  const orgId = profile?.org_id ?? null;

  const [patients, setPatients] = useState<Patient[] | null>(null);
  const [assessments, setAssessments] = useState<Assessment[] | null>(null);
  const [members, setMembers] = useState<OrgMember[] | null>(null);
  const [resetRequests, setResetRequests] = useState<PasswordResetRequest[] | null>(null);
  const [audit, setAudit] = useState<AuditLogEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (orgId == null) return;
    let active = true;
    void (async () => {
      try {
        const [registry, allAssessments, roster, pendingResets, recentAudit] = await Promise.all([
          listPatients(),
          listAllAssessments(),
          listOrgMembers(orgId),
          listPendingResetRequests(orgId),
          listAuditLogs({ limit: 8 }),
        ]);
        if (!active) return;
        setPatients(registry);
        setAssessments(allAssessments);
        setMembers(roster);
        setResetRequests(pendingResets);
        setAudit(recentAudit);
      } catch (cause) {
        if (!active) return;
        console.error("[palse admin overview]", cause);
        setLoadError(guide(cause, "Could not load the organization overview. Try again."));
      }
    })();
    return () => {
      active = false;
    };
  }, [orgId]);

  const patientById = useMemo(() => {
    const map = new Map<string, Patient>();
    for (const patient of patients ?? []) map.set(patient.id, patient);
    return map;
  }, [patients]);

  const completedCount = useMemo(
    () => (assessments ?? []).filter((assessment) => assessment.status === "complete").length,
    [assessments],
  );

  const activeMembers = useMemo(
    () => (members ?? []).filter((member) => member.status === "active").length,
    [members],
  );

  const loading = patients == null || assessments == null || members == null;

  const recentAssessments = useMemo(() => {
    return (assessments ?? []).slice(0, 6).map((assessment) => {
      const patient = patientById.get(assessment.patientId) ?? null;
      const prediction = assessmentPrediction(assessment);
      return {
        id: assessment.id,
        patientId: assessment.patientId,
        patientName: patient != null ? formatPatientName(patient) : "Removed patient",
        mrn: patient?.mrn ?? null,
        status: assessment.status,
        createdAt: assessment.createdAt,
        riskLevel: prediction?.riskLabel != null
          ? riskLevelFromLabel(prediction.riskLabel)
          : ("pending" as RiskLevel),
      };
    });
  }, [assessments, patientById]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1.5">
        <p className="text-xs font-bold uppercase tracking-wide text-theme-maroon">
          Overview · Your organization at a glance
        </p>
        <h1 className="text-2xl font-bold text-theme-ink">Organization overview</h1>
        <p className="text-sm text-theme-gray">
          Clinical activity of <strong className="text-theme-ink">your organization</strong> only —
          data of other hospitals is never visible.
        </p>
      </header>

      {loadError ? <Notice tone="danger">{loadError}</Notice> : null}

      {resetRequests != null && resetRequests.length > 0 ? (
        <Notice tone="warning">
          {resetRequests.length === 1
            ? "1 clinician is waiting for a new temporary password."
            : `${resetRequests.length} clinicians are waiting for a new temporary password.`}{" "}
          <Link to="/admin/members" className="font-semibold underline">
            Open Members
          </Link>{" "}
          to issue one.
        </Notice>
      ) : null}

      <div className="flex flex-col gap-3 md:flex-row">
        <StatCard
          label="Patients"
          content={loading ? "…" : `${(patients ?? []).length} registered`}
        />
        <StatCard
          label="Assessments"
          content={loading ? "…" : `${(assessments ?? []).length} total · ${completedCount} completed`}
        />
        <StatCard
          label="Members"
          content={loading ? "…" : `${activeMembers} active of ${(members ?? []).length} accounts`}
        />
        <StatCard
          label="Password reset requests"
          content={resetRequests == null ? "…" : `${resetRequests.length} pending`}
        />
      </div>

      <Panel
        title="Recent assessments"
        subtitle="The six newest assessments across your organization"
      >
        {assessments == null ? (
          <p className="text-sm text-theme-gray">Loading…</p>
        ) : recentAssessments.length === 0 ? (
          <p className="text-sm text-theme-gray">
            No assessments yet. Clinicians create them in the clinical app.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead>
                <tr className="border-b border-theme-line text-xs uppercase tracking-wide text-theme-gray">
                  <th className="pb-2 pr-4 font-semibold">Patient</th>
                  <th className="pb-2 pr-4 font-semibold">MRN</th>
                  <th className="pb-2 pr-4 font-semibold">Status</th>
                  <th className="pb-2 pr-4 font-semibold">Prediction</th>
                  <th className="pb-2 pr-4 font-semibold">Created</th>
                  <th className="pb-2 font-semibold">Open</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-theme-line">
                {recentAssessments.map((entry) => (
                  <tr key={entry.id}>
                    <td className="py-3 pr-4 font-medium text-theme-ink">{entry.patientName}</td>
                    <td className="py-3 pr-4 text-theme-ink-soft">{entry.mrn ?? "—"}</td>
                    <td className="py-3 pr-4 text-theme-ink-soft">
                      {entry.status === "complete" ? "Completed" : "Draft"}
                    </td>
                    <td className="py-3 pr-4">
                      <RiskBadge level={entry.riskLevel} />
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap text-theme-ink-soft">
                      {datetimeOf(entry.createdAt)}
                    </td>
                    <td className="py-3">
                      <Link
                        to={`/patients/${entry.patientId}/edit`}
                        className="inline-flex items-center gap-1 font-semibold text-theme-maroon hover:underline"
                      >
                        Chart
                        <MsIcon name="arrow_forward" className="text-[15px]" optical={16} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel
        title="Recent activity"
        subtitle="From the audit log — every change is recorded server-side"
      >
        {audit == null ? (
          <p className="text-sm text-theme-gray">Loading…</p>
        ) : audit.length === 0 ? (
          <p className="text-sm text-theme-gray">No recorded activity yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-theme-line">
            {audit.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5">
                <span className="w-40 shrink-0 text-xs whitespace-nowrap text-theme-ink-soft">
                  {datetimeOf(entry.created_at)}
                </span>
                <span className="text-sm font-medium text-theme-ink">
                  {auditActionLabel(entry.action)}
                </span>
                <span className="text-xs text-theme-gray">{entry.actor_email ?? "—"}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4">
          <Link
            to="/admin/audit"
            className="inline-flex items-center gap-1 text-sm font-semibold text-theme-maroon hover:underline"
          >
            View full audit log
            <MsIcon name="arrow_forward" className="text-[15px]" optical={16} />
          </Link>
        </div>
      </Panel>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import MsIcon from "../../components/MsIcon.tsx";
import Notice from "../../components/Notice.tsx";
import Panel from "../../components/Panel.tsx";
import PrimaryButton from "../../components/PrimaryButton.tsx";
import Badge, { type BadgeTone } from "../../components/ui/Badge.tsx";
import RelativeTime from "../../components/ui/RelativeTime.tsx";
import EmptyState from "../../components/ui/EmptyState.tsx";
import PageHeader from "../../components/ui/PageHeader.tsx";
import { Skeleton, SkeletonRows } from "../../components/ui/Skeleton.tsx";
import { useAuth } from "../../context/useAuth.ts";
import { guide } from "../../lib/authErrors.ts";
import { useAdminPageTitle } from "../../hooks/useAdminPageTitle.ts";
import {
  assessmentPrediction,
  listAllAssessments,
  listPatients,
  riskLevelFromLabel,
} from "../../lib/db.ts";
import type { Assessment } from "../../lib/assessment.ts";
import type { RiskLevel } from "../../lib/patient.ts";
import { formatPatientLabel, type Patient } from "../../lib/patient.ts";
import {
  type AuditLogEntry,
  type OrgMember,
  type PasswordResetRequest,
  auditCategoryMeta,
  describeAuditEntry,
  listAuditLogs,
  listOrgMembers,
  listPendingResetRequests,
} from "../../lib/admin.ts";

/* ---------------------------------- cards ---------------------------------- */

/** Palette (RiskBadge tiers) for the risk-distribution bar. */
const RISK_TONE: Record<Exclude<RiskLevel, "pending">, BadgeTone> = {
  low: "success",
  moderate: "warning",
  high: "danger",
};

function StatCard({
  icon,
  to,
  count,
  label,
  secondary,
  tone,
  badge,
  skeleton,
  className,
}: {
  icon: string;
  /** Route of the whole card (RTL-safe anchor link). */
  to: string;
  count: number | null;
  label: string;
  secondary?: string;
  /** Optional accent for urgency ( Password reset requests). */
  tone?: "maroon";
  badge?: number;
  skeleton?: boolean;
  className?: string;
}) {
  const accent = tone === "maroon" || badge != null;
  return (
    <Link
      to={to}
      aria-label={`${count ?? 0} ${label}${secondary != null ? ` — ${secondary}` : ""}`}
      className={[
        "group relative flex flex-col gap-3 rounded-card border bg-white p-5 shadow-card transition-colors",
        accent
          ? "border-theme-maroon/30 hover:border-theme-maroon/60"
          : "border-theme-line hover:border-theme-maroon/40",
        className ?? "",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-theme-cream text-theme-maroon">
          <MsIcon name={icon} className="text-[22px]" optical={22} />
        </div>
        {badge != null && badge > 0 ? (
          <Badge tone="danger" icon="warning">
            {badge} pending
          </Badge>
        ) : null}
      </div>
      {skeleton ? (
        <Skeleton className="h-8 w-16" />
      ) : (
        <p className="text-3xl font-bold leading-none text-theme-ink">{count ?? 0}</p>
      )}
      <div>
        <p className="text-sm font-semibold text-theme-ink">{label}</p>
        {secondary != null ? (
          <p className="mt-0.5 text-xs text-theme-gray">{skeleton ? <Skeleton className="h-3 w-24" /> : secondary}</p>
        ) : null}
      </div>
      <MsIcon
        name="arrow_outward"
        className="absolute right-4 bottom-4 text-[16px] text-theme-gray opacity-0 transition-opacity group-hover:opacity-100"
        optical={16}
      />
    </Link>
  );
}

/* ------------------------------ 30-day graph ------------------------------- */

/** Daily assessment counts for the last 30 days (maroon SVG bars). */
function AssessmentsChart({ assessments }: { assessments: Assessment[] }) {
  const { days, counts, total, max } = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const days = Array.from({ length: 30 }, (_, index) => {
      const day = new Date(startOfToday);
      day.setDate(day.getDate() - (29 - index));
      return day;
    });

    const counts = days.map((day) =>
      assessments.filter((assessment) => {
        const created = new Date(assessment.createdAt);
        return created >= day && created < new Date(day.getTime() + 86_400_000);
      }).length,
    );
    const max = Math.max(1, ...counts);
    const total = counts.reduce((sum, value) => sum + value, 0);
    return { days, counts, total, max };
  }, [assessments]);

  if (total === 0) {
    return (
      <EmptyState
        icon="monitoring"
        title="No assessments in the last 30 days"
        body="Assessments made by clinicians appear here day by day."
        action={<OpenClinicalAppButton />}
      />
    );
  }

  return (
    <div>
      <div className="flex h-32 items-end gap-1" role="img" aria-label={`Assessments per day, last 30 days: ${total} total`}>
        {counts.map((value, index) => (
          <div
            key={index}
            title={`${days[index].toLocaleDateString()} — ${value} assessment${value === 1 ? "" : "s"}`}
            className={[
              "min-w-[6px] flex-1 rounded-t-[3px] transition-colors",
              value === 0 ? "bg-theme-line/70" : "bg-theme-maroon",
            ].join(" ")}
            style={{ height: `${Math.max(value === 0 ? 3 : 8, (value / max) * 100)}%` }}
          />
        ))}
      </div>
      <div className="mt-2 flex justify-between text-xs text-theme-gray">
        <span>30 days ago</span>
        <span>Today</span>
      </div>
    </div>
  );
}

/* --------------------------- risk distribution bars --------------------------- */

function RiskDistribution({ assessments }: { assessments: Assessment[] }) {
  const tiers = {
    high: 0,
    moderate: 0,
    low: 0,
  } as Record<Exclude<RiskLevel, "pending">, number>;
  let scored = 0;
  for (const assessment of assessments) {
    const prediction = assessmentPrediction(assessment);
    if (prediction?.riskLabel == null) continue;
    scored += 1;
    tiers[riskLevelFromLabel(prediction.riskLabel)] += 1;
  }

  const entries: Array<[Exclude<RiskLevel, "pending">, number]> = [
    ["high", tiers.high],
    ["moderate", tiers.moderate],
    ["low", tiers.low],
  ];
  const total = entries.reduce((sum, [, value]) => sum + value, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex h-3 overflow-hidden rounded-full bg-theme-line/70">
        {entries.map(([tier, value]) =>
          value === 0 ? null : (
            <div
              key={tier}
              className={tier === "high" ? "bg-risk-high-fg/80" : tier === "moderate" ? "bg-risk-moderate-fg/70" : "bg-risk-low-fg/80"}
              style={{ width: `${(value / Math.max(1, total)) * 100}%` }}
            />
          ),
        )}
      </div>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {entries.map(([tier, value]) => (
          <li key={tier} className="flex items-center justify-between gap-2 rounded-control border border-theme-line bg-white px-3 py-2">
            <Badge tone={RISK_TONE[tier]}>{tier === "low" ? "Low risk" : tier === "moderate" ? "Moderate risk" : "High risk"}</Badge>
            <span className="text-sm font-bold text-theme-ink">
              {value}
              <span className="ml-1 text-xs font-normal text-theme-gray">
                of {scored}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* --------------------------------- button ---------------------------------- */

/** Shared secondary CTA into the clinical app. */
export function OpenClinicalAppButton() {
  return (
    <Link
      to="/dashboard"
      className="inline-flex items-center gap-2 rounded-control border border-theme-line bg-white px-4 py-2 text-sm font-semibold text-theme-ink transition-colors hover:bg-theme-light-gray"
    >
      <MsIcon name="medical_services" className="text-[18px]" optical={20} />
      Open clinical app
    </Link>
  );
}

/* ---------------------------------- page ----------------------------------- */

/**
 * Console home at /admin: organization-wide counts and analytics, recent
 * assessments, latest audit activity with deep links into the full log and
 * quick actions. Every query is org-scoped by RLS.
 */
export default function AdminOverviewPage() {
  /** Tab title */
  useAdminPageTitle("Overview");
  const { profile } = useAuth();
  const navigate = useNavigate();
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
        setPatients([]);
        setAssessments([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [orgId]);

  const memberById = useMemo(() => {
    const map = new Map<string, OrgMember>();
    for (const member of members ?? []) map.set(member.id, member);
    return map;
  }, [members]);

  const patientById = useMemo(() => {
    const map = new Map<string, Patient>();
    for (const patient of patients ?? []) map.set(patient.id, patient);
    return map;
  }, [patients]);

  const completedCount = (assessments ?? []).filter((assessment) => assessment.status === "complete").length;
  const criticalPatients = (patients ?? []).filter((patient) => patient.riskLevel === "high").length;

  const recentAssessments = useMemo(() => {
    return (assessments ?? []).slice(0, 6).map((assessment) => {
      const patient = patientById.get(assessment.patientId) ?? null;
      const prediction = assessmentPrediction(assessment);
      const scorer = memberById.get(assessment.createdBy) ?? null;
      return {
        id: assessment.id,
        patientId: assessment.patientId,
        patientName: patient != null ? formatPatientLabel(patient) : "Removed patient",
        mrn: patient?.mrn ?? null,
        status: assessment.status,
        createdAt: assessment.createdAt,
        riskLabel: prediction?.riskLabel != null ? (riskLevelFromLabel(prediction.riskLabel) as Exclude<RiskLevel, "pending">) : null,
        scoredBy: scorer != null
          ? [scorer.first_name, scorer.last_name].filter(Boolean).join(" ") || scorer.email || "Member"
          : assessment.createdBy,
      };
    });
  }, [assessments, patientById, memberById]);

  const loading = patients == null || assessments == null || members == null || resetRequests == null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Overview · Your organization at a glance"
        title="Organization overview"
        subtitle="Clinical activity of your organization only — other hospitals' data is never visible."
        actions={
          <>
            <PrimaryButton
              type="button"
              className="w-auto px-4"
              onClick={() => navigate("/admin/members?create=1")}
            >
              <MsIcon name="person_add" className="text-[18px]" optical={20} />
              Create clinician account
            </PrimaryButton>
            <a
              href="#invite-code"
              onClick={(event) => {
                event.preventDefault();
                navigate("/admin/organization#invite-code");
              }}
              className="inline-flex items-center gap-2 rounded-control border border-theme-line bg-white px-4 py-2 text-sm font-semibold text-theme-ink transition-colors hover:bg-theme-light-gray"
            >
              <MsIcon name="pin" className="text-[18px]" optical={20} />
              Rotate invite code
            </a>
          </>
        }
      />

      {loadError ? <Notice tone="danger">{loadError}</Notice> : null}

      {/* Stat grid: 4 -> 2 -> 1 columns */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          to="/patients"
          icon="group"
          count={loading ? null : (patients ?? []).length}
          label="Patients"
          secondary={loading ? undefined : `${criticalPatients} flagged high risk`}
          skeleton={loading}
        />
        <StatCard
          to="/reports"
          icon="labs"
          count={loading ? null : (assessments ?? []).length}
          label="Assessments"
          secondary={loading ? undefined : `${completedCount} completed`}
          skeleton={loading}
        />
        <StatCard
          to="/admin/members"
          icon="manage_accounts"
          count={loading ? null : (members ?? []).length}
          label="Members"
          secondary={loading ? undefined : `${(members ?? []).filter((member) => member.role === "clinician").length} clinicians · ${(members ?? []).filter((member) => member.role === "admin").length} admin`}
          skeleton={loading}
        />
        <StatCard
          to="/admin/members?status=pending-reset"
          icon="key"
          count={loading ? null : (resetRequests ?? []).length}
          label="Password reset requests"
          tone="maroon"
          badge={resetRequests != null && resetRequests.length > 0 ? resetRequests.length : undefined}
          secondary={loading ? undefined : resetRequests!.length > 0 ? "Actions needed" : "All clear"}
          skeleton={loading}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel
          title="Risk distribution"
          subtitle="Engine-scored assessments by risk tier"
        >
          {assessments == null ? (
            <SkeletonRows rows={3} />
          ) : (
            <RiskDistribution assessments={assessments} />
          )}
        </Panel>

        <Panel
          title="Assessments, last 30 days"
          subtitle="Daily volume of started assessments"
        >
          {assessments == null ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <AssessmentsChart assessments={assessments} />
          )}
        </Panel>
      </div>

      <Panel
        title="Recent assessments"
        subtitle="The six newest across your organization"
      >
        {assessments == null ? (
          <SkeletonRows rows={4} />
        ) : recentAssessments.length === 0 ? (
          <EmptyState
            illustrated
            icon="stethoscope"
            title="No assessments yet"
            body="Once clinicians register patients and run sepsis assessments, the newest activity appears here with risk tiers."
            action={
              <PrimaryButton type="button" className="w-auto" onClick={() => navigate("/patients")}>
                <MsIcon name="group" className="text-[18px]" optical={20} />
                Open patient registry
              </PrimaryButton>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-theme-line text-xs uppercase tracking-wider text-theme-gray">
                  <th className="pb-2 pr-4 font-semibold">MRN</th>
                  <th className="pb-2 pr-4 font-semibold">Patient</th>
                  <th className="pb-2 pr-4 font-semibold">Risk</th>
                  <th className="pb-2 pr-4 font-semibold">Scored by</th>
                  <th className="pb-2 pr-4 font-semibold">Created</th>
                  <th className="pb-2 font-semibold sr-only">Open</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-theme-line">
                {recentAssessments.map((entry) => (
                  <tr key={entry.id} className="transition-colors hover:bg-theme-cream/40">
                    <td className="py-3 pr-4 font-mono text-xs font-semibold text-theme-ink-soft">
                      {entry.mrn ?? "—"}
                    </td>
                    <td className="py-3 pr-4 font-medium text-theme-ink">{entry.patientName}</td>
                    <td className="py-3 pr-4">
                      <RiskBadgeAdapter riskLabel={entry.riskLabel} />
                    </td>
                    <td className="py-3 pr-4 text-theme-ink-soft">
                      {entry.status === "complete" ? entry.scoredBy : "—"}
                    </td>
                    <td className="py-3 pr-4 text-theme-gray"><RelativeTime iso={entry.createdAt} /></td>
                    <td className="py-3">
                      <Link
                        to={`/patients/${entry.patientId}/edit`}
                        className="inline-flex items-center gap-1 font-semibold text-theme-maroon underline-offset-4 hover:underline"
                      >
                        Open chart
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
          <SkeletonRows rows={5} />
        ) : audit.length === 0 ? (
          <EmptyState icon="history" title="No recorded activity yet" />
        ) : (
          <ol className="flex flex-col">
            {audit.map((entry) => (
              <li key={entry.id} className="border-b border-theme-line last:border-b-0">
                <Link
                  to={`/admin/audit-log?category=${entry.entity}`}
                  className="group flex items-start gap-3 rounded-control px-1 py-2.5 transition-colors hover:bg-theme-cream/40"
                >
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-theme-cream text-theme-maroon">
                    <MsIcon
                      name={auditCategoryMeta(entry.entity).icon}
                      className="text-[16px]"
                      optical={18}
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-theme-ink">
                      {describeAuditEntry(entry)}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-theme-gray">
                      {entry.actor_email ?? "System"}
                    </span>
                  </span>
                  <RelativeTime iso={entry.created_at} className="text-xs text-theme-gray" />
                </Link>
              </li>
            ))}
          </ol>
        )}
        <div className="mt-4 flex items-center justify-between gap-4 border-t border-theme-line pt-4">
          <span className="flex items-center gap-1.5 text-xs text-theme-gray">
            <MsIcon name="lock" className="text-[14px]" optical={14} />
            Recorded server-side so it can&apos;t be edited or forged
          </span>
          <Link
            to="/admin/audit-log"
            className="inline-flex items-center gap-1 text-sm font-semibold text-theme-maroon underline-offset-4 hover:underline"
          >
            View full audit log
            <MsIcon name="arrow_forward" className="text-[15px]" optical={16} />
          </Link>
        </div>
      </Panel>
    </div>
  );
}

/* ------------------------------ local helpers ------------------------------ */

function RiskBadgeAdapter({ riskLabel }: { riskLabel: Exclude<RiskLevel, "pending"> | null }) {
  if (riskLabel == null) {
    return <Badge>Not scored</Badge>;
  }
  const tone: BadgeTone = RISK_TONE[riskLabel];
  const label = riskLabel === "low" ? "Low risk" : riskLabel === "moderate" ? "Moderate risk" : "High risk";
  return <Badge tone={tone}>{label}</Badge>;
}

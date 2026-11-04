import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

import MsIcon from "../../components/MsIcon.tsx";
import Notice from "../../components/Notice.tsx";
import Panel from "../../components/Panel.tsx";
import PrimaryButton from "../../components/PrimaryButton.tsx";
import Badge from "../../components/ui/Badge.tsx";
import CopyButton from "../../components/ui/CopyButton.tsx";
import PageHeader from "../../components/ui/PageHeader.tsx";
import RelativeTime from "../../components/ui/RelativeTime.tsx";
import ConfirmDialog from "../../components/ConfirmDialog.tsx";
import { Skeleton } from "../../components/ui/Skeleton.tsx";
import { useToast } from "../../components/ui/toast.tsx";
import { useAuth } from "../../context/useAuth.ts";
import { useAdminPageTitle } from "../../hooks/useAdminPageTitle.ts";
import { guide } from "../../lib/authErrors.ts";
import { fullDate } from "../../lib/humanTime.ts";
import {
  countPatients,
  getMyOrganization,
  listOrgMembers,
  rotateInviteCode,
  type Organization,
} from "../../lib/admin.ts";

/** Small key/value row for the hospital record grid. */
function Record({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 border-b border-theme-line/70 py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <span className="text-sm font-medium text-theme-gray">{label}</span>
      <span className="min-w-0 text-sm text-theme-ink">{children}</span>
    </div>
  );
}

/**
 * Organization page (/admin/organization): the hospital record, the invite
 * code other administrators use to join (with rotate), and tenant-isolation
 * notes. The invite-code card is a #invite-code anchor — the Overview quick
 * action deep-links here.
 */
export default function AdminOrgPage() {
  useAdminPageTitle("Organization");
  const { profile } = useAuth();
  const toast = useToast();
  const location = useLocation();
  const inviteCardRef = useRef<HTMLDivElement | null>(null);

  const [organization, setOrganization] = useState<Organization | null>(null);
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [patientCount, setPatientCount] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [codeRevealed, setCodeRevealed] = useState(false);

  /* ---------------------------------- load ---------------------------------- */
  const orgId = profile?.org_id ?? null;
  const reload = useCallback(async () => {
    if (orgId == null) return;
    setLoadError(null);
    try {
      const [org, members, patients] = await Promise.all([
        getMyOrganization(orgId),
        listOrgMembers(orgId),
        countPatients(),
      ]);
      setOrganization(org);
      setMemberCount(members.length);
      setPatientCount(patients);
    } catch (cause) {
      console.error("[palse admin org]", cause);
      setLoadError(
        guide(cause, "Could not load your organization. Try again."),
      );
    }
  }, [orgId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  /* ------------------------ deep link: #invite-code ------------------------- */
  useEffect(() => {
    if (location.hash !== "#invite-code") return;
    // One frame after paint so the card is on screen before the browser's
    // native anchor behavior can snap to a not-yet-mounted position.
    const timer = window.setTimeout(() => {
      inviteCardRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 50);
    return () => window.clearTimeout(timer);
  }, [location.hash]);

  /* --------------------------------- rotate --------------------------------- */
  const [rotateOpen, setRotateOpen] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [rotateError, setRotateError] = useState<string | null>(null);

  async function handleRotate() {
    if (rotating) return;
    setRotating(true);
    setRotateError(null);
    try {
      await rotateInviteCode();
      await reload();
      setRotateOpen(false);
      toast.push(
        "success",
        "Invite code rotated — share the new code; the old one no longer works.",
      );
    } catch (cause) {
      console.error("[palse rotate invite]", cause);
      setRotateError(
        guide(cause, "Could not rotate the invite code. Try again."),
      );
    } finally {
      setRotating(false);
    }
  }

  const loading = organization == null && loadError == null;
  const code = organization?.invite_code ?? "";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Organization · Your institution"
        title="Organization"
        subtitle="The hospital record for your console, and the invite code that brings other administrators in."
      />

      {loadError ? <Notice tone="danger">{loadError}</Notice> : null}
      {rotateError ? <Notice tone="danger">{rotateError}</Notice> : null}

      {/* Hospital record ------------------------------------------------------ */}
      <Panel
        title="Hospital record"
        subtitle="Read-only registry data for your organization."
      >
        {loading ? (
          <div className="flex flex-col gap-3" aria-hidden="true">
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton key={index} className="h-9 w-full" />
            ))}
          </div>
        ) : organization == null ? (
          <Notice tone="warning">
            Your account isn&apos;t linked to an organization record right now.
            Contact a superadmin if you expect to see one here.
          </Notice>
        ) : (
          <div>
            <Record label="Name">{organization.name}</Record>
            <Record label="Created">
              {fullDate(organization.created_at)}{" "}
              <span className="text-theme-gray">
                (<RelativeTime iso={organization.created_at} />)
              </span>
            </Record>
            <Record label="Members">
              {memberCount == null ? "—" : memberCount}{" "}
              <span className="text-xs text-theme-gray">
                administrators and clinicians
              </span>
            </Record>
            <Record label="Patients">
              {patientCount == null ? "—" : patientCount}{" "}
              <span className="text-xs text-theme-gray">
                in the clinical registry
              </span>
            </Record>
            <Record label="Organization ID">
              <span className="inline-flex min-w-0 flex-wrap items-center gap-2">
                <code className="truncate rounded bg-theme-light-gray px-1.5 py-0.5 font-mono text-xs text-theme-ink-soft">
                  {organization.id}
                </code>
                <CopyButton value={organization.id} label="organization ID" />
              </span>
            </Record>
          </div>
        )}
      </Panel>

      {/* Invite code ---------------------------------------------------------- */}
      <div ref={inviteCardRef} id="invite-code" className="scroll-mt-24">
        <Panel
          title="Administrator invite code"
          subtitle="Administrators joining on their own enter this code during registration — it binds their account to this organization."
        >
          {loading ? (
            <Skeleton className="h-24 w-full" />
          ) : organization == null ? (
            <Notice tone="warning">
              Invite code is unavailable without an organization.
            </Notice>
          ) : (
            <>
              <div className="flex flex-col items-start gap-4 rounded-control border border-theme-line bg-theme-light-gray px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="text-xs font-semibold uppercase tracking-wider text-theme-gray">
                    Current code
                  </div>
                  <code
                    aria-label={
                      codeRevealed ? "Invite code" : "Invite code (hidden)"
                    }
                    className="mt-1 block font-mono text-lg font-bold tracking-[0.3em] text-theme-ink"
                  >
                    {codeRevealed ? code : "•".repeat(Math.max(6, code.length))}
                  </code>
                  <p className="mt-1 text-xs text-theme-gray">
                    Last rotated{" "}
                    {organization.updated_at ? (
                      <>
                        {fullDate(organization.updated_at)}{" "}
                        <span className="text-theme-gray/80">
                          (<RelativeTime iso={organization.updated_at} />)
                        </span>
                      </>
                    ) : (
                      "—"
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCodeRevealed((value) => !value)}
                    aria-pressed={codeRevealed}
                    className="inline-flex items-center gap-1.5 rounded-control border border-theme-line bg-white px-3.5 py-2 text-xs font-semibold text-theme-ink transition-colors hover:bg-theme-line/40"
                  >
                    <MsIcon
                      name={codeRevealed ? "visibility_off" : "visibility"}
                      className="text-[16px]"
                      optical={16}
                    />
                    {codeRevealed ? "Hide" : "Reveal"}
                  </button>
                  <CopyButton value={code} label="invite code" />
                  <PrimaryButton
                    type="button"
                    className="w-auto px-4 py-2 text-xs"
                    pending={rotating}
                    onClick={() => setRotateOpen(true)}
                  >
                    <MsIcon
                      name="autorenew"
                      className="text-[16px]"
                      optical={16}
                    />
                    Rotate code
                  </PrimaryButton>
                </div>
              </div>
              <p className="mt-3 flex items-start gap-2 text-xs text-theme-ink-soft">
                <MsIcon
                  name="info"
                  className="mt-0.5 shrink-0 text-[15px] text-theme-gray"
                  optical={14}
                />
                Only share the code through your hospital&apos;s channels —
                anyone holding it can register as an administrator here.
                Rotating stops the previous code immediately; accounts that
                already joined are unaffected.
              </p>
            </>
          )}
        </Panel>
      </div>

      {/* Tenant isolation callout --------------------------------------------- */}
      <div className="flex items-start gap-3 rounded-card border border-theme-maroon/20 bg-theme-cream p-5">
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-theme-maroon-soft text-theme-maroon"
        >
          <MsIcon name="shield" className="text-[20px]" optical={20} />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-theme-ink">
            Isolated by design
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-theme-ink-soft">
            Every query in this console and the clinical app is scoped through
            row-level security at the database: your organization&apos;s
            clinicians can only see your organization&apos;s patients,
            assessments and audit trail. No page, export or filter can cross
            into another hospital&apos;s records.
          </p>
          <Badge tone="maroon" className="mt-3" icon="verified_user">
            Enforced server-side on every request
          </Badge>
        </div>
      </div>

      {/* Danger zone (placeholder — no backend support yet) -------------------- */}
      <Panel
        title="Danger zone"
        subtitle="Deletion and transfer of organizations is reserved for superadmins."
      >
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-risk-high-fg/25 bg-risk-high-bg/50 px-4 py-3.5">
          <div>
            <p className="text-sm font-semibold text-risk-high-fg">
              Delete this organization
            </p>
            <p className="text-xs text-theme-ink-soft">
              Removes all patients, assessments and members. Irreversible.
            </p>
          </div>
          <span title="Contact a superadmin — organization deletion isn't available in the console.">
            <PrimaryButton
              type="button"
              className="w-auto px-4 bg-risk-high-fg hover:bg-risk-high-fg/85"
              disabled
              aria-disabled
              onClick={undefined}
            >
              Delete organization
            </PrimaryButton>
          </span>
        </div>
      </Panel>

      {rotateOpen ? (
        <ConfirmDialog
          title="Rotate the invite code?"
          question="The current code stops working immediately. Administrators who already joined keep their access, but anyone mid-signup with the old code will need the new one."
          confirmLabel="Rotate code"
          destructive
          pending={rotating}
          onConfirm={() => void handleRotate()}
          onCancel={() => setRotateOpen(false)}
        />
      ) : null}
    </div>
  );
}

/** Small key/value row for the hospital record grid. */

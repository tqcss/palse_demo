import { useEffect, useState } from "react";

import Notice from "../../components/Notice.tsx";
import Panel from "../../components/Panel.tsx";
import PrimaryButton from "../../components/PrimaryButton.tsx";
import { useAuth } from "../../context/useAuth.ts";
import { guide } from "../../lib/authErrors.ts";
import { type Organization, getMyOrganization, rotateInviteCode } from "../../lib/admin.ts";

/**
 * Organization tab: the institution this admin belongs to and the invite code
 * other administrators need to join it.
 */
export default function AdminOrgPage() {
  const { profile } = useAuth();
  const orgId = profile?.org_id ?? null;

  const [organization, setOrganization] = useState<Organization | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [rotating, setRotating] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (orgId == null) return;
    let current = orgId;
    void getMyOrganization(orgId)
      .then((org) => {
        if (current !== orgId) return;
        setOrganization(org);
        if (org == null) {
          setLoadError("Could not load your organization. Contact a superadmin.");
        }
      })
      .catch((cause) => {
        console.error("[palse admin org]", cause);
        setLoadError(guide(cause, "Could not load your organization. Try again."));
      });
  }, [orgId]);

  function copyInviteCode() {
    if (organization == null) return;
    void navigator.clipboard.writeText(organization.invite_code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  async function handleRotate() {
    if (organization == null || rotating) return;
    const confirmed = window.confirm(
      "Rotate the invite code? The current code stops working immediately and you'll need to share the new one with administrators who still want to join.",
    );
    if (!confirmed) return;

    setRotating(true);
    setActionError(null);
    try {
      const nextCode = await rotateInviteCode();
      setOrganization({ ...organization, invite_code: nextCode });
    } catch (cause) {
      console.error("[palse rotate invite]", cause);
      setActionError(guide(cause, "Could not rotate the invite code. Try again."));
    } finally {
      setRotating(false);
    }
  }

  if (loadError != null) {
    return <Notice tone="danger">{loadError}</Notice>;
  }
  if (organization == null) {
    return <p className="text-sm text-theme-gray">Loading…</p>;
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-1.5">
        <p className="text-xs font-bold uppercase tracking-wide text-theme-maroon">
          Setup · Your institution
        </p>
        <h1 className="text-2xl font-bold text-theme-ink">Organization</h1>
      </header>

      {actionError ? <Notice tone="danger">{actionError}</Notice> : null}

      <Panel title="Hospital record">
        <dl className="grid gap-5 md:grid-cols-2">
          <div className="flex flex-col gap-1">
            <dt className="text-sm font-medium text-theme-gray">Name</dt>
            <dd className="text-sm text-theme-ink">{organization.name}</dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-sm font-medium text-theme-gray">Created</dt>
            <dd className="text-sm text-theme-ink-soft">
              {new Date(organization.created_at).toLocaleDateString()}
            </dd>
          </div>
        </dl>
        <p className="border-t border-theme-line pt-5 text-sm text-theme-gray">
          All members — clinicians and administrators — belong to exactly this
          one organization. Patients, assessments and vitals recorded here are
          never visible to any other organization, and vice versa.
        </p>
      </Panel>

      <Panel
        title="Invite code"
        subtitle="Share with an administrator of your hospital so they can join on /admin first-run setup."
      >
        <div className="flex flex-wrap items-center gap-3">
          <code
            aria-label="Organization invite code"
            className="rounded-lg border border-theme-line bg-theme-light-gray px-5 py-3 font-mono text-xl font-bold tracking-[0.25em] text-theme-ink"
          >
            {organization.invite_code}
          </code>
          <button
            type="button"
            onClick={copyInviteCode}
            className="rounded-lg border border-theme-line px-4 py-2.5 text-sm font-semibold text-theme-ink transition-colors hover:bg-theme-light-gray"
          >
            {copied ? "Copied!" : "Copy code"}
          </button>
        </div>
        <p className="text-sm text-theme-gray">
          Clinicians don&apos;t need this code — admins create their accounts. Only
          administrators use it, and they must first be confirmed by the superadmins.
        </p>

        <div className="flex items-center justify-between gap-4 border-t border-theme-line pt-5">
          <span className="text-xs text-theme-gray">
            Rotation invalidates the code above immediately.
          </span>
          <PrimaryButton
            className="w-auto px-5"
            pending={rotating}
            onClick={() => void handleRotate()}
          >
            Rotate invite code
          </PrimaryButton>
        </div>
      </Panel>
    </div>
  );
}

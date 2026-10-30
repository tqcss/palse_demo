import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import Modal from "../../components/Modal.tsx";
import MsIcon from "../../components/MsIcon.tsx";
import Notice from "../../components/Notice.tsx";
import Panel from "../../components/Panel.tsx";
import PrimaryButton from "../../components/PrimaryButton.tsx";
import FormInput from "../../components/FormInput.tsx";
import { useAuth } from "../../context/useAuth.ts";
import { guide } from "../../lib/authErrors.ts";
import { isEmailFormat } from "../../lib/validation.ts";
import {
  type CreateClinicianInput,
  type OrgMember,
  type PasswordResetRequest,
  createClinician,
  disableMember,
  enableMember,
  generateTempPassword,
  issueTempPassword,
  listOrgMembers,
  listPendingResetRequests,
} from "../../lib/admin.ts";

function memberName(member: OrgMember): string {
  return [member.first_name, member.last_name].filter((v) => v?.trim()).join(" ") || "Unknown";
}

interface IssuedPassword {
  email: string;
  password: string;
  purpose: "created" | "reset";
}

/**
 * Members tab of the admin console: clinicians of this organization, the
 * administrator tools over their accounts, and outstanding temporary-password
 * requests. All data reads are org-scoped by RLS; account writes go through
 * the admin-ops Edge Function.
 */
export default function AdminMembersPage() {
  const { profile } = useAuth();
  const orgId = profile?.org_id ?? null;

  const [members, setMembers] = useState<OrgMember[] | null>(null);
  const [requests, setRequests] = useState<PasswordResetRequest[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [createPending, setCreatePending] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [issued, setIssued] = useState<IssuedPassword | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (orgId == null) return;
    setLoadError(null);
    try {
      const [nextMembers, nextRequests] = await Promise.all([
        listOrgMembers(orgId),
        listPendingResetRequests(orgId),
      ]);
      setMembers(nextMembers);
      setRequests(nextRequests);
    } catch (cause) {
      console.error("[palse admin members]", cause);
      setLoadError(guide(cause, "Could not load members. Try again."));
    }
  }, [orgId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const memberById = useMemo(() => {
    const map = new Map<string, OrgMember>();
    for (const member of members ?? []) map.set(member.id, member);
    return map;
  }, [members]);

  const clinicians = useMemo(
    () => (members ?? []).filter((member) => member.role === "clinician"),
    [members],
  );

  async function runAccountOp(
    memberId: string,
    op: () => Promise<unknown>,
  ): Promise<boolean> {
    if (busyId != null) return false;
    setBusyId(memberId);
    setLoadError(null);
    try {
      await op();
      await reload();
      return true;
    } catch (cause) {
      setLoadError(guide(cause, "The action failed. Try again."));
      return false;
    } finally {
      setBusyId(null);
    }
  }

  function handleToggleDisable(member: OrgMember) {
    const op = member.status === "disabled" ? enableMember(member.id) : disableMember(member.id);
    void runAccountOp(member.id, () => op);
  }

  async function handleTempPassword(member?: OrgMember, requestId?: string) {
    const target = member ?? memberById.get(requestId ?? "") ?? null;
    if (target == null) return;
    const password = generateTempPassword();
    const ok = await runAccountOp(target.id, () =>
      issueTempPassword({
        clinicianId: member?.id,
        resetRequestId: requestId,
        tempPassword: password,
      }),
    );
    if (ok) {
      setIssued({
        email: target.email ?? memberName(target),
        password,
        purpose: "reset",
      });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1.5">
        <p className="text-xs font-bold uppercase tracking-wide text-theme-maroon">
          Members · Manage accounts
        </p>
        <h1 className="text-2xl font-bold text-theme-ink">Clinicians</h1>
        <p className="text-sm text-theme-gray">
          Everyone in your organization. Clinicians sign in with a temporary
          password you issue here, then set their own on first use.
        </p>
      </header>

      {loadError ? <Notice tone="danger">{loadError}</Notice> : null}

      {requests != null && requests.length > 0 ? (
        <Panel
          kicker="Attention"
          title={`Pending password requests (${requests.length})`}
          subtitle="Clinicians who lost access and asked for a temporary password."
        >
          <div className="flex flex-col gap-3">
            {requests.map((request) => {
              const member = memberById.get(request.clinician_id);
              return (
                <div
                  key={request.id}
                  className="flex items-center justify-between gap-4 rounded-lg border border-theme-line bg-theme-light-gray px-4 py-3"
                >
                  <div>
                    <div className="text-sm font-semibold text-theme-ink">
                      {member != null ? memberName(member) : "Clinician"}
                      <span className="ml-2 font-normal text-theme-gray">
                        {member?.email ?? ""}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-theme-gray">
                      Requested {new Date(request.created_at).toLocaleString()}
                      {request.note != null ? ` — “${request.note}”` : ""}
                    </div>
                  </div>
                  <PrimaryButton
                    className="w-auto px-4"
                    pending={busyId === request.clinician_id}
                    onClick={() => void handleTempPassword(undefined, request.id)}
                  >
                    Issue temp password
                  </PrimaryButton>
                </div>
              );
            })}
          </div>
        </Panel>
      ) : null}

      <Panel
        kicker="Directory"
        title="Organization members"
        subtitle={
          members == null
            ? "Loading…"
            : `${clinicians.length} clinician(s) of ${members.length} member(s)`
        }
      >
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => {
              setCreating(true);
              setCreateError(null);
            }}
            className="flex items-center gap-2 rounded-lg bg-theme-maroon px-4 py-2.5 text-sm font-semibold text-theme-white transition-colors hover:bg-theme-maroon-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-theme-maroon"
          >
            <MsIcon name="person_add" className="text-[18px]" optical={20} />
            Create clinician account
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-theme-line text-xs uppercase tracking-wide text-theme-gray">
                <th className="pb-2 pr-4 font-semibold">Member</th>
                <th className="pb-2 pr-4 font-semibold">Role</th>
                <th className="pb-2 pr-4 font-semibold">Status</th>
                <th className="pb-2 pr-4 font-semibold">Job title</th>
                <th className="pb-2 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-theme-line">
              {(members ?? []).map((member) => (
                <tr key={member.id}>
                  <td className="py-3 pr-4">
                    <div className="font-semibold text-theme-ink">{memberName(member)}</div>
                    <div className="text-xs text-theme-gray">{member.email}</div>
                  </td>
                  <td className="py-3 pr-4">
                    <span
                      className={[
                        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
                        member.role === "admin"
                          ? "bg-theme-maroon/10 text-theme-maroon"
                          : "bg-theme-light-gray text-theme-ink-soft",
                      ].join(" ")}
                    >
                      {member.role === "admin" ? "Admin" : "Clinician"}
                    </span>
                  </td>
                  <td className="py-3 pr-4">
                    <span className="inline-block text-xs font-medium text-theme-ink-soft">
                      {member.status === "active"
                        ? member.must_set_password
                          ? "Active — temp password issued"
                          : "Active"
                        : member.status.charAt(0).toUpperCase() + member.status.slice(1)}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-theme-ink-soft">
                    {[member.job_title, member.department].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td className="py-3">
                    {member.role === "clinician" && member.status === "active" ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={busyId != null}
                          onClick={() => void handleTempPassword(member)}
                          className="rounded-lg border border-theme-line px-3 py-1.5 text-xs font-semibold text-theme-ink transition-colors hover:bg-theme-light-gray disabled:opacity-50"
                        >
                          New temp password
                        </button>
                        <button
                          type="button"
                          disabled={busyId != null}
                          onClick={() => handleToggleDisable(member)}
                          className="rounded-lg border border-risk-moderate-fg/30 px-3 py-1.5 text-xs font-semibold text-risk-moderate-fg transition-colors hover:bg-risk-moderate-bg disabled:opacity-50"
                        >
                          Disable
                        </button>
                      </div>
                    ) : member.role === "clinician" && member.status === "disabled" ? (
                      <button
                        type="button"
                        disabled={busyId != null}
                        onClick={() => handleToggleDisable(member)}
                        className="rounded-lg border border-theme-line px-3 py-1.5 text-xs font-semibold text-theme-ink transition-colors hover:bg-theme-light-gray disabled:opacity-50"
                      >
                        Re-enable
                      </button>
                    ) : (
                      <span className="text-xs text-theme-gray">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {members != null && members.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-theme-gray">
                    No members yet — create the first clinician account above.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Panel>

      {creating ? (
        <CreateClinicianModal
          pending={createPending}
          error={createError}
          onClose={() => setCreating(false)}
          onSubmit={async (input) => {
            setCreatePending(true);
            setCreateError(null);
            try {
              await createClinician(input);
              await reload();
              setCreating(false);
              setIssued({ email: input.email, password: input.tempPassword, purpose: "created" });
            } catch (cause) {
              console.error("[palse create clinician]", cause);
              setCreateError(guide(cause, "Could not create the account. Try again."));
            } finally {
              setCreatePending(false);
            }
          }}
        />
      ) : null}

      {issued ? (
        <IssuedPasswordModal
          issued={issued}
          onClose={() => setIssued(null)}
        />
      ) : null}
    </div>
  );
}

/* ------------------------------ Subcomponents ------------------------------ */

function CreateClinicianModal({
  pending,
  error,
  onClose,
  onSubmit,
}: {
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (input: CreateClinicianInput) => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [department, setDepartment] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const tempPassword = useMemo(() => generateTempPassword(), []);

  const fieldErrors = {
    firstName:
      firstName.trim().length === 0
        ? "Enter the clinician's first name."
        : firstName.trim().length > 100
          ? "Maximum 100 characters."
          : null,
    lastName:
      lastName.trim().length === 0
        ? "Enter the clinician's last name."
        : lastName.trim().length > 100
          ? "Maximum 100 characters."
          : null,
    email:
      email.trim().length === 0
        ? "Enter the clinician's email address."
        : !isEmailFormat(email.trim())
          ? "Enter a valid email address."
          : null,
  };

  function valid(): boolean {
    return Object.values(fieldErrors).every((value) => value == null);
  }

  return (
    <Modal title="Create clinician account" onClose={onClose}>
      {error ? <Notice tone="danger" className="mb-4">{error}</Notice> : null}

      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (pending || !valid()) return;
          onSubmit({
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            email: email.trim(),
            department: department.trim() === "" ? null : department.trim(),
            jobTitle: jobTitle.trim() === "" ? null : jobTitle.trim(),
            tempPassword,
          });
        }}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormInput
            id="clinician-first-name"
            label="First name"
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            error={fieldErrors.firstName}
            disabled={pending}
          />
          <FormInput
            id="clinician-last-name"
            label="Last name"
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
            error={fieldErrors.lastName}
            disabled={pending}
          />
        </div>
        <FormInput
          id="clinician-email"
          label="Email address"
          hint="Used to sign in. The account is created pre-confirmed — no email is sent."
          type="email"
          autoComplete="off"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={fieldErrors.email}
          disabled={pending}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormInput
            id="clinician-department"
            label="Department (optional)"
            placeholder="e.g. Neonatology"
            value={department}
            onChange={(event) => setDepartment(event.target.value)}
            disabled={pending}
          />
          <FormInput
            id="clinician-job-title"
            label="Job title (optional)"
            placeholder="e.g. Nurse"
            value={jobTitle}
            onChange={(event) => setJobTitle(event.target.value)}
            disabled={pending}
          />
        </div>

        <div className="rounded-lg border border-theme-line bg-theme-light-gray px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-theme-gray">
            Temporary password
          </div>
          <div className="mt-1 flex items-center justify-between gap-3">
            <code
              aria-label="Temporary password"
              className="min-w-0 break-all font-mono text-sm font-semibold text-theme-ink"
            >
              {tempPassword}
            </code>
            <button
              type="button"
              onClick={() => void navigator.clipboard.writeText(tempPassword)}
              className="shrink-0 text-xs font-semibold text-theme-maroon underline-offset-4 hover:underline"
            >
              Copy
            </button>
          </div>
          <p className="mt-2 text-xs text-theme-gray">
            Hand this over yourself (in person or via your hospital&apos;s secure
            channel). The clinician sets a new password on first sign-in.
          </p>
        </div>

        <PrimaryButton pending={pending}>
          Create account
        </PrimaryButton>
      </form>
    </Modal>
  );
}

function IssuedPasswordModal({
  issued,
  onClose,
}: {
  issued: IssuedPassword;
  onClose: () => void;
}) {
  const headline = issued.purpose === "created"
    ? "Account created"
    : "Temporary password issued";

  return (
    <Modal title={headline} onClose={onClose}>
      <Notice tone="warning" className="mb-4">
        Show this password once, then it&apos;s gone — it is not stored anywhere
        and cannot be recovered.
      </Notice>
      <p className="mb-3 text-sm text-theme-gray">
        Temporary password for{" "}
        <strong className="text-theme-ink">{issued.email}</strong>:
      </p>
      <div className="flex items-center justify-between gap-3 rounded-lg border border-theme-line bg-theme-light-gray px-4 py-3">
        <code aria-label="Temporary password" className="min-w-0 break-all font-mono text-sm font-bold text-theme-ink">
          {issued.password}
        </code>
        <button
          type="button"
          onClick={() => void navigator.clipboard.writeText(issued.password)}
          className="shrink-0 text-xs font-semibold text-theme-maroon underline-offset-4 hover:underline"
        >
          Copy
        </button>
      </div>
      <p className="mt-4 text-sm text-theme-gray">
        The clinician signs in with this password and is immediately asked to set
        a new one. See the <Link to="/admin/audit" className="font-semibold text-theme-maroon underline-offset-4 hover:underline">audit log</Link> for a record of
        the account change.
      </p>
      <div className="mt-5 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-theme-line px-4 py-2 text-sm font-semibold text-theme-ink transition-colors hover:bg-theme-light-gray"
        >
          Done
        </button>
      </div>
    </Modal>
  );
}

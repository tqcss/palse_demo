import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useBlocker, useSearchParams } from "react-router-dom";

import Modal from "../../components/Modal.tsx";
import MsIcon from "../../components/MsIcon.tsx";
import Notice from "../../components/Notice.tsx";
import Panel from "../../components/Panel.tsx";
import FormInput from "../../components/FormInput.tsx";
import PrimaryButton from "../../components/PrimaryButton.tsx";
import Avatar from "../../components/ui/Avatar.tsx";
import Badge from "../../components/ui/Badge.tsx";
import ConfirmDialog from "../../components/ConfirmDialog.tsx";
import CopyButton from "../../components/ui/CopyButton.tsx";
import EmptyState from "../../components/ui/EmptyState.tsx";
import FilterChips from "../../components/ui/FilterChips.tsx";
import KebabMenu, { type KebabAction } from "../../components/ui/KebabMenu.tsx";
import PageHeader from "../../components/ui/PageHeader.tsx";
import Pagination from "../../components/ui/Pagination.tsx";
import { SkeletonRows } from "../../components/ui/Skeleton.tsx";
import RelativeTime from "../../components/ui/RelativeTime.tsx";
import { useToast } from "../../components/ui/toast.tsx";
import { useAuth } from "../../context/useAuth.ts";
import { useAdminPageTitle } from "../../hooks/useAdminPageTitle.ts";
import { guide } from "../../lib/authErrors.ts";
import { isEmailFormat } from "../../lib/validation.ts";
import {
  type CreateClinicianInput,
  type OrgMember,
  type PasswordResetRequest,
  createClinician,
  disableMember,
  dismissResetRequest,
  enableMember,
  generateTempPassword,
  issueTempPassword,
  listOrgMembers,
  listPendingResetRequests,
  updateMember,
} from "../../lib/admin.ts";

const PAGE_SIZE = 10;

type MemberSort = "name_asc" | "name_desc" | "created_asc" | "created_desc";

/** Status filter keys (URL) mapped against member + pending-request state. */
type StatusKey = "all" | "active" | "suspended" | "first_login" | "reset_requested";

function memberName(member: OrgMember): string {
  return [member.first_name, member.last_name].filter((v) => v?.trim()).join(" ") || "Unknown";
}

interface IssuedPassword {
  email: string;
  password: string;
  purpose: "created" | "reset";
}

/**
 * Members console: the organization's roster, the administrator-account tools
 * (create, edit, temp passwords, suspend) and outstanding reset requests.
 * Reads are org-scoped by RLS; account writes go through admin-ops. Filters,
 * sorting and pagination live in the URL, so Back/Forward/refresh and shared
 * links restore the exact view.
 */
export default function AdminMembersPage() {
  useAdminPageTitle("Members");
  const { profile } = useAuth();
  const orgId = profile?.org_id ?? null;
  const toast = useToast();

  const [searchParams, setSearchParams] = useSearchParams();

  const [members, setMembers] = useState<OrgMember[] | null>(null);
  const [requests, setRequests] = useState<PasswordResetRequest[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [issued, setIssued] = useState<IssuedPassword | null>(null);

  /* ------------------------------ URL state -------------------------------- */
  const q = searchParams.get("q") ?? "";
  const role = searchParams.get("role") === "admin" ? "admin" : searchParams.get("role") === "clinician" ? "clinician" : "all";
  const statusKey = (["all", "active", "suspended", "first_login", "reset_requested"] as const)
    .includes(searchParams.get("status") as StatusKey)
    ? (searchParams.get("status") as StatusKey)
    : "all";
  const sort = (["name_asc", "name_desc", "created_asc", "created_desc"] as const)
    .includes(searchParams.get("sort") as MemberSort)
    ? (searchParams.get("sort") as MemberSort)
    : "created_desc";
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);

  /** Debounced mirror of `q` for the search input while typing (replace). */
  const [searchDraft, setSearchDraft] = useState(q);
  useEffect(() => setSearchDraft(q), [q]);

  const patchParams = useCallback(
    (patch: Record<string, string | null>, mode: "replace" | "push") => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          for (const [key, value] of Object.entries(patch)) {
            if (value == null || value === "" || value === "all") next.delete(key);
            else next.set(key, value);
          }
          // Filter/sort changes (replace mode without an explicit page) reset
          // pagination; explicit page changes keep it.
          if (mode === "replace" && patch.page == null && patch.sort == null) {
            next.delete("page");
          }
          return next;
        },
        { replace: mode === "replace" },
      );
    },
    [setSearchParams],
  );

  /* ------------------------------ data reload ------------------------------ */
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

  const requestedIds = useMemo(
    () => new Set((requests ?? []).map((request) => request.clinician_id)),
    [requests],
  );

  /* -------------------------- manage-create URL flag ------------------------ */
  const createOpen = searchParams.get("create") === "1";

  /* ------------------------------- filtering -------------------------------- */
  const filtered = useMemo(() => {
    let list = members ?? [];

    if (q.trim() !== "") {
      const needle = q.trim().toLowerCase();
      list = list.filter((member) =>
        memberName(member).toLowerCase().includes(needle) ||
        (member.email ?? "").toLowerCase().includes(needle),
      );
    }
    if (role !== "all") {
      list = list.filter((member) => member.role === role);
    }
    switch (statusKey) {
      case "active": list = list.filter((member) => member.status === "active"); break;
      case "suspended": list = list.filter((member) => member.status === "disabled"); break;
      case "first_login":
        list = list.filter((member) => member.status === "active" && member.must_set_password);
        break;
      case "reset_requested":
        list = list.filter((member) => requestedIds.has(member.id));
        break;
      default: break;
    }

    const sorted = [...list];
    sorted.sort((a, b) => {
      switch (sort) {
        case "name_asc": return memberName(a).localeCompare(memberName(b));
        case "name_desc": return memberName(b).localeCompare(memberName(a));
        case "created_asc": return a.created_at.localeCompare(b.created_at);
        default: return b.created_at.localeCompare(a.created_at);
      }
    });
    return sorted;
  }, [members, q, role, statusKey, sort, requestedIds]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const rows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  /* -------------------------------- actions --------------------------------- */
  async function runAccountOp(memberId: string, op: () => Promise<unknown>): Promise<boolean> {
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

  async function handleIssuePassword(member?: OrgMember, requestId?: string) {
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
      setIssued({ email: target.email ?? memberName(target), password, purpose: "reset" });
      toast.push("success", `Temporary password issued for ${target.email ?? memberName(target)}.`);
    }
  }

  async function handleDismissRequest(request: PasswordResetRequest) {
    if (busyId != null) return;
    setBusyId(request.id);
    try {
      await dismissResetRequest(request.id);
      await reload();
      toast.push("info", "Reset request dismissed.");
    } catch (cause) {
      console.error("[palse dismiss reset]", cause);
      setLoadError(guide(cause, "Could not dismiss the request. Try again."));
    } finally {
      setBusyId(null);
    }
  }

  async function handleToggleDisable(member: OrgMember) {
    const op = member.status === "disabled" ? enableMember(member.id) : disableMember(member.id);
    const ok = await runAccountOp(member.id, () => op);
    if (ok) {
      toast.push(
        "success",
        member.status === "disabled"
          ? `${memberName(member)} re-enabled.`
          : `${memberName(member)} suspended.`,
      );
    }
  }

  async function handleUpdateDetails(member: OrgMember, patch: {
    firstName: string;
    lastName: string;
    department: string;
    jobTitle: string;
  }): Promise<boolean> {
    if (busyId != null) return false;
    setBusyId(member.id);
    try {
      await updateMember(member.id, {
        firstName: patch.firstName,
        lastName: patch.lastName,
        department: patch.department.trim() === "" ? null : patch.department.trim(),
        jobTitle: patch.jobTitle.trim() === "" ? null : patch.jobTitle.trim(),
      });
      await reload();
      toast.push("success", "Member details saved.");
      return true;
    } catch (cause) {
      console.error("[palse update member]", cause);
      setLoadError(guide(cause, "Could not save the details. Try again."));
      return false;
    } finally {
      setBusyId(null);
    }
  }
  /* ------------------------------- kebab items ------------------------------- */
  function kebabFor(member: OrgMember): KebabAction[] {
    const notClinician = {
      id: "not-clinician",
      label: "Managed by superadmins",
      disabled: true,
      disabledReason: "Administrators and memberships are managed by the superadmins.",
      onSelect: () => {},
    } satisfies KebabAction;
    if (member.role !== "clinician") return [notClinician];

    const selfGuard = member.id === profile?.id
      ? {
          id: "self-guard",
          label: "You are this account",
          disabled: true,
          disabledReason: "Sign-in security applies to your own account too.",
          onSelect: () => {},
        } satisfies KebabAction
      : null;
    if (member.id === profile?.id) return [selfGuard as KebabAction];

    return [
      { id: "edit", label: "Edit details", icon: "edit", onSelect: () => setEditing(member) },
      {
        id: "temp-password",
        label: "Issue temporary password",
        icon: "key",
        disabled: member.status === "disabled",
        disabledReason: "Re-enable the account before issuing a password.",
        onSelect: () => setConfirmIssue(member),
      },
      {
        id: "resend",
        label: "Send new credentials",
        icon: "forward_to_inbox",
        disabled: member.status === "disabled",
        disabledReason: "Re-enable the account before issuing a password.",
        onSelect: () => setConfirmIssue(member),
      },
      member.status === "disabled"
        ? {
            id: "reactivate",
            label: "Reactivate account",
            icon: "person_check",
            onSelect: () => setConfirmToggle(member),
          }
        : {
            id: "suspend",
            label: "Suspend account",
            icon: "person_cancel",
            destructive: true,
            onSelect: () => setConfirmToggle(member),
          },
    ];
  }

  /* Debounced search input */
  const searchDebounce = useRef(0);

  /* ------------------------------- confirm state ------------------------------ */
  const [confirmIssue, setConfirmIssue] = useState<OrgMember | null>(null);
  const [confirmRequest, setConfirmRequest] = useState<PasswordResetRequest | null>(null);
  const [confirmToggle, setConfirmToggle] = useState<OrgMember | null>(null);
  const [confirmDismiss, setConfirmDismiss] = useState<PasswordResetRequest | null>(null);
  const [editing, setEditing] = useState<OrgMember | null>(null);

  /* ---------------------------------- render --------------------------------- */
  const loading = members == null || requests == null;
  const memberCount = members?.length ?? 0;
  const clinicianCount = (members ?? []).filter((member) => member.role === "clinician").length;
  const adminCount = (members ?? []).filter((member) => member.role === "admin").length;
  const plural = (value: number, word: string) =>
    `${value} ${word}${value === 1 ? "" : "s"}`;

  const activeFilters = useMemo(() => {
    const chips: Array<{ id: string; label: string; clear: Record<string, null> }> = [];
    if (q.trim() !== "") chips.push({ id: "q", label: `Search: “${q.trim()}”`, clear: { q: null } });
    if (role !== "all") {
      chips.push({ id: "role", label: role === "admin" ? "Role: Admin" : "Role: Clinician", clear: { role: null } });
    }
    if (statusKey !== "all") {
      chips.push({ id: "status", label: StatusLabels[statusKey], clear: { status: null } });
    }
    return chips;
  }, [q, role, statusKey]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Members · Manage accounts"
        title="Members"
        subtitle="Everyone in your organization. Clinicians sign in with a temporary password you issue here, then set their own on first use."
        actions={
          <PrimaryButton
            type="button"
            className="w-auto px-4"
            onClick={() => patchParams({ create: "1" }, "push")}
          >
            <MsIcon name="person_add" className="text-[18px]" optical={20} />
            Create clinician account
          </PrimaryButton>
        }
      />

      {loadError ? <Notice tone="danger">{loadError}</Notice> : null}

      {/* Outstanding password-reset requests */}
      {requests != null && requests.length > 0 ? (
        <section className="rounded-card border border-theme-maroon/30 bg-theme-cream p-5 shadow-card">
          <header className="mb-3 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-theme-maroon-soft text-theme-maroon">
              <MsIcon name="key" className="text-[18px]" optical={18} />
            </span>
            <h2 className="text-sm font-bold text-theme-ink">
              Password reset requests
              <span className="ml-2 rounded-full bg-theme-maroon px-2 py-0.5 text-[11px] font-bold text-white">
                {requests.length}
              </span>
            </h2>
          </header>
          <ul className="flex flex-col divide-y divide-theme-line">
            {requests.map((request) => {
              const member = memberById.get(request.clinician_id);
              return (
                <li
                  key={request.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-1 last:pb-1"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-theme-ink">
                      {member != null ? memberName(member) : "Clinician"}
                      <span className="ml-2 font-normal text-theme-gray">
                        {member?.email ?? ""}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-theme-ink-soft">
                      Requested <RelativeTime iso={request.created_at} />
                      {request.note != null ? ` — “${request.note}”` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={busyId != null}
                      onClick={() => setConfirmDismiss(request)}
                      className="rounded-control border border-theme-line bg-white px-3 py-1.5 text-xs font-semibold text-theme-ink transition-colors hover:bg-theme-light-gray disabled:opacity-50"
                    >
                      Dismiss
                    </button>
                    <PrimaryButton
                      className="w-auto px-4 py-1.5 text-xs"
                      pending={busyId === request.id}
                      onClick={() => setConfirmRequest(request)}
                    >
                      Issue temporary password
                    </PrimaryButton>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {/* Member list card */}
      <Panel
        title="Directory"
        subtitle={loading
          ? "Loading…"
          : `${plural(memberCount, "member")} · ${plural(clinicianCount, "clinician")} · ${plural(adminCount, "administrator")}`}
      >
        {/* Toolbar: search / role / status / clear */}
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div className="w-64 min-w-0">
            <FormInput
              id="members-q"
              label="Search"
              hintClass="hidden"
              placeholder="Name or email…"
              value={searchDraft}
              onChange={(event) => {
                const value = event.target.value;
                setSearchDraft(value);
                window.clearTimeout(searchDebounce.current);
                searchDebounce.current = window.setTimeout(
                  () => patchParams({ q: value.trim() === "" ? null : value.trim() }, "replace"),
                  250,
                );
              }}
            />
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-theme-gray">Role</span>
            <select
              value={role}
              onChange={(event) => patchParams({ role: event.target.value }, "replace")}
              className="w-40 rounded-control border border-theme-line bg-white px-3 py-2 text-sm text-theme-ink focus:outline-none focus:ring-2 focus:ring-theme-maroon/25"
            >
              <option value="all">All</option>
              <option value="admin">Admin</option>
              <option value="clinician">Clinician</option>
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-theme-gray">Status</span>
            <select
              value={statusKey}
              onChange={(event) => patchParams({ status: event.target.value }, "replace")}
              className="w-52 rounded-control border border-theme-line bg-white px-3 py-2 text-sm text-theme-ink focus:outline-none focus:ring-2 focus:ring-theme-maroon/25"
            >
              {(Object.keys(StatusLabels) as Array<StatusKey>).map((key) => (
                <option key={key} value={key}>{StatusLabels[key]}</option>
              ))}
            </select>
          </label>

          {activeFilters.length > 0 ? (
            <button
              type="button"
              onClick={() => patchParams({ q: null, role: null, status: null }, "push")}
              className="px-3 py-2 text-xs font-semibold text-theme-maroon underline-offset-4 hover:underline"
            >
              Clear filters
            </button>
          ) : null}
        </div>

        {activeFilters.length > 0 ? (
          <div className="mb-4">
            <FilterChips
              filters={activeFilters.map((chip) => ({
                id: chip.id,
                label: chip.label,
                onRemove: () => patchParams(chip.clear, "push"),
              }))}
            />
          </div>
        ) : null}

        {loading ? (
          <SkeletonRows rows={4} />
        ) : members!.length === 0 ? (
          <EmptyState
            illustrated
            icon="group_add"
            title="No clinicians yet"
            body="Create the first clinician account — they sign in with the temporary password you hand over, then set their own."
            action={
              <PrimaryButton type="button" className="w-auto" onClick={() => patchParams({ create: "1" }, "push")}>
                <MsIcon name="person_add" className="text-[18px]" optical={20} />
                Create clinician account
              </PrimaryButton>
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="person_search"
            title="No members match these filters"
            body="Nobody in your organization fits the current combination. Clear a filter or two to widen the search."
            action={
              <button
                type="button"
                onClick={() => patchParams({ q: null, role: null, status: null }, "push")}
                className="rounded-control border border-theme-line bg-white px-4 py-2 text-sm font-semibold text-theme-ink transition-colors hover:bg-theme-light-gray"
              >
                Clear filters
              </button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-theme-line text-xs uppercase tracking-wider text-theme-gray">
                  <SortableTh label="Member" column="name" sort={sort} onChange={(next) => patchParams({ sort: next }, "push")} />
                  <th className="pb-2 pr-4 font-semibold">Role</th>
                  <th className="pb-2 pr-4 font-semibold">Status</th>
                  <th className="pb-2 pr-4 font-semibold">Job title</th>
                  <SortableTh label="Joined" column="created" sort={sort} onChange={(next) => patchParams({ sort: next }, "push")} />
                  <th className="pb-2 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-theme-line">
                {rows.map((member) => (
                  <tr key={member.id} className="transition-colors hover:bg-theme-cream/40">
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-3">
                        <Avatar first={member.first_name} last={member.last_name} size="sm" />
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-theme-ink">{memberName(member)}</div>
                          <div className="truncate text-xs text-theme-gray">{member.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      {member.role === "admin"
                        ? <Badge tone="maroon" icon="shield">Admin</Badge>
                        : <Badge icon="stethoscope">Clinician</Badge>}
                    </td>
                    <td className="py-3 pr-4"><StatusBadge member={member} requested={requestedIds.has(member.id)} /></td>
                    <td className="py-3 pr-4 text-theme-ink-soft">
                      {[member.job_title, member.department].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td className="py-3 pr-4 text-theme-gray">
                      <RelativeTime iso={member.created_at} />
                    </td>
                    <td className="py-3 text-right">
                      <KebabMenu items={kebabFor(member)} busy={busyId != null && busyId !== member.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {filtered.length > PAGE_SIZE ? (
          <div className="mt-4">
            <Pagination page={safePage} pageCount={pageCount} onChange={(next) => patchParams({ page: String(next) }, "push")} />
          </div>
        ) : null}
      </Panel>

  /* Modal stack ------------------------------------------------------------ */
  {createOpen ? (
    <CreateClinicianModal
      onClose={() => patchParams({ create: null }, "push")}
      onSubmit={async (input) => {
        setLoadError(null);
        try {
          await createClinician(input);
          await reload();
          patchParams({ create: null }, "push");
          setIssued({ email: input.email, password: input.tempPassword, purpose: "created" });
          toast.push("success", "Clinician account created.");
        } catch (cause) {
          console.error("[palse create clinician]", cause);
          // surfaced inside the modal
          throw cause instanceof Error ? cause : new Error("Could not create the account.");
        }
      }}
    />
  ) : null}

      {confirmRequest != null ? (
        <ConfirmDialog
          title="Issue a temporary password?"
          question={`The request for ${memberById.get(confirmRequest.clinician_id)?.email ?? "this clinician"} resolves with a new temporary password. Their old password stops working immediately.`}
          confirmLabel="Issue password"
          pending={busyId === confirmRequest.id}
          onConfirm={async () => {
            const request = confirmRequest;
            setConfirmRequest(null);
            await handleIssuePassword(undefined, request.id);
          }}
          onCancel={() => setConfirmRequest(null)}
        />
      ) : null}

      {editing != null ? (
        <EditDetailsModal
          member={editing}
          pending={busyId === editing.id}
          onClose={() => setEditing(null)}
          onSubmit={async (patch) => {
            const ok = await handleUpdateDetails(editing, patch);
            if (ok) setEditing(null);
          }}
        />
      ) : null}

      {confirmIssue != null ? (
        <ConfirmDialog
          title={confirmIssue.must_set_password ? "Re-issue credentials?" : "Issue a temporary password?"}
          question={`${memberName(confirmIssue)} (${confirmIssue.email}) receives a new temporary password on issue. Any outstanding reset request resolves together with it and their previous password stops working immediately.`}
          confirmLabel="Issue password"
          pending={busyId === confirmIssue.id}
          onConfirm={async () => {
            const member = confirmIssue;
            setConfirmIssue(null);
            await handleIssuePassword(member);
          }}
          onCancel={() => setConfirmIssue(null)}
        />
      ) : null}

      {confirmToggle != null ? (
        <ConfirmDialog
          title={confirmToggle.status === "disabled" ? "Reactivate account?" : "Suspend account?"}
          question={
            confirmToggle.status === "disabled"
              ? `${memberName(confirmToggle)} can sign in again immediately after this. Open sessions stay usable.`
              : `${memberName(confirmToggle)} (${confirmToggle.email}) loses app access immediately: sign-in is blocked and open sessions are revoked. Their charted work stays untouched.`
          }
          confirmLabel={confirmToggle.status === "disabled" ? "Reactivate" : "Suspend"}
          destructive={confirmToggle.status !== "disabled"}
          pending={busyId === confirmToggle.id}
          onConfirm={async () => {
            const member = confirmToggle;
            setConfirmToggle(null);
            await handleToggleDisable(member);
          }}
          onCancel={() => setConfirmToggle(null)}
        />
      ) : null}

      {confirmDismiss != null ? (
        <ConfirmDialog
          title="Dismiss reset request?"
          question="The request is marked dismissed without changing this clinician's password. They can ask again at any time."
          confirmLabel="Dismiss request"
          pending={busyId === confirmDismiss.id}
          onConfirm={async () => {
            const request = confirmDismiss;
            setConfirmDismiss(null);
            await handleDismissRequest(request);
          }}
          onCancel={() => setConfirmDismiss(null)}
        />
      ) : null}

      {issued != null ? (
        <IssuedPasswordModal issued={issued} onClose={() => setIssued(null)} />
      ) : null}
    </div>
  );
}

/* -------------------------------- shared bits ------------------------------- */

const StatusLabels: Record<StatusKey, string> = {
  all: "All",
  active: "Active",
  suspended: "Suspended",
  first_login: "Pending first sign-in",
  reset_requested: "Reset requested",
};

function StatusBadge({ member, requested }: { member: OrgMember; requested: boolean }) {
  if (member.status === "disabled") {
    return <Badge tone="danger" icon="person_cancel">Suspended</Badge>;
  }
  if (member.must_set_password) {
    return <Badge tone="warning" icon="key">Pending first sign-in</Badge>;
  }
  if (requested) {
    return <Badge tone="warning" icon="support_agent">Reset requested</Badge>;
  }
  return <Badge tone="success" icon="check_circle">Active</Badge>;
}

const SortIndicator = ({ active, ascending }: { active: boolean; ascending: boolean }) => (
  <MsIcon
    name={active ? (ascending ? "arrow_upward" : "arrow_downward") : "unfold_more"}
    className={`text-[14px] ${active ? "text-theme-maroon" : "text-theme-gray"}`}
    optical={14}
  />
);

function SortableTh({
  label,
  column,
  sort,
  onChange,
}: {
  label: string;
  column: "name" | "created";
  sort: MemberSort;
  onChange: (next: MemberSort) => void;
}) {
  const active = sort.startsWith(column + "_");
  const ascending = active ? sort.endsWith("_asc") : column === "name";
  return (
    <th className="pb-2 pr-4 font-semibold">
      <button
        type="button"
        onClick={() => onChange(
          active
            ? (ascending ? (`${column}_desc` as MemberSort) : (`${column}_asc` as MemberSort))
            : (`${column}_asc` as MemberSort),
        )}
        className="inline-flex items-center gap-1 uppercase tracking-wider transition-colors hover:text-theme-ink"
      >
        {label}
        <SortIndicator active={active} ascending={ascending} />
      </button>
    </th>
  );
}

/* --------------------------------- create ---------------------------------- */

function CreateClinicianModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (input: CreateClinicianInput) => Promise<void>;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [department, setDepartment] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [tempPassword, setTempPassword] = useState(() => generateTempPassword());
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const dirty = firstName.trim() !== "" || lastName.trim() !== "" || email.trim() !== "" ||
    department.trim() !== "" || jobTitle.trim() !== "";

  // Leaving the console (Back / any link) with a dirty_CREATE form asks first.
  const blocker = useBlocker(dirty);
  const [confirmClose, setConfirmClose] = useState(false);

  function requestClose() {
    if (dirty) {
      setConfirmClose(true);
      return;
    }
    onClose();
  }

  const fieldErrors = {
    firstName: firstName.trim().length === 0
      ? "Enter the clinician's first name."
      : firstName.trim().length > 100
        ? "Maximum 100 characters."
        : null,
    lastName: lastName.trim().length === 0
      ? "Enter the clinician's last name."
      : lastName.trim().length > 100
        ? "Maximum 100 characters."
        : null,
    email: email.trim().length === 0
      ? "Enter the clinician's email address."
      : !isEmailFormat(email.trim())
        ? "Enter a valid email address."
        : null,
  };

  function valid(): boolean {
    return Object.values(fieldErrors).every((value) => value == null);
  }

  return (
    <Modal
      title="Create clinician account"
      subtitle="The account is created pre-confirmed — no email is sent to the clinician."
      onClose={requestClose}
    >
      {error ? null : null}

      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={async (event) => {
          event.preventDefault();
          if (pending || !valid()) return;
          setPending(true);
          setError(null);
          try {
            await onSubmit({
              firstName: firstName.trim(),
              lastName: lastName.trim(),
              email: email.trim(),
              department: department.trim() === "" ? null : department.trim(),
              jobTitle: jobTitle.trim() === "" ? null : jobTitle.trim(),
              tempPassword,
            });
          } catch (caught) {
            setError(typeof caught === "string" ? caught : guide(new Error("Failed"), "Could not create the account."));
          } finally {
            setPending(false);
          }
        }}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormInput id="clinician-first-name" label="First name" required value={firstName}
            onChange={(event) => setFirstName(event.target.value)} error={fieldErrors.firstName} disabled={pending} />
          <FormInput id="clinician-last-name" label="Last name" required value={lastName}
            onChange={(event) => setLastName(event.target.value)} error={fieldErrors.lastName} disabled={pending} />
        </div>
        <FormInput id="clinician-email" label="Email address" required hint="Used to sign in." type="email"
          autoComplete="off" value={email} onChange={(event) => setEmail(event.target.value)}
          error={fieldErrors.email} disabled={pending} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormInput id="clinician-department" label="Department (optional)" placeholder="e.g. Neonatology"
            value={department} onChange={(event) => setDepartment(event.target.value)} disabled={pending} />
          <FormInput id="clinician-job-title" label="Job title (optional)" placeholder="e.g. Nurse"
            value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} disabled={pending} />
        </div>

        <div className="rounded-control border border-theme-line bg-theme-light-gray px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-theme-gray">
            Temporary password
          </div>
          <div className="mt-1 flex items-center justify-between gap-3">
            <code
              aria-label="Temporary password"
              className="min-w-0 break-all font-mono text-sm font-semibold tracking-wide text-theme-ink"
            >
              {tempPassword}
            </code>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="rounded-md p-1.5 text-theme-gray transition-colors hover:bg-theme-line/50 hover:text-theme-ink"
              >
                <MsIcon name={showPassword ? "visibility_off" : "visibility"} className="text-[18px]" optical={18} />
              </button>
              <button
                type="button"
                onClick={() => {
                  setTempPassword(generateTempPassword());
                  toast.push("info", "New temporary password generated.");
                }}
                aria-label="Regenerate temporary password"
                className="rounded-md p-1.5 text-theme-gray transition-colors hover:bg-theme-line/50 hover:text-theme-ink"
              >
                <MsIcon name="refresh" className="text-[18px]" optical={18} />
              </button>
              <CopyButton value={tempPassword} label="password" />
            </div>
          </div>
          <p className="mt-2 text-xs text-theme-ink-soft">
            Hand this over yourself (in person or via your hospital&apos;s secure
            channel). The clinician sets a new password on first sign-in — this
            one stops working after that.
          </p>
        </div>

        {error != null ? <Notice tone="danger">{error}</Notice> : null}

        <div className="flex justify-end gap-3 border-t border-theme-line pt-4">
          <button
            type="button"
            onClick={requestClose}
            disabled={pending}
            className="rounded-control border border-theme-line px-4 py-2 text-sm font-semibold text-theme-ink transition-colors hover:bg-theme-light-gray disabled:opacity-60"
          >
            Cancel
          </button>
          <PrimaryButton pending={pending}>Create account</PrimaryButton>
        </div>
      </form>

      {confirmClose ? (
        <ConfirmDialog
          title="Discard this clinician?"
          question="The form has unsaved details. Closing now discards them."
          confirmLabel="Discard"
          destructive
          onConfirm={() => {
            setConfirmClose(false);
            onClose();
          }}
          onCancel={() => setConfirmClose(false)}
        />
      ) : null}

      {blocker.state === "blocked" ? (
        <ConfirmDialog
          title="Leave with unsaved details?"
          question="You started entering clinician details. Leaving now discards them."
          confirmLabel="Discard changes"
          destructive
          onConfirm={() => blocker.proceed()}
          onCancel={() => blocker.reset()}
        />
      ) : null}
    </Modal>
  );
}

/* ------------------------------ edit details -------------------------------- */

function EditDetailsModal({
  member,
  pending,
  onClose,
  onSubmit,
}: {
  member: OrgMember;
  pending: boolean;
  onClose: () => void;
  onSubmit: (patch: { firstName: string; lastName: string; department: string; jobTitle: string }) => Promise<void>;
}) {
  const [firstName, setFirstName] = useState(member.first_name);
  const [lastName, setLastName] = useState(member.last_name);
  const [department, setDepartment] = useState(member.department ?? "");
  const [jobTitle, setJobTitle] = useState(member.job_title ?? "");
  const [error, setError] = useState<string | null>(null);

  const fieldErrors = {
    firstName: firstName.trim().length === 0 ? "Enter a first name." : null,
    lastName: lastName.trim().length === 0 ? "Enter a last name." : null,
  };

  return (
    <Modal title={`Edit ${memberName(member)}`} onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={async (event) => {
          event.preventDefault();
          if (pending || Object.values(fieldErrors).some(Boolean)) return;
          setError(null);
          try {
            await onSubmit({ firstName, lastName, department, jobTitle });
          } catch (caught) {
            console.error("[palse edit details]", caught);
            setError(guide(caught, "Could not save the details."));
          }
        }}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormInput id="edit-first-name" label="First name" required value={firstName}
            onChange={(event) => setFirstName(event.target.value)} error={fieldErrors.firstName} disabled={pending} />
          <FormInput id="edit-last-name" label="Last name" required value={lastName}
            onChange={(event) => setLastName(event.target.value)} error={fieldErrors.lastName} disabled={pending} />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormInput id="edit-department" label="Department (optional)" value={department}
            onChange={(event) => setDepartment(event.target.value)} disabled={pending} />
          <FormInput id="edit-job-title" label="Job title (optional)" value={jobTitle}
            onChange={(event) => setJobTitle(event.target.value)} disabled={pending} />
        </div>
        {error != null ? <Notice tone="danger">{error}</Notice> : null}
        <div className="flex justify-end gap-3 border-t border-theme-line pt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-control border border-theme-line px-4 py-2 text-sm font-semibold text-theme-ink transition-colors hover:bg-theme-light-gray disabled:opacity-60"
          >
            Cancel
          </button>
          <PrimaryButton pending={pending}>Save details</PrimaryButton>
        </div>
      </form>
    </Modal>
  );
}

/* --------------------------- issued password show ---------------------------- */

function IssuedPasswordModal({ issued, onClose }: { issued: IssuedPassword; onClose: () => void }) {
  const headline = issued.purpose === "created" ? "Account created" : "Temporary password issued";

  return (
    <Modal title={headline} onClose={onClose}>
      <Notice tone="warning" className="mb-4">
        Show this password once, then it&apos;s gone — it is not stored anywhere and cannot be recovered.
      </Notice>
      <p className="mb-3 text-sm text-theme-gray">
        Temporary password for <strong className="text-theme-ink">{issued.email}</strong>:
      </p>
      <div className="flex items-center justify-between gap-3 rounded-control border border-theme-line bg-theme-light-gray px-4 py-3">
        <code aria-label="Temporary password" className="min-w-0 break-all font-mono text-sm font-bold text-theme-ink">
          {issued.password}
        </code>
        <CopyButton value={issued.password} label="password" />
      </div>
      <p className="mt-4 text-sm text-theme-gray">
        The clinician signs in with this password and is immediately asked to
        set a new one. See the{" "}
        <Link to="/admin/audit-log" className="font-semibold text-theme-maroon underline-offset-4 hover:underline">
          audit log
        </Link>{" "}
        for a record of the account change.
      </p>
      <div className="mt-5 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="rounded-control border border-theme-line px-4 py-2 text-sm font-semibold text-theme-ink transition-colors hover:bg-theme-light-gray"
        >
          Done
        </button>
      </div>
    </Modal>
  );
}

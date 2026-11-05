import { supabase } from "./supabase.ts";
import type { UserRole } from "../context/auth-context.ts";

/**
 * Organization + account management for /admin. Read paths go straight to
 * Supabase (RLS scopes them to the org); privileged account operations go
 * through the `admin-ops` Edge Function carrying the admin's session JWT.
 */

const ADMIN_OPS_FUNCTION = "admin-ops";

/* ------------------------------- Types ----------------------------------- */

export interface OrgMember {
  id: string;
  email: string | null;
  first_name: string;
  last_name: string;
  department: string | null;
  job_title: string | null;
  role: UserRole;
  status: "pending" | "active" | "disabled";
  must_set_password: boolean;
  /** PRC license number (null until the backfill / for admins). */
  prc_number: string | null;
  created_at: string;
  updated_at: string;
  avatar_url: string;
}

export interface Organization {
  id: string;
  name: string;
  invite_code: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PasswordResetRequest {
  id: string;
  clinician_id: string;
  org_id: string | null;
  status: "pending" | "resolved" | "cancelled";
  note: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditLogEntry {
  id: string;
  org_id: string | null;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  entity:
  | "patient"
  | "assessment"
  | "vitals"
  | "account"
  | "organization"
  | "password_reset";
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AuditLogFilter {
  entity?: AuditLogEntry["entity"] | null;
  action?: string | null;
  actorEmail?: string | null;
  /** ISO datetimes (inclusive bounds handed to the server as-is). */
  fromIso?: string | null;
  toIso?: string | null;
  limit?: number;
  offset?: number;
}

/** One page of audit rows + the exact filtered total (server-side count). */
export interface AuditLogPage {
  rows: AuditLogEntry[];
  total: number;
}

function auditQuery(filter: AuditLogFilter, withCount: boolean) {
  let query = supabase
    .from("audit_logs")
    .select("*", withCount ? { count: "exact" } : undefined)
    .order("created_at", { ascending: false })
    .range(
      filter.offset ?? 0,
      (filter.offset ?? 0) + (filter.limit ?? 100) - 1,
    );

  if (filter.entity != null) query = query.eq("entity", filter.entity);
  if (filter.action != null && filter.action.trim() !== "") {
    query = query.ilike("action", `%${filter.action.trim()}%`);
  }
  if (filter.actorEmail != null && filter.actorEmail.trim() !== "") {
    query = query.ilike("actor_email", `%${filter.actorEmail.trim()}%`);
  }
  if (filter.fromIso != null) query = query.gte("created_at", filter.fromIso);
  if (filter.toIso != null) query = query.lte("created_at", filter.toIso);
  return query;
}

/* --------------------------- Temporary password --------------------------- */

const TEMP_ALPHABETS = [
  "abcdefghijkmnpqrstuvwxyz",
  "ABCDEFGHJKLMNPQRSTUVWXYZ",
  "23456789",
  "!@#$%^&*",
];

export function generateTempPassword(length = 14): string {
  const pick = (alphabet: string): string => {
    const bytes = crypto.getRandomValues(new Uint8Array(1));
    return alphabet[bytes[0] % alphabet.length];
  };

  // One guaranteed character from each class, then random with all classes.
  const guaranteed = TEMP_ALPHABETS.map(pick);
  const all = TEMP_ALPHABETS.join("");
  const rest = Array.from({ length: length - guaranteed.length }, () =>
    pick(all),
  );

  return [...guaranteed, ...rest]
    .map((value) => ({
      value,
      order: crypto.getRandomValues(new Uint32Array(1))[0],
    }))
    .sort((a, b) => a.order - b.order)
    .map(({ value }) => value)
    .join("");
}

/* ----------------------------- Privileged ops ----------------------------- */

interface AdminOpsResponse {
  ok?: boolean;
  error?: string;
}

/** Calls the admin-ops Edge Function; throws Error with admin-friendly copy. */
export async function callAdminOps(
  action: string,
  payload: Record<string, unknown> = {},
): Promise<AdminOpsResponse> {
  const { data, error } = await supabase.functions.invoke(ADMIN_OPS_FUNCTION, {
    body: { action, ...payload },
  });

  if (error != null) {
    // functions.invoke reports three failure shapes:
    //  * FunctionsHttpError  — non-2xx from the function; `context` carries
    //    the JSON body we sent ({ error: "..." }) — extract it so admins see
    //    the real message instead of a raw `{"error":...}` blob.
    //  * FunctionsFetchError — the request never completed: offline, or a
    //    CORS preflight the *deployed* function does not authorize. This is a
    //    deployment problem, not a code problem — redeploy admin-ops.
    //  * FunctionsRelayError — relay misconfiguration.
    const httpError = error as { context?: unknown; message?: string };
    let message = httpError.message ?? "Edge function call failed.";

    const contextText = typeof httpError.context === "string" ? httpError.context : null;
    if (contextText != null && contextText.trim() !== "") {
      try {
        const parsed: unknown = JSON.parse(contextText);
        if (
          parsed != null &&
          typeof parsed === "object" &&
          typeof (parsed as { error?: unknown }).error === "string"
        ) {
          message = (parsed as { error: string }).error;
        } else {
          message = contextText;
        }
      } catch {
        message = contextText;
      }
    }

    // The browser reported "CORS request did not succeed" / the fetch failed:
    // make the deployment root cause visible instead of the generic verdict.
    if (httpError.message?.includes("Failed to send a request")) {
      message =
        "Could not reach the account operations service — the deployed function is missing or stale. Redeploy `admin-ops` and retry.";
    }

    throw new Error(message);
  }
  if (data?.error != null) {
    throw new Error(data.error);
  }
  return data as AdminOpsResponse;
}

export interface CreateClinicianInput {
  firstName: string;
  lastName: string;
  email: string;
  /** PRC license number (6-9 digits) — the clinician's sign-in identity. */
  prcNumber: string;
  tempPassword: string;
  department?: string | null;
  jobTitle?: string | null;
}

export function createClinician(
  input: CreateClinicianInput,
): Promise<AdminOpsResponse> {
  return callAdminOps("create_clinician", {
    first_name: input.firstName,
    last_name: input.lastName,
    email: input.email,
    prc_number: input.prcNumber,
    temp_password: input.tempPassword,
    department: input.department ?? null,
    job_title: input.jobTitle ?? null,
  });
}

export function issueTempPassword(input: {
  clinicianId?: string;
  resetRequestId?: string;
  tempPassword: string;
}): Promise<AdminOpsResponse> {
  return callAdminOps("reset_temp_password", {
    clinician_id: input.clinicianId ?? undefined,
    reset_request_id: input.resetRequestId ?? undefined,
    temp_password: input.tempPassword,
  });
}

export function disableMember(clinicianId: string): Promise<AdminOpsResponse> {
  return callAdminOps("disable_member", { clinician_id: clinicianId });
}

export function enableMember(clinicianId: string): Promise<AdminOpsResponse> {
  return callAdminOps("enable_member", { clinician_id: clinicianId });
}

/* ------------------------------ Org reads --------------------------------- */

export async function getMyOrganization(
  orgId: string,
): Promise<Organization | null> {
  const { data, error } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", orgId)
    .maybeSingle();
  if (error != null) throw error;
  return (data as Organization | null) ?? null;
}

export async function listOrgMembers(orgId: string): Promise<OrgMember[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, email, first_name, last_name, department, job_title, role, status, must_set_password, prc_number, created_at, updated_at, avatar_url",
    )
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });
  if (error != null) throw error;
  return (data ?? []) as OrgMember[];
}

/* ------------------------------ Org writes -------------------------------- */

export async function createOrganization(name: string): Promise<string> {
  const { data, error } = await supabase.rpc("create_organization", {
    org_name: name,
  });
  if (error != null) throw error;
  return data as string;
}

export async function joinOrganization(inviteCode: string): Promise<string> {
  const { data, error } = await supabase.rpc("join_organization", {
    candidate_code: inviteCode,
  });
  if (error != null) throw error;
  return data as string;
}

export async function rotateInviteCode(): Promise<string> {
  const { data, error } = await supabase.rpc("rotate_invite_code");
  if (error != null) throw error;
  return data as string;
}

/** Editable detail fields of a member (privileged, same-org clinicians). */
export function updateMember(
  memberId: string,
  patch: {
    firstName: string;
    lastName: string;
    department?: string | null;
    jobTitle?: string | null;
    /** PRC license number (6-9 digits) — required for account sign-in. */
    prcNumber?: string | null;
  },
): Promise<AdminOpsResponse> {
  return callAdminOps("update_member", {
    member_id: memberId,
    first_name: patch.firstName,
    last_name: patch.lastName,
    department: patch.department ?? null,
    job_title: patch.jobTitle ?? null,
    prc_number: patch.prcNumber ?? null,
  });
}

/* --------------------------- Password reset flow --------------------------- */

/** Public (anon-allowed) request: clinician asks their admin for a temp password. */
export async function requestPasswordReset(
  email: string,
  note?: string | null,
): Promise<void> {
  const { error } = await supabase.rpc("request_password_reset", {
    target_email: email,
    note: note ?? null,
  });
  if (error != null) throw error;
}

export async function listPendingResetRequests(
  orgId: string,
): Promise<PasswordResetRequest[]> {
  const { data, error } = await supabase
    .from("password_reset_requests")
    .select("*")
    .eq("org_id", orgId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error != null) throw error;
  return (data ?? []) as PasswordResetRequest[];
}

/** Dismiss a reset request without issuing a password (marked cancelled). */
export function dismissResetRequest(
  requestId: string,
): Promise<AdminOpsResponse> {
  return callAdminOps("resolve_reset_request", { reset_request_id: requestId });
}

/** Number of patients in the caller's organization (RLS-scoped count). */
export async function countPatients(): Promise<number> {
  const { count, error } = await supabase
    .from("patients")
    .select("id", { count: "exact", head: true });
  if (error != null) throw error;
  return count ?? 0;
}

/* ------------------------------- Audit log -------------------------------- */

/** Human copy for the server-generated audit actions (shared by admin pages). */
const AUDIT_ACTION_LABELS: Record<string, string> = {
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
  "admin.requested": "Admin account requested",
  "admin.approved": "Admin account approved",
  "admin.rejected": "Admin account rejected",
  "admin.self_signup": "Self-signup stored as clinician",
  "password_reset.requested": "Password reset requested",
  "password_reset.dismissed": "Password reset request dismissed",
};

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action;
}

/** All known action names (for the audit filter's suggestion list). */
export const knownAuditActions: string[] = Object.keys(AUDIT_ACTION_LABELS);

export async function listAuditLogs(
  filter: AuditLogFilter = {},
): Promise<AuditLogEntry[]> {
  const { data, error } = await auditQuery(filter, false);
  if (error != null) throw error;
  return (data ?? []) as AuditLogEntry[];
}

/** Server-paged audit list with the exact number of matching rows. */
export async function listAuditLogsPage(
  filter: AuditLogFilter = {},
): Promise<AuditLogPage> {
  const { data, error, count } = await auditQuery(filter, true);
  if (error != null) throw error;
  return { rows: (data ?? []) as AuditLogEntry[], total: count ?? 0 };
}

/** Up to `limit` rows of the currently filtered view (for CSV export). */
export async function exportAuditLogs(
  filter: AuditLogFilter = {},
  limit = 1000,
): Promise<AuditLogEntry[]> {
  const { data, error } = await auditQuery(
    { ...filter, offset: 0, limit },
    false,
  );
  if (error != null) throw error;
  return (data ?? []) as AuditLogEntry[];
}

/* --------------------------- Audit presentation ---------------------------- */

export type AuditCategory = AuditLogEntry["entity"];

export interface AuditCategoryMeta {
  label: string;
  icon: string;
}

/** Icon + label per audit category (no colors: tones live in Badge tiers). */
export function auditCategoryMeta(category: AuditCategory): AuditCategoryMeta {
  switch (category) {
    case "patient":
      return { label: "Patients", icon: "personal_injury" };
    case "assessment":
      return { label: "Assessments", icon: "labs" };
    case "vitals":
      return { label: "Vitals", icon: "monitor_heart" };
    case "account":
      return { label: "Accounts", icon: "manage_accounts" };
    case "organization":
      return { label: "Organization", icon: "apartment" };
    case "password_reset":
      return { label: "Password resets", icon: "key" };
  }
}

/** Sentence describing what the entry did ("Issued a temporary password for…"). */
export function describeAuditEntry(entry: AuditLogEntry): string {
  const who = auditActionLabel(entry.action);
  const row = (entry.metadata?.row ?? {}) as Record<string, unknown>;
  const meta = entry.metadata ?? {};

  const rowName = (): string | null => {
    const first = typeof row.first_name === "string" ? row.first_name : null;
    const last = typeof row.last_name === "string" ? row.last_name : null;
    const name = [first, last].filter(Boolean).join(" ").trim();
    if (name !== "") return name;
    if (typeof row.email === "string" && row.email !== "") return row.email;
    if (typeof row.name === "string" && row.name !== "") return row.name;
    return null;
  };

  switch (entry.entity) {
    case "patient": {
      const name = rowName();
      return who + (name != null ? ` — ${name}` : "");
    }
    case "account":
      return (
        who +
        (() => {
          const name =
            rowName() ?? (typeof meta.email === "string" ? meta.email : null);
          return name != null ? ` — ${name}` : "";
        })()
      );
    case "organization": {
      const name = rowName();
      return who + (name != null ? ` — ${name}` : "");
    }
    case "vitals": {
      return who + " — vital readings updated";
    }
    default:
      return who;
  }
}

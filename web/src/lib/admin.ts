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
  created_at: string;
  updated_at: string;
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
  entity: "patient" | "assessment" | "vitals" | "account" | "organization" | "password_reset";
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

/* --------------------------- Temporary password --------------------------- */

const TEMP_ALPHABETS = ["abcdefghijkmnpqrstuvwxyz", "ABCDEFGHJKLMNPQRSTUVWXYZ", "23456789", "!@#$%^&*"];

export function generateTempPassword(length = 14): string {
  const pick = (alphabet: string): string => {
    const bytes = crypto.getRandomValues(new Uint8Array(1));
    return alphabet[bytes[0] % alphabet.length];
  };

  // One guaranteed character from each class, then random with all classes.
  const guaranteed = TEMP_ALPHABETS.map(pick);
  const all = TEMP_ALPHABETS.join("");
  const rest = Array.from({ length: length - guaranteed.length }, () => pick(all));

  return [...guaranteed, ...rest]
    .map((value) => ({ value, order: crypto.getRandomValues(new Uint32Array(1))[0] }))
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
    // Functions%2FHttpError carries a context message; FunctionHttpError surfaces context.
    const message =
      typeof (error as { context?: unknown }).context === "string"
        ? (error as { context: string }).context
        : (error as { message?: string }).message ?? "Edge function call failed.";
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
  tempPassword: string;
  department?: string | null;
  jobTitle?: string | null;
}

export function createClinician(input: CreateClinicianInput): Promise<AdminOpsResponse> {
  return callAdminOps("create_clinician", {
    first_name: input.firstName,
    last_name: input.lastName,
    email: input.email,
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

export async function getMyOrganization(orgId: string): Promise<Organization | null> {
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
      "id, email, first_name, last_name, department, job_title, role, status, must_set_password, created_at, updated_at",
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

/* --------------------------- Password reset flow --------------------------- */

/** Public (anon-allowed) request: clinician asks their admin for a temp password. */
export async function requestPasswordReset(email: string, note?: string | null): Promise<void> {
  const { error } = await supabase.rpc("request_password_reset", {
    target_email: email,
    note: note ?? null,
  });
  if (error != null) throw error;
}

export async function listPendingResetRequests(orgId: string): Promise<PasswordResetRequest[]> {
  const { data, error } = await supabase
    .from("password_reset_requests")
    .select("*")
    .eq("org_id", orgId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error != null) throw error;
  return (data ?? []) as PasswordResetRequest[];
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
};

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action;
}

export async function listAuditLogs(filter: AuditLogFilter = {}): Promise<AuditLogEntry[]> {
  let query = supabase
    .from("audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .range(filter.offset ?? 0, (filter.offset ?? 0) + (filter.limit ?? 100) - 1);

  if (filter.entity != null) query = query.eq("entity", filter.entity);
  if (filter.action != null && filter.action.trim() !== "") {
    query = query.ilike("action", `%${filter.action.trim()}%`);
  }
  if (filter.actorEmail != null && filter.actorEmail.trim() !== "") {
    query = query.ilike("actor_email", `%${filter.actorEmail.trim()}%`);
  }
  if (filter.fromIso != null) query = query.gte("created_at", filter.fromIso);
  if (filter.toIso != null) query = query.lte("created_at", filter.toIso);

  const { data, error } = await query;
  if (error != null) throw error;
  return (data ?? []) as AuditLogEntry[];
}

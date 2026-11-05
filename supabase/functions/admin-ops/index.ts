// supabase/functions/admin-ops — privileged account operations for /admin.
//
// Called by the admin console (web app) through supabase-js `functions.invoke`,
// which attaches the caller's Supabase session JWT. Privileged work (creating
// users, setting passwords, banning) runs under the auto-injected
// SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS — this function therefore
// authenticates and authorizes the caller itself:
//   * caller must hold an active admin profile with an organization.
//
// Actions:
//   create_clinician    { first_name, last_name, email, temp_password, prc_number, department?, job_title? }
//   reset_temp_password { temp_password, clinician_id? | reset_request_id? }
//   disable_member      { clinician_id }
//   enable_member       { clinician_id }
//   update_member       { member_id, first_name, last_name, prc_number, department?, job_title? }
//   resolve_reset_request { reset_request_id }  — dismiss without a password
// Two hard rules keep this version backward-compatible with the web console
// contract: every failure answers with a JSON body + CORS headers (even
// 4xx/5xx), and a failed provisioning step never strands a half-created
// auth account (it is rolled back before the error surfaces).
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.118.0";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  // supabase-js sends bare XHR from another origin, and agent-layer client
  // SDKs preflight *twice*; letting browsers cache the preflight response
  // removes a whole round-trip of failure opportunities (the production
  // symptom is 'CORS request did not succeed. Status code: (null)').
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  });
}

/** Mirrors the web app's password policy (lib/password.ts). */
function tempPasswordProblems(password: unknown): string | null {
  if (typeof password !== "string" || password.length < 12) {
    return "Temporary password must be at least 12 characters.";
  }
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) ||
      !/[0-9]/.test(password) || !/[^a-zA-Z0-9]/.test(password)) {
    return "Temporary password must mix lowercase, uppercase, digits and symbols.";
  }
  return null;
}

function emailProblems(email: unknown): string | null {
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return "Enter a valid email address.";
  }
  return null;
}

/** PRC license number (clinician sign-in identity) — 6-9 digits, required. */
function prcProblems(value: unknown): string | null {
  if (value == null || typeof value !== "string" || value.trim() === "") {
    return "PRC number is required — clinicians sign in with it.";
  }
  if (!/^[0-9]{6,9}$/.test(value.trim())) {
    return "PRC numbers are 6-9 digits.";
  }
  return null;
}

/** True when another account already holds this PRC number. */
async function prcTaken(
  service: SupabaseClient,
  prc: string,
  exceptId?: string,
): Promise<boolean> {
  let query = service
    .from("profiles")
    .select("id")
    .eq("prc_number", prc)
    .limit(1);
  if (exceptId != null) {
    query = query.neq("id", exceptId);
  }
  const { data, error } = await query;
  if (error != null) return false; // surfaced by the unique index at write time
  return (data ?? []).length > 0;
}

function nameOrTitleProblems(value: unknown, label: string, max = 100): string | null {
  if (typeof value !== "string" || value.trim().length === 0 || value.trim().length > max) {
    return `${label} must be 1-${max} characters.`;
  }
  return null;
}

interface Caller {
  id: string;
  email: string | null;
  role: string;
  status: string;
  org_id: string | null;
}

/** Loads the profile of the JWT holder and asserts they are an active admin. */
async function requireAdmin(service: SupabaseClient, req: Request): Promise<Caller | Response> {
  const authHeader = req.headers.get("Authorization");
  if (authHeader == null || !authHeader.toLowerCase().startsWith("bearer ")) {
    return json({ error: "Missing authorization header." }, 401);
  }

  const { data, error } = await service.auth.getUser(
    authHeader.slice("bearer ".length).trim(),
  );
  if (error != null || data.user == null) {
    return json({ error: "Your session is not valid. Sign in again." }, 401);
  }

  const { data: profile, error: profileError } = await service
    .from("profiles")
    .select("id, email, role, status, org_id")
    .eq("id", data.user.id)
    .maybeSingle();

  if (profileError != null) return json({ error: "Could not verify your account." }, 500);
  if (profile == null) return json({ error: "No account profile found." }, 403);
  if (profile.role !== "admin") return json({ error: "Administrator access required." }, 403);
  if (profile.status !== "active") {
    return json({ error: "This account is awaiting superadmin approval or is disabled." }, 403);
  }
  if (profile.org_id == null) {
    return json({ error: "Join or create an organization first." }, 403);
  }
  return profile as Caller;
}

async function audit(
  service: SupabaseClient,
  caller: Caller,
  action: string,
  entityId: string | null,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await service.from("audit_logs").insert({
    org_id: caller.org_id,
    actor_id: caller.id,
    actor_email: caller.email,
    action,
    entity: "account",
    entity_id: entityId,
    metadata,
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ error: "POST only." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (supabaseUrl == null || serviceKey == null) {
    return json({ error: "Function is not configured." }, 503);
  }
  const service = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const authorized = await requireAdmin(service, req);
    if (authorized instanceof Response) return authorized;
    const caller = authorized;

    const body = await req.json().catch(() => null);
    if (body == null) return json({ error: "Invalid JSON body." }, 400);

    switch (body.action) {
      case "create_clinician": {
        for (const check of [
          nameOrTitleProblems(body.first_name, "First name"),
          nameOrTitleProblems(body.last_name, "Last name"),
          emailProblems(body.email),
          prcProblems(body.prc_number),
          tempPasswordProblems(body.temp_password),
        ]) {
          if (check != null) return json({ error: check }, 400);
        }

        // Duplicate PRC must be caught BEFORE the auth user exists — a
        // late rejection would strand a provisioned-but-membershipless
        // account.
        if (await prcTaken(service, String(body.prc_number).trim())) {
          return json({ error: "An account with this PRC number already exists." }, 400);
        }

        const { data: created, error: createError } = await service.auth.admin.createUser({
          email: String(body.email).trim(),
          password: body.temp_password,
          email_confirm: true, // clinicians get no confirmation email
          user_metadata: {
            first_name: body.first_name.trim(),
            last_name: body.last_name.trim(),
          },
        });
        if (createError != null) {
          const message = createError.message?.includes("already")
            ? "An account with this email already exists."
            : "Could not create the account. Try again.";
          return json({ error: message }, 400);
        }

        // Pre-check done above; this guards a PRC created between the check
        // and now (races) — reject before the profile update, not after.
        if (await prcTaken(service, String(body.prc_number).trim())) {
          await service.auth.admin.deleteUser(created.user.id);
          return json({ error: "An account with this PRC number already exists." }, 400);
        }

        // Provision the membership + PRC on the freshly created profile row.
        const { error: profileError } = await service
          .from("profiles")
          .update({
            // The signup trigger defaults new accounts to clinician/disabled
            // (safe for stray self-signups); provisioning confirms both.
            role: "clinician",
            status: "active",
            org_id: caller.org_id,
            must_set_password: true,
            prc_number: String(body.prc_number).trim(),
            department: typeof body.department === "string" && body.department.trim() !== ""
              ? body.department.trim()
              : null,
            job_title: typeof body.job_title === "string" && body.job_title.trim() !== ""
              ? body.job_title.trim()
              : null,
          })
          .eq("id", created.user.id);
        if (profileError != null) {
          // Do not leave an org-less, unprovisioned account behind: roll the
          // auth user back and surface the reason as a 400-ish error.
          await service.auth.admin.deleteUser(created.user.id);
          return json(
            { error: "Could not set up the membership — check that the required SQL migrations are applied, then retry." },
            400,
          );
        }

        await audit(service, caller, "account.create", created.user.id, {
          email: String(body.email).trim(),
          first_name: body.first_name.trim(),
          last_name: body.last_name.trim(),
        });
        return json({ ok: true, user_id: created.user.id });
      }

      case "reset_temp_password": {
        const pwProblem = tempPasswordProblems(body.temp_password);
        if (pwProblem != null) return json({ error: pwProblem }, 400);

        let clinicianId: string | null = body.clinician_id ?? null;
        const resetRequestId: string | null = body.reset_request_id ?? null;

        if (resetRequestId != null) {
          const { data: requestRow, error: requestError } = await service
            .from("password_reset_requests")
            .select("id, clinician_id, org_id, status")
            .eq("id", resetRequestId)
            .maybeSingle();
          if (requestError != null || requestRow == null) {
            return json({ error: "Reset request not found." }, 404);
          }
          if (requestRow.status !== "pending") {
            return json({ error: "This reset request was already handled." }, 400);
          }
          if (requestRow.org_id !== caller.org_id) {
            return json({ error: "Reset request belongs to another organization." }, 403);
          }
          clinicianId = requestRow.clinician_id;
        }
        if (clinicianId == null) {
          return json({ error: "Missing clinician_id or reset_request_id." }, 400);
        }

        const { data: member, error: memberError } = await service
          .from("profiles")
          .select("id, email, role, status, org_id")
          .eq("id", clinicianId)
          .maybeSingle();
        if (memberError != null || member == null) {
          return json({ error: "Member not found." }, 404);
        }
        if (member.org_id !== caller.org_id || member.role !== "clinician") {
          return json({ error: "This member is outside your organization." }, 403);
        }
        if (member.status === "disabled") {
          return json({ error: "Re-enable the account before issuing a password." }, 400);
        }

        const { error: passwordError } = await service.auth.admin.updateUserById(clinicianId, {
          password: body.temp_password,
        });
        if (passwordError != null) {
          return json({ error: "Could not set the temporary password. Try again." }, 400);
        }

        await service.from("profiles")
          .update({ must_set_password: true })
          .eq("id", clinicianId);

        if (resetRequestId != null) {
          await service.from("password_reset_requests")
            .update({
              status: "resolved",
              resolved_by: caller.id,
              resolved_at: new Date().toISOString(),
            })
            .eq("id", resetRequestId);
        }

        await audit(service, caller, "account.temp_password", clinicianId, {
          email: member.email,
          via_reset_request: resetRequestId != null,
        });
        return json({ ok: true });
      }

      case "disable_member":
      case "enable_member": {
        const clinicianId: string | null = body.clinician_id ?? null;
        if (clinicianId == null) return json({ error: "Missing clinician_id." }, 400);

        const { data: member, error: memberError } = await service
          .from("profiles")
          .select("id, email, role, status, org_id")
          .eq("id", clinicianId)
          .maybeSingle();
        if (memberError != null || member == null) {
          return json({ error: "Member not found." }, 404);
        }
        if (member.org_id !== caller.org_id || member.role !== "clinician") {
          return json({ error: "This member is outside your organization." }, 403);
        }
        if (member.id === caller.id) {
          return json({ error: "Administrators manage clinicians; you are not one." }, 400);
        }

        const disabling = body.action === "disable_member";
        if (disabling && member.status === "disabled") {
          return json({ error: "This account is already disabled." }, 400);
        }
        if (!disabling && member.status !== "disabled") {
          return json({ error: "This account is not disabled." }, 400);
        }

        // App-level status + auth-level ban keeps a disabled account out even
        // if a cached session token is still technically unexpired.
        const { error: banError } = await service.auth.admin.updateUserById(clinicianId, {
          ban_duration: disabling ? "876000h" : "none",
        });
        if (banError != null) {
          return json({ error: "Could not update the account. Try again." }, 400);
        }
        await service.from("profiles")
          .update({ status: disabling ? "disabled" : "active" })
          .eq("id", clinicianId);

        await audit(service, caller, disabling ? "account.disable" : "account.enable", clinicianId, {
          email: member.email,
        });
        return json({ ok: true });
      }

      case "update_member": {
        const memberId: string | null = body.member_id ?? null;
        if (memberId == null) return json({ error: "Missing member_id." }, 400);
        for (const check of [
          nameOrTitleProblems(body.first_name, "First name"),
          nameOrTitleProblems(body.last_name, "Last name"),
          prcProblems(body.prc_number),
        ]) {
          if (check != null) return json({ error: check }, 400);
        }
        const optionalText = (value: unknown): string | null =>
          typeof value === "string" && value.trim() !== "" ? value.trim() : null;
        if (optionalText(body.department) != null && typeof body.department === "string" &&
            body.department.trim().length > 100) {
          return json({ error: "Department must be 1-100 characters." }, 400);
        }
        if (optionalText(body.job_title) != null && typeof body.job_title === "string" &&
            body.job_title.trim().length > 100) {
          return json({ error: "Job title must be 1-100 characters." }, 400);
        }

        const { data: member, error: memberError } = await service
          .from("profiles")
          .select("id, email, role, status, org_id")
          .eq("id", memberId)
          .maybeSingle();
        if (memberError != null || member == null) {
          return json({ error: "Member not found." }, 404);
        }
        if (member.org_id !== caller.org_id || member.role !== "clinician") {
          return json({ error: "This member is outside your organization." }, 403);
        }

        const nextPrc = String(body.prc_number).trim();
        if (await prcTaken(service, nextPrc, memberId)) {
          return json({ error: "An account with this PRC number already exists." }, 400);
        }

        const { error: updateError } = await service
          .from("profiles")
          .update({
            first_name: String(body.first_name).trim(),
            last_name: String(body.last_name).trim(),
            prc_number: nextPrc,
            department: optionalText(body.department),
            job_title: optionalText(body.job_title),
          })
          .eq("id", memberId);
        if (updateError != null) {
          return json(
            { error: "Could not save the details — check that the required SQL migrations are applied, then retry." },
            400,
          );
        }

        await audit(service, caller, "account.update", memberId, {
          email: member.email,
          first_name: String(body.first_name).trim(),
          last_name: String(body.last_name).trim(),
        });
        return json({ ok: true });
      }

      case "resolve_reset_request": {
        const resetRequestId: string | null = body.reset_request_id ?? null;
        if (resetRequestId == null) {
          return json({ error: "Missing reset_request_id." }, 400);
        }

        const { data: requestRow, error: requestError } = await service
          .from("password_reset_requests")
          .select("id, clinician_id, org_id, status")
          .eq("id", resetRequestId)
          .maybeSingle();
        if (requestError != null || requestRow == null) {
          return json({ error: "Reset request not found." }, 404);
        }
        if (requestRow.org_id !== caller.org_id) {
          return json({ error: "Reset request belongs to another organization." }, 403);
        }
        if (requestRow.status !== "pending") {
          return json({ error: "This reset request was already handled." }, 400);
        }

        const { error: resolveError } = await service
          .from("password_reset_requests")
          .update({
            status: "cancelled",
            resolved_by: caller.id,
            resolved_at: new Date().toISOString(),
          })
          .eq("id", resetRequestId);
        if (resolveError != null) {
          return json({ error: "Could not dismiss the request. Try again." }, 400);
        }

        await audit(service, caller, "password_reset.dismissed", resetRequestId, { requested: true });
        return json({ ok: true });
      }

      default:
        return json({ error: "Unknown action." }, 400);
    }
  } catch (cause) {
    console.error("[palse admin-ops]", cause);
    return json({ error: "Unexpected failure. Try again." }, 500);
  }
});

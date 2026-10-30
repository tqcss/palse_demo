// supabase/functions/superadmin-approvals — approval surface for superadmins.
//
// Superadmins (people with direct infrastructure access) approve or reject
// pending admin accounts. The page this function serves is the entire
// approval UI: no separate deploy, no other hosting.
//
//   GET  /                          -> the approval page (browser UI)
//   POST / {action:"list"}          -> pending admin requests
//   POST / {action:"approve", id}   -> flip status to active
//   POST / {action:"reject", id}    -> delete the account
//
// Authentication: the `SUPERADMIN_TOKEN` Supabase secret, sent as the
// X-Superadmin-Token header. Set it once:
//   supabase secrets set SUPERADMIN_TOKEN=<long random value>
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PAGE = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Pal.se — Superadmin approvals</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; background: #fbf8f5;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    color: #37312e; padding: 40px 20px;
  }
  .wrap { max-width: 720px; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 4px; color: #5b1616; }
  .sub { color: #8b817b; font-size: 14px; margin-bottom: 24px; }
  .card { background: #fff; border: 1px solid #eee7e0; border-radius: 12px; padding: 20px; margin-bottom: 16px; }
  .grid { display: flex; gap: 10px; }
  input[type=text] { width: 100%; padding: 10px 12px; border: 1px solid #d9d1c9; border-radius: 8px; font-size: 14px; }
  button { cursor: pointer; border-radius: 8px; border: 1px solid transparent; font-size: 13px; font-weight: 600; padding: 8px 14px; }
  .primary { background: #5b1616; color: #fff; }
  .primary:hover { background: #6d1c1c; }
  .ok { background: #14532d; color: #fff; }
  .danger { background: #fff; color: #7f1d1d; border-color: #e7c8c8; }
  .danger:hover { background: #fdf3f3; }
  .ghost { background: transparent; color: #8b817b; }
  .req { display: flex; justify-content: space-between; gap: 16px; align-items: center; flex-wrap: wrap; }
  .name { font-weight: 600; }
  .meta { color: #8b817b; font-size: 13px; margin-top: 3px; }
  .hint { font-size: 12px; color: #a89c94; margin-top: 8px; }
  #msg { margin-top: 16px; font-size: 14px; }
  .empty { color: #8b817b; font-size: 14px; text-align: center; padding: 24px 0; }
  code { background: #f2ece6; padding: 2px 6px; border-radius: 4px; font-size: 12px; }
</style>
</head>
<body>
<div class="wrap">
  <h1>Superadmin approvals</h1>
  <p class="sub">Confirm new administrator accounts for Pal.se. Approvals take effect on the next sign-in.</p>
  <div class="card">
    <label for="token" style="font-size:13px;font-weight:600;">Superadmin token (<code>SUPERADMIN_TOKEN</code>)</label>
    <div class="grid" style="margin-top:8px;">
      <input id="token" type="text" placeholder="Paste the token" autocomplete="off" />
      <button class="primary" id="load">Load requests</button>
    </div>
    <p class="hint">Stored only in this browser's localStorage. Configure once with <code>supabase secrets set SUPERADMIN_TOKEN=…</code></p>
  </div>
  <div id="requests"></div>
  <div id="msg"></div>
</div>
<script>
  const $ = (id) => document.getElementById(id);
  const tokenField = $("token");
  tokenField.value = localStorage.getItem("palse-superadmin-token") || "";

  function headers() {
    return {
      "Content-Type": "application/json",
      "X-Superadmin-Token": tokenField.value.trim(),
    };
  }

  function say(text, bad) {
    $("msg").textContent = text;
    $("msg").style.color = bad ? "#7f1d1d" : "#14532d";
  }

  async function act(action, body = {}) {
    say("Working…", false);
    try {
      const res = await fetch(location.origin + location.pathname, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ action, ...body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { say(data.error || "Request failed (" + res.status + ").", true); return null; }
      return data;
    } catch (e) { say("Network failure. Try again.", true); return null; }
  }

  async function load() {
    localStorage.setItem("palse-superadmin-token", tokenField.value.trim());
    const data = await act("list");
    if (data == null) return;
    const box = $("requests");
    box.innerHTML = "";
    $("msg").textContent = "";
    if (data.requests.length === 0) {
      box.innerHTML = '<div class="card empty">No pending administrator requests.</div>';
      return;
    }
    for (const r of data.requests) {
      const card = document.createElement("div");
      card.className = "card";
      const row = document.createElement("div");
      row.className = "req";
      const left = document.createElement("div");
      left.innerHTML =
        "<div class='name'>" + esc(r.first_name + " " + r.last_name) + " · " + esc(r.email) + "</div>" +
        "<div class='meta'>Intent: " + esc(hospital(r)) + " · requested " + esc(new Date(r.created_at).toLocaleString()) + "</div>";
      const right = document.createElement("div");
      right.style.display = "flex"; right.style.gap = "8px";
      const ok = document.createElement("button");
      ok.className = "ok"; ok.textContent = "Approve";
      ok.onclick = () => act("approve", { id: r.id }).then((d) => d && load());
      const no = document.createElement("button");
      no.className = "danger"; no.textContent = "Reject";
      no.onclick = () => { if (confirm("Delete this admin account (" + r.email + ")?")) act("reject", { id: r.id }).then((d) => d && load()); };
      right.append(ok, no);
      row.append(left, right);
      card.append(row);
      box.append(card);
    }
    say(data.requests.length + " pending request(s).", false);
  }

  function esc(v) {
    return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
  }
  function hospital(r) { return r.hospital || "(hospital not specified)"; }

  $("load").addEventListener("click", load);
  tokenField.addEventListener("keydown", (e) => { if (e.key === "Enter") load(); });
</script>
</body>
</html>`;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type, x-superadmin-token",
      "access-control-allow-methods": "GET, POST, OPTIONS",
    },
  });
}

/** Constant-time string comparison for the token check. */
function tokenMatches(expected: string, given: string): boolean {
  const a = new TextEncoder().encode(expected);
  const b = new TextEncoder().encode(given);
  const length = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < length; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "content-type, x-superadmin-token",
        "access-control-allow-methods": "GET, POST, OPTIONS",
      },
    });
  }

  if (req.method === "GET") {
    return new Response(PAGE, {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
  if (req.method !== "POST") {
    return json({ error: "POST or GET only." }, 405);
  }

  const expected = Deno.env.get("SUPERADMIN_TOKEN");
  if (expected == null || expected.trim() === "") {
    return json(
      { error: "Server not configured. Run: supabase secrets set SUPERADMIN_TOKEN=<value>" },
      503,
    );
  }
  if (!tokenMatches(expected, req.headers.get("X-Superadmin-Token") ?? "")) {
    return json({ error: "Invalid superadmin token." }, 401);
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
    const body = await req.json().catch(() => null);
    if (body == null) return json({ error: "Invalid JSON body." }, 400);

    if (body.action === "list") {
      const { data, error } = await service
        .from("profiles")
        .select("id, email, first_name, last_name, created_at")
        .eq("role", "admin")
        .eq("status", "pending")
        .order("created_at");
      if (error != null) return json({ error: "Could not load requests." }, 500);

      // The intended hospital name rides on the signup's user metadata.
      const hospitalById = new Map<string, string>();
      const { data: users } = await service.auth.admin.listUsers({ perPage: 200 });
      for (const user of users?.users ?? []) {
        const hospital = user.user_metadata?.requested_hospital;
        if (typeof hospital === "string" && hospital.trim() !== "") {
          hospitalById.set(user.id, hospital.trim());
        }
      }

      return json({
        requests: (data ?? []).map((row) => ({
          ...row,
          hospital: hospitalById.get(row.id) ?? null,
        })),
      });
    }

    if (body.action === "approve" || body.action === "reject") {
      const targetId = body.id;
      if (typeof targetId !== "string" || targetId.trim() === "") {
        return json({ error: "Missing id." }, 400);
      }

      const { data: profile, error: profileError } = await service
        .from("profiles")
        .select("id, email, role, status")
        .eq("id", targetId)
        .maybeSingle();
      if (profileError != null || profile == null) {
        return json({ error: "Request not found." }, 404);
      }
      if (profile.role !== "admin" || profile.status !== "pending") {
        return json({ error: "This account is not a pending admin request." }, 400);
      }

      if (body.action === "approve") {
        const { error } = await service.from("profiles")
          .update({ status: "active" })
          .eq("id", targetId);
        if (error != null) return json({ error: "Could not approve." }, 500);
        await service.from("audit_logs").insert({
          org_id: null,
          actor_id: null,
          actor_email: profile.email,
          action: "admin.approved",
          entity: "account",
          entity_id: targetId,
          metadata: { superadmin: true },
        });
        return json({ ok: true });
      }

      // Reject: delete the account; the profile row cascades with it.
      const { error } = await service.auth.admin.deleteUser(targetId);
      if (error != null && !error.message?.includes("not found")) {
        return json({ error: "Could not reject — deleting the account failed." }, 500);
      }
      await service.from("audit_logs").insert({
        org_id: null,
        actor_id: null,
        actor_email: profile.email,
        action: "admin.rejected",
        entity: "account",
        entity_id: targetId,
        metadata: { superadmin: true },
      });
      return json({ ok: true });
    }

    return json({ error: "Unknown action." }, 400);
  } catch (cause) {
    console.error("[palse superadmin-approvals]", cause);
    return json({ error: "Unexpected failure. Try again." }, 500);
  }
});

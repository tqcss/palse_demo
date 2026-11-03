# Pal.se — Launch Checklist

Manual steps to make the auth build fully functional. Code-side work is done;
everything below is dashboard/keys/ops.

## 0. CI / Deploy (GitHub Actions + Vercel)

Workflows live in `.github/workflows/` (`ci.yml` quality gate on push/PR,
`deploy.yml` → Vercel production on merge to `main`) plus `.github/dependabot.yml`.

- [ ] Link the Vercel project once, so you can copy the IDs:
      `cd frontend && npx vercel link` — create/choose a project with **root
      directory `frontend`**. Then:
      - copy `orgId` and `projectId` from `web/.vercel/project.json` →
        repo secrets `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID`
      - create a Vercel access token (Vercel → Team Settings → Tokens) →
        repo secret `VERCEL_TOKEN`.

      `web/vercel.json` is already committed: it declares SPA rewrites
      (`/(.*)` → `/index.html`) so deep links like `/patients/:id/edit` survive
      refresh, and sets `framework: null, outputDirectory: dist` so the deploy
      workflow packages the bundle it just built instead of rebuilding it.
- [ ] Add repo secrets (Settings → Secrets and variables → Actions):
      - `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`
      - `SUPABASE_URL` (Project URL — public-safe, embedded as `VITE_`)
      - `SUPABASE_PUBLISHABLE_KEY` (publishable key — public-safe, embedded as `VITE_`)
      - `TURNSTILE_SITE_KEY` (may stay empty until Turnstile is implemented)
- [ ] The Supabase **secret key** never goes into secrets or the frontend —
      any future server-side consumer gets its own restricted storage.
- [ ] Optional hardening: protect `main` (require `ci.yml` to pass), and set
      Vercel's production branch to `main` in project settings.
- [ ] Alternative (quieter) route: import the repo in the Vercel dashboard and
      let Vercel build/deploy itself — then disable/remove `deploy.yml`, keep
      the same `VITE_*` env values in Vercel project settings.
- [ ] Dependabot opens weekly grouped PRs (npm in `web/`, Actions refs);
      review and merge them on a normal cadence.

## 1. Keys & environment

- [ ] Create the Supabase project (a separate staging project is strongly recommended before production).
- [ ] Get the **Project URL** and **publishable key** (Supabase Dashboard → **Settings → API Keys**, or the project **Connect** dialog). Supabase has deprecated the legacy JWT `anon`/`service_role` keys (sunset by end of 2026) in favor of publishable (`sb_publishable_...`) and secret (`sb_secret_...`) keys. Fill `web/.env.local`:

  ```
  VITE_SUPABASE_URL=https://<project-ref>.supabase.co
  VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
  VITE_TURNSTILE_SITE_KEY=
  ```

- [ ] Secret keys bypass Row Level Security — they belong only in a trusted backend (Edge Functions / the future prediction engine service). Never put one in the frontend or give it a `VITE_` prefix.
- [ ] After verifying signup/signin works, **deactivate the legacy `anon` key** (Settings → API Keys) to complete the migration. Reversible if a consumer was missed.
- [ ] `bun install` in `web/`, then `bun run dev`.
      Icons are Google **Material Symbols** loaded from
      `fonts.googleapis.com` (see `web/index.html`) — a network-less
      machine shows icon names as plain text instead.

## 2. Cloudflare Turnstile (captcha) — deferred

Turnstile is intentionally **hidden for now** and will be implemented later in
the project. `VITE_TURNSTILE_SITE_KEY` is empty, so no widget renders, no token
is required, and the script never loads. Everything is pre-wired: when it's
time, create the widget, set the site key in the env file, and enable CAPTCHA
in Auth → Security with the widget secret (step 3's CAPTCHA bullet).

## 3. Supabase Auth settings

- [ ] **Database**: run `supabase/schema.sql` once in the SQL editor. It creates and hardens everything the app uses:
  - `public.profiles` — signup mirror of `auth.users` (first/last name, plus `department` and `job_title` on the profile page; role/status are the enums in section 10), org-scoped RLS, `updated_at` maintenance.
  - `public.patients` — the patient registry. Organization model: only members of the same `org_id` see a patient (see section 3a); inserts/updates/deletes stay scoped to `created_by`.
  - `public.assessments` — the dashboard wizard's seven JSONB sections (`demographic`, `maternal`, `neonatal`, `vitals`, `laboratory`, `treatment`, `comorbidities`) with `status = draft|complete`, plus `prediction` JSONB + `predicted_at` for engine scores, same team RLS pattern.
  - `public.patients.outcome` — retroactive EOS confirmation (`pending | confirmed_eos | ruled_out`) that powers the Reports accuracy card.
  - The signup trigger (`handle_new_user`) that copies first/last name out of `options.data`.
- [ ] **Schema v6** (vitals time series): re-run `supabase/schema.sql` once
      (idempotent). The v6 block adds `vital_observations` — the earlier/later
      vital-sign records behind /monitor's live charts (team select,
      creator-only writes) — plus the `supabase_realtime` publication so the
      charts push live. If Realtime was never used on the project, also check
      Database → Publications → `supabase_realtime` is enabled for the schema.
- [ ] **Vital readings** are recorded from /monitor, the wizard's step 4
      (optional collapsible block), or a CSV import — see
      `vitals-import-example.csv` at the project root for the exact column
      format (aliases like `hr`, `spo2`, `resp_rate` also match).
- [ ] **Auth → URL Configuration**: set **Site URL** to `http://localhost:5173`; add `http://localhost:5173/reset-password` (and later prod URLs) under **Redirect URLs**.
- [ ] **Password policy**: minimum password length `12` plus **require lowercase, uppercase, digits, and symbols** (Auth → Settings — matches the client-side rule in `src/lib/password.ts` exactly), and enable **leaked-password protection**.
- [ ] CAPTCHA: the app now ships the Turnstile widget in sign-in / sign-up /
      forgot-password. Paste the site key into `VITE_TURNSTILE_SITE_KEY` and
      enable **CAPTCHA protection** in Auth → Security with the widget secret
      — Supabase verifies the token server-side when the toggle is on; with it
      off the widget renders but proves nothing. Or in dev, the Turnstile test
      keys (`1x00000000000000000000AA` site / `1x0000000000000000000000000000000AA`
      secret) always pass.

## 3a. Organizations, admin accounts & audit (schema v7) — new

Schema v7 (section 10 of `supabase/schema.sql`, idempotent re-run) replaces the
old "team model" with organization isolation and a real accounts system:

- `role` / `status` enums on `profiles` (`clinician|admin`, `pending|active|disabled`),
  and the old free-text role column is now `job_title`.
- `organizations` (invite-code joining) and `org_id` on `profiles`, `patients`,
  `assessments`, `vital_observations`. All RLS is **org-scoped** now: users only
  ever see rows of their own organization — no cross-hospital reads.
- `audit_logs` (server-generated triggers + Edge Function writes) and
  `password_reset_requests` (clinician → administrator temporary-password flow).
- New rows pick up `org_id` server-side from the caller's JWT; the existing
  demo data is backfilled into one default org ("Pal.se Demo Hospital" — rename
  it in Table editor if it should carry a real hospital name).

- [ ] **Schema v7**: re-run `supabase/schema.sql` once (idempotent). Verify
      the app still loads patients for a signed-in member of the default org.
- [ ] **Sign-up policy** (Auth → Sign In / Providers → Email): keep **"Allow
      new users to sign up" ON** — the admin console needs it to accept
      administrator requests. Stray self-signups are harmless: the signup
      trigger marks them `clinician` + `disabled`, so they can never sign in,
      and only `requested_role: admin` requests create *pending* admin
      accounts a superadmin must confirm.
- [ ] **Email confirmation stays ON** (Auth → Sign In/Providers → Email →
      *Confirm email*). Admin requests confirm their email this way, and
      email password recovery works for admins. Clinician accounts are
      created pre-confirmed and never receive auth emails.
- [ ] **Deploy the Edge Functions** (requires the Supabase CLI):
      ```
      supabase functions deploy admin-ops
      supabase functions deploy superadmin-approvals
      ```
      `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.
- [ ] **Superadmin token**: `supabase secrets set SUPERADMIN_TOKEN=<long random value>`.
      This is the only way into the approval page — it never appears in the app.
- [ ] **Approval workflow**: open the `superadmin-approvals` function URL in a
      browser (Supabase Dashboard → Edge Functions → superadmin-approvals), paste
      the token, and approve/reject pending administrator requests. Approved
      accounts finish setup at `/admin/onboarding` (create or join an
      organization); only then does the console unlock.
- [ ] **CAPTCHA protection** (Auth → Security): keep the dashboard toggle ON
      so the shipped Turnstile widgets enforce (sign-in, admin request,
      forgot-password). Dev test keys: site `1x00000000000000000000AA`,
      secret `1x0000000000000000000000000000000AA`.
- [ ] **Security headers**: `web/vercel.json` now sends a CSP, nosniff,
      `frame-ancestors 'none'`, Referrer-Policy and Permissions-Policy on all
      routes. Allow-listed: Google Material Symbols fonts (stylesheets),
      `challenges.cloudflare.com` (Turnstile script + frame),
      `https://*.supabase.co`, `https://*.onrender.com` (ML engine). If the
      Supabase or engine domains change, update `connect-src`.
- [ ] **Model artifact supply chain**: `service/models/SHA256SUMS` pins the
      three pickled artifacts; `service.yml` runs `sha256sum --check --strict`
      before CI imports the engine. If you ever retrain/re-export a model,
      regenerate the manifest in the same commit
      (`cd service/models && sha256sum *.joblib *.pt > SHA256SUMS`) and make
      sure the diff explains why the bytes changed.

## 4. Prediction engine (service / Render)

The EOS model is served by `service/` — a trimmed port of the legacy
FastAPI stack (XGBoost static branch + TFT temporal branch + residual
ensemble fusion, artifacts in `service/models/`). It exposes exactly two
endpoints: `GET /health` and `POST /predict`. Auth is the same Supabase
session the frontend already has: the service verifies the Bearer token
against Supabase's **public JWKS** — no secret keys involved.

- [ ] **Schema v3**: re-run `supabase/schema.sql` once (it is idempotent). The
      v3 block adds `assessments.prediction`/`predicted_at` and
      `patients.outcome`.
- [ ] **Local run** (optional): `cd service && uv venv .venv --python 3.12 &&
      uv pip install --python .venv/bin/python -r requirements.txt`, then
      `SUPABASE_URL=<project url> .venv/bin/uvicorn main:app --port 8000`.
      Point the frontend at it with `VITE_ML_API_URL=http://127.0.0.1:8000`
      in `web/.env.local`.
- [ ] **Render service**: create a **Blueprint** from this repo — the
      root-level `render.yaml` declares the `palse-ml` web service
      (`rootDir: service`, health check `/health`, python 3.12). Set:
      - `SUPABASE_URL` — the public project URL (safe: only used for JWKS)
      - `ALLOWED_ORIGINS` — comma-separated frontend origins (local + prod)
      - optional: `RATE_LIMIT_PER_MINUTE` (default 30) and `MAX_BODY_BYTES`
        (default 256 KB) — the /predict per-caller budget and body cap; 429s
        and 413s carry `Retry-After` / generic copy
- [ ] Model artifacts are committed under `service/models/`
      (`eos_xgboost_pipeline.joblib`, `eos_residual_ensemble.joblib`,
      `eos_tft_state_dict.pt`) and load lazily on the first request.
- [ ] **JWT signing keys**: the service requires Supabase **asymmetric JWT
      signing keys** (RS/ES) in Auth → JWT Keys. Legacy HS256-only projects
      must complete Supabase's JWT key migration first; the JWK set is what
      `pyjwt`'s `PyJWKClient` consumes. Confirm JWKS resolves:
      `curl <SUPABASE_URL>/auth/v1/.well-known/jwks.json`.
- [ ] When `VITE_ML_API_URL` is unset the frontend stays fully usable —
      completed assessments are stored unscored and scored retroactively
      when scoring is wired; the dashboard/reports panels fall back to their
      placeholder states.
- [ ] Model env pinning is intentional: `scikit-learn==1.5.2`,
      `xgboost==2.1.4` (unpickling constraints of the saved artifacts). Live
      TFT requires `torch` + `pytorch-forecasting` + the training CSV — not
      vendored on Render; the service uses the same vital-sign heuristic
      fallback the legacy stack used and reports `tft_source`
      (`temporal_vitals_fallback` vs `live_tft`) so provenance is auditable.

## 5. Before production

- [ ] **Email sending**: the Supabase **built-in email service is the current setup and is fine for development** (already active, nothing to configure). Before launch, configure real SMTP credentials (Project Settings → Auth → SMTP) with a branded sender domain — the built-in sender is hard rate-limited (~3–4 emails/hour) and lands in spam.
- [ ] **Customize email templates** (Auth → Emails → Templates): confirm-signup and reset-password copy, branded footer, and correct `{{ .ConfirmationURL }}` usage.
- [ ] Stand up the production frontend host and set the same `VITE_*` env vars (plus Supabase URL config + Turnstile domains) for its real domain.
- [ ] Enable backups / point-in-time recovery on the production Supabase project.
- [ ] Review Auth rate limits for login brute-force protection; consider TOTP MFA for admin accounts.

## 6. Nice-to-haves (roadmap)

- ~~Email-enumeration protection on signup~~ — done in the hardening pass
  (neutral "user already exists" copy); the "always show check-your-inbox"
  variant is still worth considering.
- Brand the loading splash (it already uses the masthead).
- MFA enrollment UI when MFA goes live.
- Retroactive batch scoring of unscored assessments once the engine is live.
- Supabase Realtime channel on `patients`/`assessments` for the monitor auto-sync.

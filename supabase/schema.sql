-- Pal.se — Supabase auth companion schema.
-- Run ONCE in the Supabase SQL editor (Dashboard -> SQL -> New query).
-- Safe to re-run: object creation guards for idempotency are included.

-- ---------------------------------------------------------------------------
-- 1. profiles
--    Public mirror of auth.users holding the signup metadata (first/last
--    name). Rows are created automatically by the trigger in section 3.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  first_name text not null
    constraint profiles_first_name_length check (char_length(btrim(first_name)) between 1 and 100),
  last_name text not null
    constraint profiles_last_name_length check (char_length(btrim(last_name)) between 1 and 100),
  department text,
  role text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Signup metadata for auth.users. Inserted by handle_new_user(); mirrored names come from raw_user_meta_data at signup.';

-- Row Level Security: users may only see and edit their own row.
alter table public.profiles enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
  on public.profiles
  for select
  to anon, authenticated
  using (auth.uid() = id);

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- 2. updated_at maintenance
-- ---------------------------------------------------------------------------
create extension if not exists moddatetime with schema extensions;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update
  on public.profiles
  for each row
  execute function extensions.moddatetime(updated_at);

-- ---------------------------------------------------------------------------
-- 3. Signup trigger
--    Copies profile info out of the signup call's `options.data` metadata
--    (first_name / last_name passed by supabase-js) when a new user row is
--    created. SECURITY DEFINER so the insert succeeds even though the user
--    has no session yet (email confirmation pending).
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, first_name, last_name)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'first_name'), ''), 'Unknown'),
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'last_name'), ''), 'Unknown')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert
  on auth.users
  for each row
  execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 4. Clinical data: patients
--    Team model: every authenticated user can read the registry; writes are
--    scoped to the creator. Multi-clinic isolation (org_id) comes later.
-- ---------------------------------------------------------------------------
create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users (id) on delete cascade,
  mrn text unique,
  first_name text not null
    constraint patients_first_name_length check (char_length(btrim(first_name)) between 1 and 100),
  last_name text not null
    constraint patients_last_name_length check (char_length(btrim(last_name)) between 1 and 100),
  sex text
    constraint patients_sex_values check (sex in ('female', 'male')),
  date_of_birth date,
  gestational_age_weeks numeric
    constraint patients_ga_range check (gestational_age_weeks between 20 and 45),
  birth_weight_grams numeric
    constraint patients_bw_range check (birth_weight_grams between 200 and 8000),
  delivery_mode text
    constraint patients_delivery_mode_values check (delivery_mode in ('vaginal', 'cesarean')),
  -- Manual until the ML prediction engine is connected; the registry page
  -- manages it from Phase 2 onward.
  risk_level text not null default 'pending'
    constraint patients_risk_level_values check (risk_level in ('pending', 'low', 'moderate', 'high')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.patients is
  'Neonatal patient registry. risk_level is set automatically by engine scoring (with manual fallback); outcome records the retroactive clinical confirmation.';

create index if not exists patients_created_by_idx on public.patients (created_by);
create index if not exists patients_risk_level_idx on public.patients (risk_level);

alter table public.patients enable row level security;

drop policy if exists patients_team_select on public.patients;
create policy patients_team_select
  on public.patients
  for select
  to authenticated
  using (true);

drop policy if exists patients_insert_own on public.patients;
create policy patients_insert_own
  on public.patients
  for insert
  to authenticated
  with check (created_by = auth.uid());

drop policy if exists patients_update_own on public.patients;
create policy patients_update_own
  on public.patients
  for update
  to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

drop policy if exists patients_delete_own on public.patients;
create policy patients_delete_own
  on public.patients
  for delete
  to authenticated
  using (created_by = auth.uid());

drop trigger if exists patients_touch_updated_at on public.patients;
create trigger patients_touch_updated_at
  before update
  on public.patients
  for each row
  execute function extensions.moddatetime(updated_at);

-- ---------------------------------------------------------------------------
-- 5. Clinical data: assessments
--    One row per completed (or draft) wizard run. Sections are stored as
--    JSONB blobs so the schema can evolve before the prediction engine is
--    connected.
-- ---------------------------------------------------------------------------
create table if not exists public.assessments (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users (id) on delete cascade,
  patient_id uuid not null references public.patients (id) on delete cascade,
  status text not null default 'draft'
    constraint assessments_status_values check (status in ('draft', 'complete')),
  demographic jsonb not null default '{}'::jsonb,
  maternal jsonb not null default '{}'::jsonb,
  neonatal jsonb not null default '{}'::jsonb,
  vitals jsonb not null default '{}'::jsonb,
  laboratory jsonb not null default '{}'::jsonb,
  treatment jsonb not null default '{}'::jsonb,
  comorbidities jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.assessments is
  'Wizard intake data per patient. Scored by the EOS inference service (service/); results land in the prediction column.';

create index if not exists assessments_patient_id_idx on public.assessments (patient_id);
create index if not exists assessments_created_by_idx on public.assessments (created_by);

alter table public.assessments enable row level security;

drop policy if exists assessments_team_select on public.assessments;
create policy assessments_team_select
  on public.assessments
  for select
  to authenticated
  using (true);

drop policy if exists assessments_insert_own on public.assessments;
create policy assessments_insert_own
  on public.assessments
  for insert
  to authenticated
  with check (created_by = auth.uid());

drop policy if exists assessments_update_own on public.assessments;
create policy assessments_update_own
  on public.assessments
  for update
  to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

drop policy if exists assessments_delete_own on public.assessments;
create policy assessments_delete_own
  on public.assessments
  for delete
  to authenticated
  using (created_by = auth.uid());

drop trigger if exists assessments_touch_updated_at on public.assessments;
create trigger assessments_touch_updated_at
  before update
  on public.assessments
  for each row
  execute function extensions.moddatetime(updated_at);

-- ---------------------------------------------------------------------------
-- 6. Engine scoring (schema v3)
--    The EOS inference service returns the legacy build_prediction contract;
--    the frontend persists the full box on the assessment (prediction) plus
--    denormalized columns for querying. patients.outcome records the
--    retroactive clinical confirmation that makes accuracy stats computable.
--    All statements are idempotent — safe to re-run after upgrading.
-- ---------------------------------------------------------------------------
alter table public.assessments
  add column if not exists prediction jsonb,
  add column if not exists predicted_at timestamptz;

create index if not exists assessments_predicted_at_idx on public.assessments (predicted_at);

-- The Laboratory wizard step (M2) sends a seventh section column.
alter table public.assessments
  add column if not exists laboratory jsonb not null default '{}'::jsonb;

comment on column public.assessments.laboratory is
  'LabSection JSONB: crp_mg_l / wbc_count / platelet_count (optional; empty = not ordered).';

comment on column public.assessments.prediction is
  'StoredPrediction JSONB: probability, risk_label, decision_threshold, predicted_eos, xgb/tft branch probabilities, tft_source, inference_ms, interpretation, recommended_actions.';
comment on column public.assessments.predicted_at is
  'When the inference service scored this assessment (null = unscored/draft).';

-- patients.outcome: engine-scoring is a prediction, not a diagnosis. The
-- clinician records what actually happened so Reports can compute accuracy.
alter table public.patients
  add column if not exists outcome text
    default 'pending'
    constraint patients_outcome_values check (outcome in ('pending', 'confirmed_eos', 'ruled_out'));

comment on column public.patients.outcome is
  'Retroactive clinical confirmation (pending until recorded). Accuracy on /reports agrees confirmed_eos with predicted_eos.';

create index if not exists patients_outcome_idx on public.patients (outcome);

-- ---------------------------------------------------------------------------
-- 7. Privileges (schema v4)
--    RLS decides WHICH rows each query sees; these grants decide whether the
--    API roles may touch the schema at all. Some projects lose the default
--    grants Supabase normally attaches to the SQL-editor role — queries then
--    fail with 42501 "permission denied for table <t>". This block restores
--    them and pins future tables the same way. Idempotent.
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant all privileges on all tables    in schema public to anon, authenticated;
grant all privileges on all sequences in schema public to anon, authenticated;

alter default privileges in schema public grant all on tables    to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. Ownership defaults (schema v5)
--    The frontend never sends created_by — the server supplies it from the
--    JWT. This is spoof-proof (client can't claim another user's rows) and
--    satisfies the same-value RLS checks on insert. Idempotent re-runs are
--    no-ops (set default is not conditional but converges to the same state).
-- ---------------------------------------------------------------------------
alter table public.patients
  alter column created_by set default auth.uid();

alter table public.assessments
  alter column created_by set default auth.uid();

-- ---------------------------------------------------------------------------
-- 9. Clinical data: vital_observations (schema v6)
--    Time series behind /monitor's live charts: one row per recorded set of
--    readings. Earlier/later ordering is `recorded_at`, which the clinician
--    may backdate — the wizard's vitals remain point-in-time snapshots on
--    the assessment row, while this table accumulates every reading.
--    An observation must carry at least one vital value.
--    Idempotent re-run safe.
-- ---------------------------------------------------------------------------
create table if not exists public.vital_observations (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  patient_id uuid not null references public.patients (id) on delete cascade,
  assessment_id uuid references public.assessments (id) on delete set null,
  recorded_at timestamptz not null default now(),
  heart_rate_bpm numeric
    constraint vital_observations_hr_range check (heart_rate_bpm between 0 and 400),
  temperature_c numeric
    constraint vital_observations_temp_range check (temperature_c between 25 and 45),
  sbp_mmhg numeric
    constraint vital_observations_sbp_range check (sbp_mmhg between 0 and 300),
  dbp_mmhg numeric
    constraint vital_observations_dbp_range check (dbp_mmhg between 0 and 200),
  oxygen_saturation_pct numeric
    constraint vital_observations_o2_range check (oxygen_saturation_pct between 0 and 100),
  respiratory_rate_per_min numeric
    constraint vital_observations_rr_range check (respiratory_rate_per_min between 0 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vital_observations_has_values check (
    heart_rate_bpm is not null
    or temperature_c is not null
    or sbp_mmhg is not null
    or dbp_mmhg is not null
    or oxygen_saturation_pct is not null
    or respiratory_rate_per_min is not null
  )
);

comment on table public.vital_observations is
  'Vital-sign readings over time (earlier/later records). Charts on /monitor read this time series; SBP/DBP are separate columns.';

create index if not exists vital_observations_patient_recorded_idx
  on public.vital_observations (patient_id, recorded_at desc);

alter table public.vital_observations enable row level security;

drop policy if exists vital_observations_team_select on public.vital_observations;
create policy vital_observations_team_select
  on public.vital_observations
  for select
  to authenticated
  using (true);

drop policy if exists vital_observations_insert_own on public.vital_observations;
create policy vital_observations_insert_own
  on public.vital_observations
  for insert
  to authenticated
  with check (created_by = auth.uid());

drop policy if exists vital_observations_update_own on public.vital_observations;
create policy vital_observations_update_own
  on public.vital_observations
  for update
  to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

drop policy if exists vital_observations_delete_own on public.vital_observations;
create policy vital_observations_delete_own
  on public.vital_observations
  for delete
  to authenticated
  using (created_by = auth.uid());

drop trigger if exists vital_observations_touch_updated_at on public.vital_observations;
create trigger vital_observations_touch_updated_at
  before update
  on public.vital_observations
  for each row
  execute function extensions.moddatetime(updated_at);

alter table public.vital_observations
  alter column created_by set default auth.uid();

-- Realtime: charts subscribe to postgres_changes on this table. REPLICA
-- IDENTITY FULL makes DELETE events carry the old row (so listeners can
-- remove it by id); the publication addition is skipped when the table is
-- already a member (adding twice raises a duplicate-object error).
alter table public.vital_observations replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'vital_observations'
  ) then
    alter publication supabase_realtime add table public.vital_observations;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 10. Schema v7 — organizations, real roles, admin approval, org isolation
--     Replaces the "team model" with organization-scoped access. Key moves:
--       * profiles.role (free-text job title) becomes profiles.job_title; a
--         real `role` enum (clinician/admin) is added alongside status.
--       * organizations group everyone; every clinical row carries org_id.
--       * RLS policies filter by the caller's own profiles.org_id, so two
--         organizations can never see each other's data.
--       * accounts self-registered as admins sit in status 'pending' until a
--         superadmin approves them (see supabase/functions/).
--       * audit_logs and password_reset_requests power the /admin console.
--     Idempotent: safe to re-run in the SQL editor.
-- ---------------------------------------------------------------------------

-- Roles & statuses -----------------------------------------------------------
do $$
begin
  create type public.user_role as enum ('clinician', 'admin');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.account_status as enum ('pending', 'active', 'disabled');
exception
  when duplicate_object then null;
end $$;

-- Organizations --------------------------------------------------------------
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null
    constraint organizations_name_length check (char_length(btrim(name)) between 2 and 120),
  invite_code text not null unique
    constraint organizations_invite_code_format check (invite_code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.organizations is
  'A hospital / clinic group. All members (admins + clinicians) belong to exactly one organization; clinical data never crosses organizations.';

alter table public.organizations enable row level security;

drop trigger if exists organizations_touch_updated_at on public.organizations;
create trigger organizations_touch_updated_at
  before update
  on public.organizations
  for each row
  execute function extensions.moddatetime(updated_at);

create or replace function public.generate_invite_code()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  candidate text;
begin
  loop
    candidate := '';
    for i in 1 .. 8 loop
      candidate := candidate || substr('ABCDEFGHJKLMNPQRSTUVWXYZ34679', floor(random() * 28)::int + 1, 1);
    end loop;
    exit when not exists (
      select 1 from public.organizations o where o.invite_code = candidate
    );
  end loop;
  return candidate;
end;
$$;

-- profiles: real roles, status, org membership --------------------------------
alter table public.profiles
  add column if not exists email text;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'role'
  ) then
    alter table public.profiles rename column role to job_title;
  end if;
end $$;

alter table public.profiles
  add column if not exists role public.user_role not null default 'clinician',
  add column if not exists status public.account_status not null default 'active',
  add column if not exists org_id uuid references public.organizations (id) on delete set null,
  add column if not exists must_set_password boolean not null default false;

comment on column public.profiles.role is
  'App role: clinician (patient-facing) or admin (manages the organization and its accounts via /admin). Managed by administrators; clients cannot change it.';
comment on column public.profiles.status is
  'pending = awaiting superadmin approval (admin signups), active = usable, disabled = locked out. Managed by administrators.';
comment on column public.profiles.job_title is
  'Free-text job title kept from the original signup (e.g. Neonatologist). Displays in the top bar; editable by the owner.';

create index if not exists profiles_org_idx on public.profiles (org_id);
create index if not exists profiles_role_idx on public.profiles (role, status);

-- Copy the email into the mirror for admin listings (one-shot backfill).
update public.profiles
set email = (select u.email from auth.users u where u.id = profiles.id)
where email is null;

-- Caller helpers (SECURITY DEFINER so RLS evaluation can use them without
-- recursing into the profiles policies). Must live after profiles.org_id
-- exists: SQL-function bodies are fully analyzed at creation time.
create or replace function public.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select org_id from public.profiles where id = auth.uid()
$$;

create or replace function public.current_app_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = auth.uid()
$$;

-- Organization RLS: members can read their own organization's record.
drop policy if exists organizations_select_own on public.organizations;
create policy organizations_select_own
  on public.organizations
  for select
  to authenticated
  using (id = public.current_org_id());

-- Protect privileged columns: an authenticated user may edit their own row's
-- display fields only. role / status / org_id change exclusively through the
-- SECURITY DEFINER RPCs, the signup trigger, or service_role (Edge Functions).
create or replace function public.enforce_profile_guard()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('service_role', 'supabase_admin', 'postgres') then
    return new;
  end if;
  if new.id is distinct from old.id
    or new.role is distinct from old.role
    or new.status is distinct from old.status
    or new.org_id is distinct from old.org_id
  then
    raise exception 'profiles: role, status and org_id are managed by administrators only';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard
  before update
  on public.profiles
  for each row
  execute function public.enforce_profile_guard();

-- profiles policies: own row always; org members can see their colleagues
-- (that is how an admin lists the members of the organization).
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
  on public.profiles
  for select
  to anon, authenticated
  using (auth.uid() = id);

drop policy if exists profiles_org_select on public.profiles;
create policy profiles_org_select
  on public.profiles
  for select
  to authenticated
  using (org_id is not null and org_id = public.current_org_id());

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Signup trigger v2: copies email through and routes self-registrations.
--   options.data.requested_role = 'admin'  -> role admin, status PENDING
--   otherwise (stray self-signup)          -> role clinician, status DISABLED
-- Accounts only ever become usable through superadmin approval (admin requests)
-- or the Edge Function provisions clinicians (email_confirmed + org).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  wants_admin boolean := new.raw_user_meta_data ->> 'requested_role' = 'admin';
begin
  insert into public.profiles (id, first_name, last_name, email, role, status)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'first_name'), ''), 'Unknown'),
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'last_name'), ''), 'Unknown'),
    coalesce(new.email, ''),
    case when wants_admin then 'admin' else 'clinician' end,
    case when wants_admin then 'pending' else 'disabled' end
  )
  on conflict (id) do nothing;

  -- Best-effort audit entry: account creation must never fail because of the
  -- audit trail (e.g. during partially-applied schema migrations).
  begin
    insert into public.audit_logs (org_id, actor_id, actor_email, action, entity, entity_id, metadata)
    values (
      null,
      null,
      new.email,
      case when wants_admin then 'admin.requested' else 'account.self_signup' end,
      'account',
      new.id,
      jsonb_build_object('first_name', new.raw_user_meta_data ->> 'first_name',
                         'last_name', new.raw_user_meta_data ->> 'last_name')
    );
  exception when others then
    -- Logged in Postgres logs rather than swallowed silently — still saved
    -- best-effort: never blocks account creation.
    raise warning 'handle_new_user: audit write failed (%), skipping', sqlerrm;
  end;
  return new;
end;
$$;

-- Organization RPCs (admin onboarding: create org or join via invite code) -----
create or replace function public.create_organization(org_name text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_row public.profiles%rowtype;
  new_id uuid;
begin
  if caller is null then
    raise exception 'Sign in first.';
  end if;

  select * into caller_row from public.profiles where id = caller;

  if caller_row.role <> 'admin' or caller_row.status <> 'active' then
    raise exception 'Only approved administrators can create an organization.';
  end if;
  if caller_row.org_id is not null then
    raise exception 'You already belong to an organization.';
  end if;
  if btrim(org_name) is null or char_length(btrim(org_name)) not between 2 and 120 then
    raise exception 'Organization name must be 2-120 characters.';
  end if;

  insert into public.organizations (name, invite_code, created_by)
  values (btrim(org_name), public.generate_invite_code(), caller)
  returning id into new_id;

  update public.profiles set org_id = new_id where id = caller;

  insert into public.audit_logs (org_id, actor_id, actor_email, action, entity, entity_id, metadata)
  values (new_id, caller, caller_row.email, 'org.create', 'organization', new_id,
          jsonb_build_object('name', btrim(org_name)));

  return new_id;
end;
$$;

create or replace function public.join_organization(candidate_code text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_row public.profiles%rowtype;
  org_row public.organizations%rowtype;
  normalised text := upper(btrim(candidate_code));
begin
  if caller is null then
    raise exception 'Sign in first.';
  end if;

  select * into caller_row from public.profiles where id = caller;
  if caller_row.role <> 'admin' or caller_row.status <> 'active' then
    raise exception 'Only approved administrators can join an organization.';
  end if;
  if caller_row.org_id is not null then
    raise exception 'You already belong to an organization.';
  end if;
  if normalised is null or normalised !~ '^[A-HJ-NP-Z2-9]{8}$' then
    raise exception 'Invite codes are 8 characters (letters and digits).';
  end if;

  select * into org_row from public.organizations where invite_code = normalised;
  if org_row.id is null then
    raise exception 'That invite code is not valid. Check it with the administrator who shared it.';
  end if;

  update public.profiles set org_id = org_row.id where id = caller;

  insert into public.audit_logs (org_id, actor_id, actor_email, action, entity, entity_id, metadata)
  values (org_row.id, caller, caller_row.email, 'org.join', 'organization', org_row.id,
          jsonb_build_object('name', org_row.name));

  return org_row.id;
end;
$$;

create or replace function public.rotate_invite_code()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_row public.profiles%rowtype;
begin
  if caller is null then
    raise exception 'Sign in first.';
  end if;

  select * into caller_row from public.profiles where id = caller;
  if caller_row.role <> 'admin' or caller_row.status <> 'active' or caller_row.org_id is null then
    raise exception 'Only approved administrators with an organization can rotate the invite code.';
  end if;

  update public.organizations
  set invite_code = public.generate_invite_code()
  where id = caller_row.org_id
  returning invite_code into caller_row;

  insert into public.audit_logs (org_id, actor_id, actor_email, action, entity, entity_id, metadata)
  values (caller_row.org_id, caller, caller_row.email, 'org.rotate_invite_code', 'organization',
          caller_row.org_id, '{}'::jsonb);

  return caller_row.invite_code;
end;
$$;

-- Clinical data org scoping ----------------------------------------------------
alter table public.patients
  add column if not exists org_id uuid references public.organizations (id) on delete cascade;

alter table public.assessments
  add column if not exists org_id uuid references public.organizations (id) on delete cascade;

alter table public.vital_observations
  add column if not exists org_id uuid references public.organizations (id) on delete cascade;

create index if not exists patients_org_idx on public.patients (org_id);
create index if not exists assessments_org_idx on public.assessments (org_id);
create index if not exists vital_observations_org_idx on public.vital_observations (org_id);

-- New rows are scoped server-side from the caller's JWT — clients never send
-- org_id themselves.
alter table public.patients
  alter column org_id set default public.current_org_id();

alter table public.assessments
  alter column org_id set default public.current_org_id();

alter table public.vital_observations
  alter column org_id set default public.current_org_id();

-- One-time backfill: everything in the existing (demo) registry lands in a
-- single default organization. Rename it afterwards in the SQL editor if the
-- deployment has a real hospital name.
insert into public.organizations (name, invite_code)
select 'Pal.se Demo Hospital', public.generate_invite_code()
where not exists (select 1 from public.organizations);

update public.profiles
set org_id = (select id from public.organizations order by created_at asc, id asc limit 1)
where org_id is null;

update public.patients p
set org_id = (select pf.org_id from public.profiles pf where pf.id = p.created_by)
where org_id is null;

update public.assessments a
set org_id = (select pa.org_id from public.patients pa where pa.id = a.patient_id)
where org_id is null;

update public.vital_observations v
set org_id = (select pa.org_id from public.patients pa where pa.id = v.patient_id)
where org_id is null;

-- Residual nulls (deleted creators, stray rows) fall into the default org.
update public.patients
set org_id = (select id from public.organizations order by created_at asc, id asc limit 1)
where org_id is null;

update public.assessments
set org_id = (select id from public.organizations order by created_at asc, id asc limit 1)
where org_id is null;

update public.vital_observations
set org_id = (select id from public.organizations order by created_at asc, id asc limit 1)
where org_id is null;

-- RLS: org isolation replaces the team model. A row is visible only inside
-- the caller's organization; writes additionally stay creator-owned.
drop policy if exists patients_team_select on public.patients;
create policy patients_org_select
  on public.patients
  for select
  to authenticated
  using (org_id = public.current_org_id());

drop policy if exists patients_insert_own on public.patients;
create policy patients_insert_own
  on public.patients
  for insert
  to authenticated
  with check (created_by = auth.uid() and org_id = public.current_org_id());

drop policy if exists patients_update_own on public.patients;
create policy patients_update_own
  on public.patients
  for update
  to authenticated
  using (created_by = auth.uid() and org_id = public.current_org_id())
  with check (created_by = auth.uid() and org_id = public.current_org_id());

drop policy if exists patients_delete_own on public.patients;
create policy patients_delete_own
  on public.patients
  for delete
  to authenticated
  using (created_by = auth.uid() and org_id = public.current_org_id());

drop policy if exists assessments_team_select on public.assessments;
create policy assessments_org_select
  on public.assessments
  for select
  to authenticated
  using (org_id = public.current_org_id());

drop policy if exists assessments_insert_own on public.assessments;
create policy assessments_insert_own
  on public.assessments
  for insert
  to authenticated
  with check (created_by = auth.uid() and org_id = public.current_org_id());

drop policy if exists assessments_update_own on public.assessments;
create policy assessments_update_own
  on public.assessments
  for update
  to authenticated
  using (created_by = auth.uid() and org_id = public.current_org_id())
  with check (created_by = auth.uid() and org_id = public.current_org_id());

drop policy if exists assessments_delete_own on public.assessments;
create policy assessments_delete_own
  on public.assessments
  for delete
  to authenticated
  using (created_by = auth.uid() and org_id = public.current_org_id());

drop policy if exists vital_observations_team_select on public.vital_observations;
create policy vital_observations_org_select
  on public.vital_observations
  for select
  to authenticated
  using (org_id = public.current_org_id());

drop policy if exists vital_observations_insert_own on public.vital_observations;
create policy vital_observations_insert_own
  on public.vital_observations
  for insert
  to authenticated
  with check (created_by = auth.uid() and org_id = public.current_org_id());

drop policy if exists vital_observations_update_own on public.vital_observations;
create policy vital_observations_update_own
  on public.vital_observations
  for update
  to authenticated
  using (created_by = auth.uid() and org_id = public.current_org_id())
  with check (created_by = auth.uid() and org_id = public.current_org_id());

drop policy if exists vital_observations_delete_own on public.vital_observations;
create policy vital_observations_delete_own
  on public.vital_observations
  for delete
  to authenticated
  using (created_by = auth.uid() and org_id = public.current_org_id());

-- Audit log ---------------------------------------------------------------------
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations (id) on delete set null,
  actor_id uuid references public.profiles (id) on delete set null,
  actor_email text,
  action text not null,
  entity text not null
    constraint audit_logs_entity_values check (entity in ('patient', 'assessment', 'vitals', 'account', 'organization', 'password_reset')),
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_org_created_idx on public.audit_logs (org_id, created_at desc);
create index if not exists audit_logs_action_idx on public.audit_logs (action);

comment on table public.audit_logs is
  'Server-generated audit trail per organization. Rows are written by SECURITY DEFINER triggers and Edge Functions — clients have no INSERT path.';

alter table public.audit_logs enable row level security;

-- Admin-only reads, scoped to the administrator's own organization.
drop policy if exists audit_logs_admin_select on public.audit_logs;
create policy audit_logs_admin_select
  on public.audit_logs
  for select
  to authenticated
  using (
    public.current_app_role() = 'admin'
    and public.current_org_id() is not null
    and org_id = public.current_org_id()
  );

create or replace function public.write_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Trigger functions cannot declare named arguments: the entity name is
  -- passed as a trigger argument and read through TG_ARGV.
  v_entity text := tg_argv[0];
  v_row jsonb;
  v_org uuid;
begin
  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_org := case
    when v_entity = 'organization' then (v_row ->> 'id')::uuid
    else (v_row ->> 'org_id')::uuid
  end;

  insert into public.audit_logs (org_id, actor_id, actor_email, action, entity, entity_id, metadata)
  values (
    v_org,
    auth.uid(),
    auth.email(),
    v_entity || case tg_op
      when 'INSERT' then '.create'
      when 'UPDATE' then '.update'
      else '.delete'
    end,
    v_entity,
    (v_row ->> 'id')::uuid,
    jsonb_build_object('op', tg_op, 'row', v_row)
  );
  return null;
end;
$$;

drop trigger if exists patients_audit on public.patients;
create trigger patients_audit
  after insert or update or delete
  on public.patients
  for each statement
  execute function public.write_audit('patient');

drop trigger if exists assessments_audit on public.assessments;
create trigger assessments_audit
  after insert or update or delete
  on public.assessments
  for each statement
  execute function public.write_audit('assessment');

drop trigger if exists vital_observations_audit on public.vital_observations;
create trigger vital_observations_audit
  after insert or update or delete
  on public.vital_observations
  for each statement
  execute function public.write_audit('vitals');

drop trigger if exists organizations_audit on public.organizations;
create trigger organizations_audit
  after insert or update or delete
  on public.organizations
  for each statement
  execute function public.write_audit('organization');

-- Password reset requests (clinician -> administrator flow) ----------------------
create table if not exists public.password_reset_requests (
  id uuid primary key default gen_random_uuid(),
  clinician_id uuid not null references public.profiles (id) on delete cascade,
  org_id uuid references public.organizations (id) on delete cascade,
  status text not null default 'pending'
    constraint password_reset_requests_status_values check (status in ('pending', 'resolved', 'cancelled')),
  note text,
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists password_reset_requests_one_pending
  on public.password_reset_requests (clinician_id, created_at)
  where status = 'pending';

create index if not exists password_reset_requests_org_idx
  on public.password_reset_requests (org_id, status, created_at desc);

comment on table public.password_reset_requests is
  'Clinician requests for an administrator-issued temporary password (clinicians get no email authentication flow).';

alter table public.password_reset_requests enable row level security;

drop policy if exists password_reset_requests_select on public.password_reset_requests;
create policy password_reset_requests_select
  on public.password_reset_requests
  for select
  to authenticated
  using (
    auth.uid() = clinician_id
    or (
      public.current_app_role() = 'admin'
      and org_id = public.current_org_id()
    )
  );

drop trigger if exists password_reset_requests_touch_updated_at on public.password_reset_requests;
create trigger password_reset_requests_touch_updated_at
  before update
  on public.password_reset_requests
  for each row
  execute function extensions.moddatetime(updated_at);

create or replace function public.request_password_reset(target_email text, note text default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
begin
  -- Silently no-op when the address is unknown or not an active clinician so
  -- the endpoint cannot be used to enumerate accounts.
  select * into v_profile
  from public.profiles
  where lower(btrim(email)) = lower(btrim(target_email))
    and role = 'clinician'
    and status = 'active'
  limit 1;

  if v_profile.id is null then
    return;
  end if;

  if exists (
    select 1 from public.password_reset_requests
    where clinician_id = v_profile.id
      and status = 'pending'
      and created_at > now() - interval '15 minutes'
  ) then
    return; -- rate limit: one outstanding request per 15 minutes
  end if;

  insert into public.password_reset_requests (clinician_id, org_id, note)
  values (v_profile.id, v_profile.org_id, nullif(btrim(coalesce(note, '')), ''));

  insert into public.audit_logs (org_id, actor_id, actor_email, action, entity, entity_id, metadata)
  values (v_profile.org_id, v_profile.id, v_profile.email, 'password_reset.requested', 'password_reset', null,
          jsonb_build_object('note', nullif(btrim(coalesce(note, '')), '')));
end;
$$;

-- Privileges (v7 tightening): the v4 blanket GRANT ALL to anon is gone. RLS
-- decides row access; these table grants decide whether a role may touch the
-- tables at all. anon gets nothing beyond schema usage.
revoke all privileges on all tables    in schema public from anon, authenticated;
revoke all privileges on all sequences in schema public from anon, authenticated;

grant select, insert, update, delete on public.profiles             to authenticated;
grant select, insert, update, delete on public.organizations        to authenticated;
grant select, insert, update, delete on public.patients             to authenticated;
grant select, insert, update, delete on public.assessments          to authenticated;
grant select, insert, update, delete on public.vital_observations   to authenticated;
grant select, update                 on public.password_reset_requests to authenticated;
grant select                         on public.audit_logs           to authenticated;

-- Privileged RPCs + Edge Function account provisioning run under the definer
-- / service_role, which bypasses these grants.
alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on sequences from anon;

-- ---------------------------------------------------------------------------
-- Profile picture + PRC-number foundation (run once via the Supabase SQL
-- editor, like the other migration files).
--
-- Adds:
--   1. profiles.avatar_url   — public CDN URL of the user's uploaded photo.
--   2. profiles.prc_number   — the clinician's PRC license number (Philippine
--                              Regulatory Commission style: 6-9 digits).
--                              Unique when present, nullable during the
--                              backfill window; clinicians sign in with
--                              PRC + password, so the backfill is REQUIRED
--                              before they can sign in again (see sign-in
--                              copy in web/src/pages/Signin.tsx).
--   3. sign_in_email_for_prc() — SECURITY DEFINER lookup that resolves a PRC
--                              number to the sign-in email of an ACTIVE
--                              clinician. Exact match only; never reveals
--                              whether a PRC exists without an active
--                              account (returns null for all misses).
--                              Format is validated here too, so a sign-in
--                              attempt with "12-34" fails without touching
--                              the profiles table.
--   4. `avatars` storage bucket (public read) + folder-scoped storage
--                              policies: authenticated users can only write
--                              inside the first-level folder named after
--                              their own auth.uid().
--
-- Safe to re-run (idempotent create-if-missing / drop-and-recreate).
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists avatar_url text;

alter table public.profiles
  add column if not exists prc_number text;

-- PRC numbers must be globally unique (they are national license numbers).
comment on column public.profiles.prc_number is
  'Clinician PRC license number (6-9 digits), unique when present. Nullable until the backfill completes; clinicians cannot sign in without one.';

-- PRC numbers are national license numbers: globally unique when present.
-- Partial unique index (null PRCs are excluded) so the backfill window is safe.
create unique index if not exists profiles_prc_number_unique
  on public.profiles (prc_number)
  where prc_number is not null;

-- Helper shared by create/update validation (mirrors web/src/lib/validation.ts).
create or replace function public.is_valid_prc(p_prc text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_prc is not null and p_prc ~ '^[0-9]{6,9}$';
$$;

-- Resolves an ACTIVE clinician's sign-in email for a given PRC number.
-- SECURITY DEFINER so a pre-authentication caller (anon) can perform just
-- this exact-match lookup; RLS on profiles would otherwise fully hide the
-- table before sign-in. Returns null whenever the PRC is invalid, unknown,
-- or not tied to an active clinician — the sign-in form then reports a
-- single generic message, never distinguishing "no such PRC" from
-- "inactive account".
create or replace function public.sign_in_email_for_prc(p_prc text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select pr.email
  from public.profiles pr
  where pr.prc_number = btrim(p_prc)
    and pr.role = 'clinician'
    and pr.status = 'active'
  limit 1;
$$;

revoke all on function public.sign_in_email_for_prc(text) from public;
grant execute on function public.sign_in_email_for_prc(text) to anon, authenticated;

revoke all on function public.is_valid_prc(text) from public;
grant execute on function public.is_valid_prc(text) to authenticated, service_role;

-- ------------------------------ Storage ------------------------------------
-- Public-read bucket for profile photos; writes are folder-scoped to the
-- owner's uid (storage.foldername(name))[1]).
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists avatars_read on storage.objects;
create policy avatars_read
  on storage.objects
  for select
  to public
  using (bucket_id = 'avatars');

drop policy if exists avatars_insert_own on storage.objects;
create policy avatars_insert_own
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists avatars_update_own on storage.objects;
create policy avatars_update_own
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists avatars_delete_own on storage.objects;
create policy avatars_delete_own
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

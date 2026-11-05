-- ---------------------------------------------------------------------------
-- Patient identity v2: a single optional `initials` field. The MRN is the
-- required cross-system identifier; names leave the registry entirely.
--
-- Legacy rows keep their identity by compressing first_name + last_name into
-- initials before the rename, so nothing becomes "—" or unlabelled.
--
-- Safe to run once (destructive: drops last_name); run via the Supabase SQL
-- editor like the other migration files.
-- ---------------------------------------------------------------------------

-- 1. Compress the legacy name parts into initials while both columns exist.
--    "Maria" + "Santos" -> "MS". Rows whose parts are blank end up "".
update public.patients
  set first_name = left(btrim(first_name), 1) || left(btrim(last_name), 1);

-- 2. Drop the old name schema.
alter table public.patients
  drop constraint if exists patients_first_name_length;

alter table public.patients
  drop column if exists last_name;

-- 3. Rename to `initials` and relax the nullability — initials are optional.
alter table public.patients
  rename column first_name to initials;

alter table public.patients
  alter column initials drop not null;

-- 4. Length cap: 1-4 characters when present (trimmed, e.g. "MC").
alter table public.patients
  add constraint patients_initials_length
    check (initials is null or (char_length(btrim(initials)) between 1 and 4));

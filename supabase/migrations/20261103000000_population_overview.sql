-- ---------------------------------------------------------------------------
-- Population analytics for the clinical dashboard overview.
--
-- Two org-scoped aggregate functions (NO identifiers ever leave the DB, and
-- the caller never passes an organization id — scoping comes from the
-- caller's own profile row through the standard RLS policies, exactly like
-- the patients.org_select / assessments.org_select policies in schema.sql):
--
--   population_overview()            -> current tier snapshot (this "now")
--   risk_trend(p_days, p_tz)         -> day-by-day tier reconstruction
--
-- Both are STABLE and SECURITY INVOKER: they run with the caller's
-- privileges, so Row Level Security (org isolation) applies automatically.
--
-- Tier semantics (shared with the app's own scoring flow):
--   * a patient's tier at time t = the tier of their most recent SCORED
--     assessment on or before t (predictions are stamped at scoring time in
--     assessments.predicted_at), or 'pending' if they have none — including
--     assessments that are stored but not yet scored (predicted_at null).
--   * App tier vocabulary: ('pending','low','moderate','high') — see
--     patients.risk_level; assessment predictions store legacy labels
--     ('HIGH RISK' / 'MODERATE RISK' / 'LOW RISK') in
--     assessments.prediction->>'risk_label'. Both representations are mapped
--     here; thresholds live in the engine (service/app/ml/ensemble.py) and
--     are NOT duplicated in SQL.
--   * population_overview() reads the denormalized patients.risk_level — the
--     source of truth the app itself displays (kept in sync at scoring time)
--     — so the overview always agrees with the Patients registry filters.
--     risk_trend() reconstructs history from assessments, because the
--     denormalized column has no per-day history.
--   * soft-deleted/archived patients: the schema has no such concept (hard
--     deletes), so nothing is excluded on that basis.
--
-- Safe to re-run (create or replace everywhere). Run once via the Supabase
-- SQL editor, matching supabase/schema.sql's usage.
-- ---------------------------------------------------------------------------

-- Validate a caller-supplied IANA zone name; anything invalid falls back to
-- UTC instead of failing the whole aggregate.
create or replace function public.population_local_timezone(p_tz text)
returns text
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_tz is null or length(btrim(p_tz)) = 0 then
    return 'UTC';
  end if;
  -- timezone(text, timestamptz) raises invalid_parameter_value for unknown zones.
  perform (now() at time zone btrim(p_tz));
  return btrim(p_tz);
exception
  when others then
    return 'UTC';
end;
$$;

-- Current snapshot: how many patients sit in each tier right now. Rows are
-- zero-filled so every tier always exists (donuts render 0 pairs, never NaN).
create or replace function public.population_overview()
returns table (tier text, patient_count int)
language sql
stable
security invoker
set search_path = ''
as $$
  with tiers(tier) as (
    values ('high'::text), ('moderate'), ('low'), ('pending')
  )
  select
    t.tier,
    coalesce(c.patient_count, 0)::int as patient_count
  from tiers t
  left join (
    select
      p.risk_level as tier,
      count(*)::int as patient_count
    from public.patients p
    where p.org_id = public.current_org_id()
    group by p.risk_level
  ) c on c.tier = t.tier
  order by
    array_position(array['high', 'moderate', 'low', 'pending'], t.tier)
$$;

--
-- Daily trend: tier of every patient at the END of each day in the window.
-- * only patients that existed by that day's end (created_at before its
--   end-of-day boundary in the requested time zone) are counted
-- * day boundaries are computed in p_tz (IANA zone; default 'UTC')
-- * p_days clamps to 1..90
-- * zero-filled: every day always has all four tiers
-- * no patient identifiers are returned — counts only
--
create or replace function public.risk_trend(
  p_days int default 14,
  p_tz text default 'UTC'
)
returns table (day date, tier text, patient_count int)
language sql
stable
security invoker
set search_path = ''
as $$
  with params as (
    select
      least(greatest(coalesce(p_days, 14), 1), 90) as day_count,
      public.population_local_timezone(p_tz) as tz
  ),
  bounds as (
    select
      generate_series(
        ((now() at time zone pz.tz)::date - (pz.day_count - 1))::date,
        (now() at time zone pz.tz)::date,
        interval '1 day'
      )::date as end_day
    from params pz
  ),
  tiers(tier) as (
    values ('high'::text), ('moderate'), ('low'), ('pending')
  ),
  scored as (
    select
      a.patient_id,
      a.predicted_at,
      case
        when a.prediction ->> 'risk_label' ilike 'HIGH%' then 'high'
        when a.prediction ->> 'risk_label' ilike 'MODERATE%' then 'moderate'
        when a.prediction ->> 'risk_label' ilike 'LOW%' then 'low'
      end as tier
    from public.assessments a
    where a.predicted_at is not null
      and a.prediction is not null
  ),
  -- Every (day, patient) pair for patients that existed by that day's end.
  patient_days as (
    select b.end_day, p.id as patient_id
    from params pz
    cross join bounds b
    join public.patients p
      on p.org_id = public.current_org_id()
     and p.created_at < timezone(pz.tz, (b.end_day + 1)::timestamp)
  ),
  resolved as (
    -- Tier = most recent SCORED assessment on or before the day's end;
    -- null => pending (never scored, or stored-but-unscored drafts).
    select
      pz.tz,
      pd.end_day as day,
      pd.patient_id,
      (
        select s.tier
        from scored s
        where s.patient_id = pd.patient_id
          and s.predicted_at < timezone(pz.tz, (pd.end_day + 1)::timestamp)
        order by s.predicted_at desc
        limit 1
      ) as tier
    from params pz
    cross join patient_days pd
  ),
  grid as (
    select b.end_day as day, t.tier
    from bounds b
    cross join tiers t
  )
  select
    g.day,
    g.tier,
    count(*) filter (where coalesce(r.tier, 'pending') = g.tier)::int as patient_count
  from grid g
  left join resolved r on r.day = g.day
  group by g.day, g.tier
  order by g.day, array_position(array['high', 'moderate', 'low', 'pending'], g.tier)
$$;

-- ---------------------------------------------------------------------------
-- Indexes that make the aggregates cheap.
--   assessments_patient_predicted_idx: the per-patient "latest scored
--     assessment at or before T" lookup (partial: draft/unscored rows are out).
--   patients_org_created_idx / patients_org_risk_idx: the window scan and the
--     overview group-by.
-- ---------------------------------------------------------------------------
create index if not exists assessments_patient_predicted_idx
  on public.assessments (patient_id, predicted_at desc)
  where predicted_at is not null;

create index if not exists patients_org_created_idx
  on public.patients (org_id, created_at);

create index if not exists patients_org_risk_idx
  on public.patients (org_id, risk_level);

-- Access control: authenticated users only (RLS on the underlying tables
-- still decides which org's rows a caller may see; anon gets nothing).
revoke execute on function public.population_local_timezone(text) from anon;
revoke execute on function public.population_overview()          from anon;
revoke execute on function public.risk_trend(int, text)          from anon;

grant execute on function public.population_local_timezone(text) to authenticated;
grant execute on function public.population_overview()           to authenticated;
grant execute on function public.risk_trend(int, text)           to authenticated;

comment on function public.population_overview() is
  'Tier snapshot for the caller''s organization through RLS; zero-filled across pending/low/moderate/high.';
comment on function public.risk_trend(int, text) is
  'Day-by-day tier counts (end-of-day state) for p_days 1..90 in the requested IANA zone; zero-filled.';

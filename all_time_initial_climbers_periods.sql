-- Create the two approved initial Climbers periods for the current production
-- cadence. This migration does not create events, award points, or touch
-- All-Time observations/PBs or the legacy baseline.
--
-- The migration is intentionally limited to an empty catalog or to a catalog
-- containing only these exact rows. It must be reviewed before execution.

begin;

do $guard$
declare
  v_now timestamptz := clock_timestamp();
  v_created_by uuid := '0d93ca19-289a-4929-a093-c7556e6d51ed'::uuid;
begin
  perform pg_advisory_xact_lock(hashtext('krys-leagues:initial-climbers-periods:v1'));

  if to_regclass('public.climbers_seasons') is null
     or to_regclass('public.site_admin_users') is null
     or to_regclass('auth.users') is null then
    raise exception 'Required Climbers, site-admin, and auth tables are missing';
  end if;

  if v_now < timestamptz '2026-08-29 00:00:00+00'
     or v_now >= timestamptz '2026-09-12 00:00:00+00' then
    raise exception 'This initial-period migration is only valid while the approved Aug 29–Sep 11, 2026 period is current';
  end if;

  if not exists (
    select 1
    from auth.users as auth_user
    where auth_user.id = v_created_by
  ) then
    raise exception 'The approved created_by UUID does not exist in auth.users: %', v_created_by;
  end if;

  if not exists (
    select 1
    from public.site_admin_users as site_admin
    where site_admin.user_id = v_created_by
  ) then
    raise exception 'The approved created_by UUID is not a site admin: %', v_created_by;
  end if;

  if exists (
    select 1
    from public.climbers_seasons as s
    where not (
      (s.starts_at = timestamptz '2026-08-15 00:00:00+00'
       and s.ends_at = timestamptz '2026-08-29 00:00:00+00')
      or
      (s.starts_at = timestamptz '2026-08-29 00:00:00+00'
       and s.ends_at = timestamptz '2026-09-12 00:00:00+00')
    )
  ) then
    raise exception 'Unexpected existing Climbers season row found; no rows were changed';
  end if;

  if (
    select count(*)
    from public.climbers_seasons as s
    where s.starts_at = timestamptz '2026-08-15 00:00:00+00'
      and s.ends_at = timestamptz '2026-08-29 00:00:00+00'
  ) > 1 then
    raise exception 'Duplicate Aug 15–Aug 28, 2026 Climbers rows already exist';
  end if;

  if (
    select count(*)
    from public.climbers_seasons as s
    where s.starts_at = timestamptz '2026-08-29 00:00:00+00'
      and s.ends_at = timestamptz '2026-09-12 00:00:00+00'
  ) > 1 then
    raise exception 'Duplicate Aug 29–Sep 11, 2026 Climbers rows already exist';
  end if;

  if exists (
    select 1
    from public.climbers_seasons as s
    where s.starts_at = timestamptz '2026-08-15 00:00:00+00'
      and s.ends_at = timestamptz '2026-08-29 00:00:00+00'
      and (
        s.label is distinct from 'Aug 15–Aug 28, 2026'
        or s.status <> 'awaiting_finalization'
        or s.finalized_at is not null
        or s.finalized_by is not null
      )
  ) then
    raise exception 'Existing Aug 15–Aug 28, 2026 row has an unexpected label or state';
  end if;

  if exists (
    select 1
    from public.climbers_seasons as s
    where s.starts_at = timestamptz '2026-08-29 00:00:00+00'
      and s.ends_at = timestamptz '2026-09-12 00:00:00+00'
      and (
        s.label is distinct from 'Aug 29–Sep 11, 2026'
        or s.status <> 'active'
        or s.finalized_at is not null
        or s.finalized_by is not null
      )
  ) then
    raise exception 'Existing Aug 29–Sep 11, 2026 row has an unexpected label or state';
  end if;

  if not exists (
    select 1
    from public.climbers_seasons as s
    where s.starts_at = timestamptz '2026-08-15 00:00:00+00'
      and s.ends_at = timestamptz '2026-08-29 00:00:00+00'
  ) then
    insert into public.climbers_seasons (
      label,
      starts_at,
      ends_at,
      status,
      created_by
    ) values (
      'Aug 15–Aug 28, 2026',
      timestamptz '2026-08-15 00:00:00+00',
      timestamptz '2026-08-29 00:00:00+00',
      'awaiting_finalization',
      v_created_by
    );
  end if;

  if not exists (
    select 1
    from public.climbers_seasons as s
    where s.starts_at = timestamptz '2026-08-29 00:00:00+00'
      and s.ends_at = timestamptz '2026-09-12 00:00:00+00'
  ) then
    insert into public.climbers_seasons (
      label,
      starts_at,
      ends_at,
      status,
      created_by
    ) values (
      'Aug 29–Sep 11, 2026',
      timestamptz '2026-08-29 00:00:00+00',
      timestamptz '2026-09-12 00:00:00+00',
      'active',
      v_created_by
    );
  end if;
end;
$guard$;

do $verify$
declare
  v_total integer;
  v_first integer;
  v_current integer;
begin
  select count(*) into v_total
  from public.climbers_seasons;

  select count(*) into v_first
  from public.climbers_seasons
  where starts_at = timestamptz '2026-08-15 00:00:00+00'
    and ends_at = timestamptz '2026-08-29 00:00:00+00'
    and label = 'Aug 15–Aug 28, 2026'
    and status = 'awaiting_finalization'
    and finalized_at is null
    and finalized_by is null;

  select count(*) into v_current
  from public.climbers_seasons
  where starts_at = timestamptz '2026-08-29 00:00:00+00'
    and ends_at = timestamptz '2026-09-12 00:00:00+00'
    and label = 'Aug 29–Sep 11, 2026'
    and status = 'active'
    and finalized_at is null
    and finalized_by is null;

  if v_total <> 2 or v_first <> 1 or v_current <> 1 then
    raise exception 'Initial Climbers period verification failed: total %, first %, current %', v_total, v_first, v_current;
  end if;
end;
$verify$;

-- Read-only verification result. The Previous Period flag mirrors the entry
-- page: loaded statuses only, ended rows only, latest ended period selected.
with evaluation as (
  select clock_timestamp() as evaluated_at
),
period_rows as (
  select
    s.id,
    s.label,
    s.starts_at,
    s.ends_at,
    s.status,
    s.finalized_at,
    s.finalized_by,
    e.evaluated_at,
    (
      s.status = 'active'
      and s.starts_at <= e.evaluated_at
      and s.ends_at > e.evaluated_at
    ) as qualifies_current_period,
    (
      s.status in ('active', 'awaiting_finalization')
      and s.ends_at <= e.evaluated_at
    ) as previous_candidate
  from public.climbers_seasons as s
  cross join evaluation as e
),
previous_analysis as (
  select
    p.*,
    max(p.ends_at) filter (where p.previous_candidate) over () as latest_previous_end,
    count(*) filter (where p.previous_candidate) over (partition by p.ends_at) as same_end_previous_candidates
  from period_rows as p
),
classified as (
  select
    p.*,
    (
      p.previous_candidate
      and p.ends_at = p.latest_previous_end
      and p.same_end_previous_candidates = 1
    ) as qualifies_previous_period,
    (
      p.previous_candidate
      and p.ends_at = p.latest_previous_end
      and p.same_end_previous_candidates > 1
    ) as previous_period_selection_ambiguous
  from previous_analysis as p
),
summary as (
  select
    count(*)::bigint as total_period_rows,
    count(*) filter (where qualifies_previous_period)::bigint as previous_period_count
  from classified
)
select
  c.id,
  c.label,
  c.starts_at,
  c.ends_at,
  c.status,
  c.finalized_at,
  c.finalized_by,
  c.evaluated_at,
  c.qualifies_current_period,
  c.qualifies_previous_period,
  c.previous_period_selection_ambiguous,
  s.total_period_rows,
  s.previous_period_count
from classified as c
cross join summary as s
order by c.starts_at, c.id;

commit;

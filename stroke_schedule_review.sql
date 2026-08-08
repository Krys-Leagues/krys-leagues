create or replace function public.review_stroke_schedule(
  p_season_id uuid
)
returns table(
  season_id uuid,
  roster_version_id uuid,
  change_revision integer,
  generated_revision integer,
  reviewed_revision integer,
  posted_revision integer,
  fixture_count integer,
  review_performed boolean
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid;
  v_roster public.stroke_roster_versions%rowtype;
  v_season public.seasons%rowtype;

  v_approved_roster_count integer;
  v_change_revision integer;
  v_generated_revision integer;
  v_reviewed_revision integer;
  v_posted_revision integer;
  v_fixture_count integer := 0;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception
      'Authentication is required to review a Stroke schedule'
      using errcode = '42501';
  end if;

  if p_season_id is null then
    raise exception 'Season ID is required';
  end if;

  -- Lock the approved roster first.

  select roster.*
  into v_roster
  from public.stroke_roster_versions as roster
  where roster.season_id = p_season_id
    and roster.status = 'approved'
  order by roster.created_at, roster.id
  limit 1
  for update;

  if not found then
    if exists (
      select 1
      from public.stroke_roster_versions as locked_roster
      where locked_roster.season_id = p_season_id
        and locked_roster.status = 'locked'
    ) then
      raise exception
        'A locked historical Stroke roster cannot have its schedule reviewed'
        using errcode = '42501';
    end if;

    raise exception
      'Exactly one approved Stroke roster is required before schedule review';
  end if;

  -- Lock and validate the parent season after locking the roster.

  select season.*
  into v_season
  from public.seasons as season
  where season.id = p_season_id
  for share;

  if not found then
    raise exception 'The requested season was not found';
  end if;

  if lower(btrim(v_season.league_type)) <> 'stroke' then
    raise exception 'The requested season is not a Stroke season';
  end if;

  select count(*)::integer
  into v_approved_roster_count
  from public.stroke_roster_versions as roster
  where roster.season_id = p_season_id
    and roster.status = 'approved';

  if v_approved_roster_count <> 1 then
    raise exception
      'Exactly one approved Stroke roster is required; found %',
      v_approved_roster_count;
  end if;

  if exists (
    select 1
    from public.stroke_roster_versions as locked_roster
    where locked_roster.season_id = p_season_id
      and locked_roster.status = 'locked'
  ) then
    raise exception
      'A locked historical Stroke roster cannot have its schedule reviewed'
      using errcode = '42501';
  end if;

  -- Lock and validate the schedule workflow state.

  select
    schedule_state.change_revision,
    schedule_state.generated_revision,
    schedule_state.reviewed_revision,
    schedule_state.posted_revision
  into
    v_change_revision,
    v_generated_revision,
    v_reviewed_revision,
    v_posted_revision
  from public.stroke_schedule_state as schedule_state
  where schedule_state.season_id = p_season_id
  for update;

  if not found then
    raise exception
      'The approved Stroke roster has no schedule workflow state';
  end if;

  if v_generated_revision <> v_change_revision then
    raise exception
      'The Stroke schedule is stale and must be generated before review';
  end if;

  if v_generated_revision <= 0 then
    raise exception
      'The Stroke schedule has not been generated and cannot be reviewed';
  end if;

  -- Lock and count only managed Stroke fixtures. A count of zero is valid.

  perform 1
  from public.schedule as managed_fixture
  where lower(btrim(managed_fixture.league_type)) = 'stroke'
    and managed_fixture.season_id = p_season_id
  order by managed_fixture.division_number,
    managed_fixture.game_number,
    managed_fixture.id
  for share;

  select count(*)::integer
  into v_fixture_count
  from public.schedule as managed_fixture
  where lower(btrim(managed_fixture.league_type)) = 'stroke'
    and managed_fixture.season_id = p_season_id;

  -- An already-current review is an idempotent no-op. Preserve its
  -- original reviewer and timestamp.

  if v_reviewed_revision = v_generated_revision then
    return query
    select
      p_season_id,
      v_roster.id,
      v_change_revision,
      v_generated_revision,
      v_reviewed_revision,
      v_posted_revision,
      v_fixture_count,
      false;

    return;
  end if;

  -- Approve only the generated revision. Posting history remains intact
  -- and may remain behind this newly reviewed revision.

  update public.stroke_schedule_state as schedule_state
  set
    reviewed_revision = v_generated_revision,
    reviewed_at = now(),
    reviewed_by = v_user_id
  where schedule_state.season_id = p_season_id
    and schedule_state.change_revision = v_change_revision
    and schedule_state.generated_revision = v_generated_revision;

  if not found then
    raise exception
      'Schedule workflow revision changed during review; no review was recorded';
  end if;

  v_reviewed_revision := v_generated_revision;

  return query
  select
    p_season_id,
    v_roster.id,
    v_change_revision,
    v_generated_revision,
    v_reviewed_revision,
    v_posted_revision,
    v_fixture_count,
    true;
end;
$function$;

revoke all
  on function public.review_stroke_schedule(uuid)
  from public;

revoke all
  on function public.review_stroke_schedule(uuid)
  from anon;

revoke all
  on function public.review_stroke_schedule(uuid)
  from authenticated;

grant execute
  on function public.review_stroke_schedule(uuid)
  to authenticated;

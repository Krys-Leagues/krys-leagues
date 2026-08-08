begin;

CREATE OR REPLACE FUNCTION public.create_stroke_season_with_roster(p_season_number integer, p_division_count integer, p_start_date date, p_due_date date, p_end_date date, p_game1_course text, p_game2_course text, p_game3_course text)
 RETURNS TABLE(season_id uuid, roster_version_id uuid, season_number integer, division_count integer, first_division_number integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_season_id uuid;
  v_roster_version_id uuid;
begin
  if not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required';
  end if;

  if p_season_number is null or p_season_number <= 0 then
    raise exception 'Season number must be greater than zero';
  end if;

  if p_division_count is null
     or p_division_count < 1
     or p_division_count > 20 then
    raise exception 'Division count must be between 1 and 20';
  end if;

  if p_start_date is null then
    raise exception 'Start date is required';
  end if;

  if p_due_date is null then
    raise exception 'Due date is required';
  end if;

  if p_end_date is null then
    raise exception 'End date is required';
  end if;

  if p_end_date < p_start_date then
    raise exception 'End date cannot be before the start date';
  end if;

  if p_game1_course is null or btrim(p_game1_course) = '' then
    raise exception 'Game 1 course is required';
  end if;

  if p_game2_course is null or btrim(p_game2_course) = '' then
    raise exception 'Game 2 course is required';
  end if;

  if p_game3_course is null or btrim(p_game3_course) = '' then
    raise exception 'Game 3 course is required';
  end if;

  if exists (
    select 1
    from public.seasons as existing_season
    where existing_season.league_type = 'stroke'
      and existing_season.season_number = p_season_number
  ) then
    raise exception 'Stroke Season % already exists', p_season_number
      using errcode = '23505';
  end if;

  begin
    insert into public.seasons (
      league_type,
      season_number,
      start_date,
      due_date,
      end_date,
      game1_course,
      game2_course,
      game3_course,
      is_active,
      is_locked
    )
    values (
      'stroke',
      p_season_number,
      p_start_date,
      p_due_date,
      p_end_date,
      btrim(p_game1_course),
      btrim(p_game2_course),
      btrim(p_game3_course),
      false,
      false
    )
    returning id into v_season_id;
  exception
    when unique_violation then
      raise exception 'Stroke Season % already exists', p_season_number
        using errcode = '23505';
  end;

  insert into public.stroke_roster_versions (
    season_id,
    division_count,
    status,
    source_final_scorecard_id
  )
  values (
    v_season_id,
    p_division_count,
    'draft',
    null
  )
  returning id into v_roster_version_id;

  insert into public.stroke_division_roster_slots (
    roster_version_id,
    season_id,
    division_number,
    slot_number,
    player_id,
    player_screen_name,
    slot_status
  )
  select
    v_roster_version_id,
    v_season_id,
    division_number,
    slot_number,
    null::uuid,
    null::text,
    'empty'
  from generate_series(1, p_division_count) as division_number
  cross join generate_series(1, 4) as slot_number;

  return query
  select
    v_season_id,
    v_roster_version_id,
    p_season_number,
    p_division_count,
    1;
end;
$function$;

revoke all on function public.create_stroke_season_with_roster(integer, integer, date, date, date, text, text, text) from public;
revoke all on function public.create_stroke_season_with_roster(integer, integer, date, date, date, text, text, text) from anon;
revoke all on function public.create_stroke_season_with_roster(integer, integer, date, date, date, text, text, text) from authenticated;
grant execute on function public.create_stroke_season_with_roster(integer, integer, date, date, date, text, text, text) to authenticated;

create or replace function public.set_stroke_division_roster_slots(
  p_roster_version_id uuid,
  p_division_number integer,
  p_slot1_player_id uuid,
  p_slot2_player_id uuid,
  p_slot3_player_id uuid,
  p_slot4_player_id uuid
)
returns table(
  id uuid,
  roster_version_id uuid,
  season_id uuid,
  division_number integer,
  slot_number smallint,
  player_id uuid,
  player_screen_name text,
  slot_status text
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_roster public.stroke_roster_versions%rowtype;

  v_season_number integer;

  v_desired_player_ids uuid[] := array[
    p_slot1_player_id,
    p_slot2_player_id,
    p_slot3_player_id,
    p_slot4_player_id
  ];

  v_nonnull_desired_count integer;
  v_distinct_desired_count integer;
  v_existing_player_count integer;

  v_target_slot_count integer;
  v_target_distinct_slot_count integer;
  v_target_min_slot smallint;
  v_target_max_slot smallint;

  v_protected_player_id uuid;
  v_protected_player_name text;

  v_roster_state_before jsonb;
  v_roster_state_after jsonb;
begin
  if not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode = '42501';
  end if;

  if auth.uid() is null then
    raise exception
      'Authentication is required to edit a Stroke roster'
      using errcode = '42501';
  end if;

  if p_roster_version_id is null then
    raise exception 'Roster version is required';
  end if;

  if p_division_number is null or p_division_number <= 0 then
    raise exception 'Division number must be a positive integer';
  end if;

  -- Serialize every operation affecting this roster version.

  select roster.*
  into v_roster
  from public.stroke_roster_versions as roster
  where roster.id = p_roster_version_id
  for update;

  if not found then
    raise exception 'Stroke roster version was not found';
  end if;

  if v_roster.status = 'locked' then
    raise exception
      'A locked historical Stroke roster cannot be changed'
      using errcode = '42501';
  end if;

  if v_roster.status = 'cancelled' then
    raise exception
      'A cancelled Stroke roster cannot be changed'
      using errcode = '42501';
  end if;

  if v_roster.status not in ('draft', 'approved') then
    raise exception 'This Stroke roster is not editable';
  end if;

  if p_division_number > v_roster.division_count then
    raise exception
      'Division % is outside this roster''s division count of %',
      p_division_number,
      v_roster.division_count;
  end if;

  select season.season_number
  into v_season_number
  from public.seasons as season
  where season.id = v_roster.season_id
    and season.league_type = 'stroke';

  if not found then
    raise exception
      'The roster does not reference a valid Stroke season';
  end if;

  -- An approved roster must already participate in the protected
  -- schedule workflow. Lock the state row so revision changes for this
  -- season are serialized.

  if v_roster.status = 'approved' then
    perform 1
    from public.stroke_schedule_state as schedule_state
    where schedule_state.season_id = v_roster.season_id
    for update;

    if not found then
      raise exception
        'Approved Stroke roster has no schedule workflow state';
    end if;
  end if;

  -- Lock every slot in this roster. Cross-division moves may affect
  -- source slots outside the requested target division.

  perform 1
  from public.stroke_division_roster_slots as roster_slot
  where roster_slot.roster_version_id = v_roster.id
  for update;

  -- Capture the complete logical player placement before mutation.
  -- Screen-name snapshots and slot status are intentionally excluded.

  select coalesce(
    jsonb_agg(
      jsonb_build_array(
        roster_slot.division_number,
        roster_slot.slot_number,
        roster_slot.player_id
      )
      order by
        roster_slot.division_number,
        roster_slot.slot_number
    ),
    '[]'::jsonb
  )
  into v_roster_state_before
  from public.stroke_division_roster_slots as roster_slot
  where roster_slot.roster_version_id = v_roster.id;

  -- Confirm that the target division has exactly slots 1 through 4.

  select
    count(*),
    count(distinct roster_slot.slot_number),
    min(roster_slot.slot_number),
    max(roster_slot.slot_number)
  into
    v_target_slot_count,
    v_target_distinct_slot_count,
    v_target_min_slot,
    v_target_max_slot
  from public.stroke_division_roster_slots as roster_slot
  where roster_slot.roster_version_id = v_roster.id
    and roster_slot.division_number = p_division_number;

  if v_target_slot_count <> 4
     or v_target_distinct_slot_count <> 4
     or v_target_min_slot <> 1
     or v_target_max_slot <> 4 then
    raise exception
      'The requested division must have exactly persistent slots 1 through 4';
  end if;

  -- Reject duplicate real players in the desired four-slot assignment.
  -- NULL values represent independent empty slots and are ignored.

  select
    count(desired_player_id),
    count(distinct desired_player_id)
  into
    v_nonnull_desired_count,
    v_distinct_desired_count
  from unnest(v_desired_player_ids) as desired_player(desired_player_id)
  where desired_player_id is not null;

  if v_nonnull_desired_count <> v_distinct_desired_count then
    raise exception
      'A player cannot occupy more than one slot in the same roster'
      using errcode = '23505';
  end if;

  -- Validate every incoming real-player UUID. Discord identity remains
  -- reachable through players.id and is not duplicated in roster slots.

  select count(*)
  into v_existing_player_count
  from public.players as player
  where player.id in (
    select desired_player_id
    from unnest(v_desired_player_ids)
      as desired_player(desired_player_id)
    where desired_player_id is not null
  );

  if v_existing_player_count <> v_nonnull_desired_count then
    raise exception
      'One or more selected players do not exist';
  end if;

  -- Prevent concurrent inserts or updates in results from racing with
  -- the persisted completed-game protection check. Reads remain allowed.

  lock table public.results in share mode;

  -- Find any player whose existing placement would change and who has
  -- at least one persisted completed real Stroke game.
  --
  -- A placement changes when:
  -- 1. a current target-division slot will receive a different UUID; or
  -- 2. a desired incoming UUID currently occupies another division.
  --
  -- Players whose UUID remains in the same slot are not blocked.

  select
    existing_slot.player_id,
    existing_slot.player_screen_name
  into
    v_protected_player_id,
    v_protected_player_name
  from public.stroke_division_roster_slots as existing_slot
  where existing_slot.roster_version_id = v_roster.id
    and existing_slot.player_id is not null
    and (
      (
        existing_slot.division_number = p_division_number
        and existing_slot.player_id is distinct from
          case existing_slot.slot_number
            when 1 then p_slot1_player_id
            when 2 then p_slot2_player_id
            when 3 then p_slot3_player_id
            when 4 then p_slot4_player_id
          end
      )
      or
      (
        existing_slot.division_number <> p_division_number
        and existing_slot.player_id = any(v_desired_player_ids)
      )
    )
    and exists (
      select 1
      from public.results as completed_result
      where completed_result.league_type = 'stroke'
        and completed_result.season_number = v_season_number
        and completed_result.player1_id is not null
        and completed_result.player2_id is not null
        and completed_result.player1_score is not null
        and completed_result.player2_score is not null
        and (
          completed_result.player1_id = existing_slot.player_id
          or completed_result.player2_id = existing_slot.player_id
        )
    )
  limit 1;

  if found then
    raise exception
      'Player % has completed a Stroke game and cannot be removed, replaced, or moved',
      coalesce(v_protected_player_name, v_protected_player_id::text)
      using errcode = '42501';
  end if;

  -- Everything below remains in this function call's transaction.
  --
  -- Clear incoming players from any source slots outside the target
  -- division. This safely supports cross-division movement.

  update public.stroke_division_roster_slots as source_slot
  set
    player_id = null,
    player_screen_name = null,
    slot_status = 'empty'
  where source_slot.roster_version_id = v_roster.id
    and source_slot.division_number <> p_division_number
    and source_slot.player_id = any(v_desired_player_ids);

  -- Clear all target slots before assigning final values. This permits
  -- same-division swaps without violating the existing unique
  -- player-per-roster index.

  update public.stroke_division_roster_slots as target_slot
  set
    player_id = null,
    player_screen_name = null,
    slot_status = 'empty'
  where target_slot.roster_version_id = v_roster.id
    and target_slot.division_number = p_division_number;

  -- Apply the complete desired target state. The existing roster-slot
  -- trigger also resolves the current exact screen-name snapshot from
  -- players.id.

  update public.stroke_division_roster_slots as target_slot
  set
    player_id = desired_slot.desired_player_id,
    player_screen_name = selected_player.screen_name,
    slot_status =
      case
        when desired_slot.desired_player_id is null then 'empty'
        else 'active'
      end
  from (
    values
      (1::smallint, p_slot1_player_id),
      (2::smallint, p_slot2_player_id),
      (3::smallint, p_slot3_player_id),
      (4::smallint, p_slot4_player_id)
  ) as desired_slot(slot_number, desired_player_id)
  left join public.players as selected_player
    on selected_player.id = desired_slot.desired_player_id
  where target_slot.roster_version_id = v_roster.id
    and target_slot.division_number = p_division_number
    and target_slot.slot_number = desired_slot.slot_number;

  if not found then
    raise exception
      'The target Stroke roster slots could not be updated';
  end if;

  -- Capture the complete logical placement after every target and
  -- cross-division mutation has completed.

  select coalesce(
    jsonb_agg(
      jsonb_build_array(
        roster_slot.division_number,
        roster_slot.slot_number,
        roster_slot.player_id
      )
      order by
        roster_slot.division_number,
        roster_slot.slot_number
    ),
    '[]'::jsonb
  )
  into v_roster_state_after
  from public.stroke_division_roster_slots as roster_slot
  where roster_slot.roster_version_id = v_roster.id;

  -- A single logical approved-roster change creates one new schedule
  -- revision. Existing generated/reviewed/posted values and metadata
  -- deliberately remain untouched.

  if v_roster.status = 'approved'
     and v_roster_state_before is distinct from v_roster_state_after then
    update public.stroke_schedule_state as schedule_state
    set change_revision = schedule_state.change_revision + 1
    where schedule_state.season_id = v_roster.season_id;

    if not found then
      raise exception
        'Approved Stroke roster has no schedule workflow state';
    end if;
  end if;

  -- Return the authoritative four saved target rows.

  return query
  select
    saved_slot.id,
    saved_slot.roster_version_id,
    saved_slot.season_id,
    saved_slot.division_number,
    saved_slot.slot_number,
    saved_slot.player_id,
    saved_slot.player_screen_name,
    saved_slot.slot_status
  from public.stroke_division_roster_slots as saved_slot
  where saved_slot.roster_version_id = v_roster.id
    and saved_slot.division_number = p_division_number
  order by saved_slot.slot_number;
end;
$function$;

revoke all
  on function public.set_stroke_division_roster_slots(
    uuid,
    integer,
    uuid,
    uuid,
    uuid,
    uuid
  )
  from public;

revoke all
  on function public.set_stroke_division_roster_slots(
    uuid,
    integer,
    uuid,
    uuid,
    uuid,
    uuid
  )
  from anon;

revoke all
  on function public.set_stroke_division_roster_slots(
    uuid,
    integer,
    uuid,
    uuid,
    uuid,
    uuid
  )
  from authenticated;

grant execute
  on function public.set_stroke_division_roster_slots(
    uuid,
    integer,
    uuid,
    uuid,
    uuid,
    uuid
  )
  to authenticated;

CREATE OR REPLACE FUNCTION public.set_stroke_division_course_overrides(p_season_id uuid, p_division_number integer, p_game1_course text, p_game2_course text, p_game3_course text)
 RETURNS TABLE(season_id uuid, division_number integer, game1_course_override text, game2_course_override text, game3_course_override text, game1_effective_course text, game2_effective_course text, game3_effective_course text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_season public.seasons%rowtype;

  v_roster_version_id uuid;
  v_roster_status text;
  v_division_count integer;

  v_game1_override text;
  v_game2_override text;
  v_game3_override text;

  v_existing_game1_override text;
  v_existing_game2_override text;
  v_existing_game3_override text;

  v_override_changed boolean;
begin
  if not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required';
  end if;

  if p_season_id is null then
    raise exception 'Season ID is required';
  end if;

  if p_division_number is null or p_division_number <= 0 then
    raise exception 'Division number must be a positive integer';
  end if;

  -- Resolve and lock the editable roster first. This preserves the
  -- roster-before-season lock order used by roster approval.

  select
    roster.id,
    roster.status,
    roster.division_count
  into
    v_roster_version_id,
    v_roster_status,
    v_division_count
  from public.stroke_roster_versions as roster
  where roster.season_id = p_season_id
    and roster.status in ('draft', 'approved')
  order by
    case roster.status
      when 'draft' then 1
      when 'approved' then 2
      else 3
    end
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
        'Course overrides for a locked historical Stroke season cannot be changed'
        using errcode = '42501';
    end if;

    raise exception
      'No editable draft or approved Stroke roster was found for this season';
  end if;

  -- Lock and validate the single season-level parent row only after
  -- the editable roster has been locked.

  select season.*
  into v_season
  from public.seasons as season
  where season.id = p_season_id
  for share;

  if not found then
    raise exception 'The requested season was not found';
  end if;

  if v_season.league_type <> 'stroke' then
    raise exception 'The requested season is not a Stroke season';
  end if;

  -- A locked roster makes the season's course history immutable.
  -- Reject the edit even if an editable roster also exists unexpectedly.

  if exists (
    select 1
    from public.stroke_roster_versions as locked_roster
    where locked_roster.season_id = p_season_id
      and locked_roster.status = 'locked'
  ) then
    raise exception
      'Course overrides for a locked historical Stroke season cannot be changed'
      using errcode = '42501';
  end if;

  if p_division_number > v_division_count then
    raise exception
      'Division % is outside this roster''s division count of %',
      p_division_number,
      v_division_count;
  end if;

  -- An approved roster must already participate in the protected
  -- schedule workflow. Lock the state row to serialize revision updates.

  if v_roster_status = 'approved' then
    perform 1
    from public.stroke_schedule_state as schedule_state
    where schedule_state.season_id = p_season_id
    for update;

    if not found then
      raise exception
        'Approved Stroke roster has no schedule workflow state';
    end if;
  end if;

  -- Normalize blank or whitespace-only values to NULL.
  -- NULL means that the season-level default remains effective.

  v_game1_override := nullif(btrim(p_game1_course), '');
  v_game2_override := nullif(btrim(p_game2_course), '');
  v_game3_override := nullif(btrim(p_game3_course), '');

  -- Capture and lock the currently stored logical override values.
  -- No row is equivalent to three NULL override values.

  v_existing_game1_override := null;
  v_existing_game2_override := null;
  v_existing_game3_override := null;

  select
    course_override.game1_course_override,
    course_override.game2_course_override,
    course_override.game3_course_override
  into
    v_existing_game1_override,
    v_existing_game2_override,
    v_existing_game3_override
  from public.stroke_division_course_overrides as course_override
  where course_override.season_id = p_season_id
    and course_override.division_number = p_division_number
  for update;

  v_override_changed :=
    v_existing_game1_override is distinct from v_game1_override
    or v_existing_game2_override is distinct from v_game2_override
    or v_existing_game3_override is distinct from v_game3_override;

  if v_game1_override is null
     and v_game2_override is null
     and v_game3_override is null then

    -- No overrides remain. Remove the optional division override row.

    delete from public.stroke_division_course_overrides as course_override
    where course_override.season_id = p_season_id
      and course_override.division_number = p_division_number;

  else

    -- Store only intentional non-null overrides. Season defaults are not
    -- copied into null override fields.

    insert into public.stroke_division_course_overrides (
      season_id,
      division_number,
      game1_course_override,
      game2_course_override,
      game3_course_override
    )
    values (
      p_season_id,
      p_division_number,
      v_game1_override,
      v_game2_override,
      v_game3_override
    )
    on conflict (season_id, division_number)
    do update
    set
      game1_course_override = excluded.game1_course_override,
      game2_course_override = excluded.game2_course_override,
      game3_course_override = excluded.game3_course_override;

  end if;

  -- A single logical approved-course change creates one new schedule
  -- revision. Existing generated/reviewed/posted values and metadata
  -- deliberately remain untouched.

  if v_roster_status = 'approved'
     and v_override_changed then
    update public.stroke_schedule_state as schedule_state
    set change_revision = schedule_state.change_revision + 1
    where schedule_state.season_id = p_season_id;

    if not found then
      raise exception
        'Approved Stroke roster has no schedule workflow state';
    end if;
  end if;

  return query
  select
    p_season_id,
    p_division_number,
    v_game1_override,
    v_game2_override,
    v_game3_override,
    coalesce(v_game1_override, v_season.game1_course),
    coalesce(v_game2_override, v_season.game2_course),
    coalesce(v_game3_override, v_season.game3_course);
end;
$function$;

revoke all on function public.set_stroke_division_course_overrides(uuid, integer, text, text, text) from public;
revoke all on function public.set_stroke_division_course_overrides(uuid, integer, text, text, text) from anon;
revoke all on function public.set_stroke_division_course_overrides(uuid, integer, text, text, text) from authenticated;
grant execute on function public.set_stroke_division_course_overrides(uuid, integer, text, text, text) to authenticated;

CREATE OR REPLACE FUNCTION public.approve_stroke_roster_version(p_roster_version_id uuid, p_approval_note text DEFAULT NULL::text)
 RETURNS TABLE(season_id uuid, roster_version_id uuid, roster_status text, division_count integer, populated_player_count integer, change_revision integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_user_id uuid;
  v_season_id uuid;
  v_division_count integer;
  v_roster_status text;
  v_locked_at timestamptz;
  v_locked_by uuid;

  v_total_slot_count integer;
  v_populated_player_count integer;
  v_distinct_player_count integer;

  v_state_inserted_count integer;
  v_change_revision integer;
  v_generated_revision integer;
  v_reviewed_revision integer;
  v_posted_revision integer;
  v_generated_at timestamptz;
  v_generated_by uuid;
  v_reviewed_at timestamptz;
  v_reviewed_by uuid;
  v_posted_at timestamptz;
  v_posted_by uuid;
begin
  -- ==========================================================
  -- Authentication
  -- ==========================================================

  v_user_id := auth.uid();

  if not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required';
  end if;

  if p_roster_version_id is null then
    raise exception
      'A roster version ID is required.';
  end if;


  -- ==========================================================
  -- Lock and load the roster version
  -- ==========================================================

  select
    rv.season_id,
    rv.division_count,
    rv.status,
    rv.locked_at,
    rv.locked_by
  into
    v_season_id,
    v_division_count,
    v_roster_status,
    v_locked_at,
    v_locked_by
  from public.stroke_roster_versions rv
  where rv.id = p_roster_version_id
  for update;

  if not found then
    raise exception
      'Stroke roster version % was not found.',
      p_roster_version_id;
  end if;


  -- ==========================================================
  -- Lock and validate the parent season
  -- ==========================================================

  perform 1
  from public.seasons s
  where s.id = v_season_id
    and lower(btrim(s.league_type)) = 'stroke'
  for update;

  if not found then
    raise exception
      'Roster version % does not belong to a valid Stroke season.',
      p_roster_version_id;
  end if;


  -- ==========================================================
  -- Validate approval state
  -- ==========================================================

  if v_roster_status <> 'draft' then
    raise exception
      'Only a draft Stroke roster can be approved. Current status: %.',
      v_roster_status;
  end if;

  if v_locked_at is not null or v_locked_by is not null then
    raise exception
      'This Stroke roster is historically locked and cannot be approved.';
  end if;

  if v_division_count is null or v_division_count <= 0 then
    raise exception
      'The Stroke roster must have a positive division count.';
  end if;


  -- ==========================================================
  -- Lock every persistent slot belonging to this roster
  -- ==========================================================

  perform 1
  from public.stroke_division_roster_slots rs
  where rs.roster_version_id = p_roster_version_id
  order by rs.division_number, rs.slot_number
  for update;


  -- ==========================================================
  -- Validate total slot and populated-player counts
  -- ==========================================================

  select
    count(*)::integer,
    count(rs.player_id)::integer,
    count(distinct rs.player_id)::integer
  into
    v_total_slot_count,
    v_populated_player_count,
    v_distinct_player_count
  from public.stroke_division_roster_slots rs
  where rs.roster_version_id = p_roster_version_id;

  if v_total_slot_count <> v_division_count * 4 then
    raise exception
      'Roster version % must contain exactly % persistent slot rows; found %.',
      p_roster_version_id,
      v_division_count * 4,
      v_total_slot_count;
  end if;


  -- ==========================================================
  -- Validate division and slot-number ranges
  -- ==========================================================

  if exists (
    select 1
    from public.stroke_division_roster_slots rs
    where rs.roster_version_id = p_roster_version_id
      and (
        rs.division_number < 1
        or rs.division_number > v_division_count
        or rs.slot_number < 1
        or rs.slot_number > 4
      )
  ) then
    raise exception
      'The roster contains an invalid division number or slot number.';
  end if;


  -- ==========================================================
  -- Require divisions 1 through division_count, each with the
  -- four distinct persistent slots 1 through 4
  -- ==========================================================

  if exists (
    select 1
    from pg_catalog.generate_series(
      1,
      v_division_count
    ) as expected(division_number)
    left join public.stroke_division_roster_slots rs
      on rs.roster_version_id = p_roster_version_id
     and rs.division_number = expected.division_number
    group by expected.division_number
    having count(rs.id) <> 4
       or count(distinct rs.slot_number) <> 4
       or min(rs.slot_number) <> 1
       or max(rs.slot_number) <> 4
  ) then
    raise exception
      'Every division from 1 through % must contain exactly slots 1 through 4.',
      v_division_count;
  end if;


  -- ==========================================================
  -- Validate that every populated UUID identifies a real player
  -- ==========================================================

  if exists (
    select 1
    from public.stroke_division_roster_slots rs
    left join public.players p
      on p.id = rs.player_id
    where rs.roster_version_id = p_roster_version_id
      and rs.player_id is not null
      and p.id is null
  ) then
    raise exception
      'The roster contains a player UUID that does not exist in public.players.';
  end if;


  -- ==========================================================
  -- No real player may occupy multiple slots in this version
  -- ==========================================================

  if v_distinct_player_count <> v_populated_player_count then
    raise exception
      'A real player cannot occupy more than one slot in the same roster version.';
  end if;

  if exists (
    select 1
    from public.stroke_division_roster_slots rs
    where rs.roster_version_id = p_roster_version_id
      and rs.player_id is not null
    group by rs.player_id
    having count(*) > 1
  ) then
    raise exception
      'A real player cannot occupy more than one slot in the same roster version.';
  end if;


  -- ==========================================================
  -- Explicitly approve the roster
  --
  -- Existing roster validation/protection triggers remain active.
  -- No slot assignments or screen-name snapshots are changed.
  -- ==========================================================

  update public.stroke_roster_versions rv
  set
    status = 'approved',
    approved_at = now(),
    approved_by = v_user_id,
    approval_note = nullif(btrim(p_approval_note), '')
  where rv.id = p_roster_version_id;


  -- ==========================================================
  -- Initialize schedule workflow state
  --
  -- The parent season row is already locked, preventing two normal
  -- approval calls for the same season from racing this operation.
  -- ==========================================================

  insert into public.stroke_schedule_state (
    season_id,
    change_revision,
    generated_revision,
    reviewed_revision,
    posted_revision,
    generated_at,
    generated_by,
    reviewed_at,
    reviewed_by,
    posted_at,
    posted_by
  )
  values (
    v_season_id,
    1,
    0,
    0,
    0,
    null,
    null,
    null,
    null,
    null,
    null
  )
  on conflict on constraint stroke_schedule_state_pkey do nothing;

  get diagnostics v_state_inserted_count = row_count;

  select
    ss.change_revision,
    ss.generated_revision,
    ss.reviewed_revision,
    ss.posted_revision,
    ss.generated_at,
    ss.generated_by,
    ss.reviewed_at,
    ss.reviewed_by,
    ss.posted_at,
    ss.posted_by
  into
    v_change_revision,
    v_generated_revision,
    v_reviewed_revision,
    v_posted_revision,
    v_generated_at,
    v_generated_by,
    v_reviewed_at,
    v_reviewed_by,
    v_posted_at,
    v_posted_by
  from public.stroke_schedule_state ss
  where ss.season_id = v_season_id
  for update;

  if not found then
    raise exception
      'Unable to initialize schedule workflow state for Stroke season %.',
      v_season_id;
  end if;

  -- If another valid state row already existed, preserve a pristine
  -- pending state. Never reset or overwrite generated/reviewed/posted
  -- history during roster approval.
  if v_state_inserted_count = 0 then
    if v_change_revision < 1 then
      raise exception
        'Existing schedule workflow state has an invalid change revision.';
    end if;

    if v_generated_revision <> 0
       or v_reviewed_revision <> 0
       or v_posted_revision <> 0
       or v_generated_at is not null
       or v_generated_by is not null
       or v_reviewed_at is not null
       or v_reviewed_by is not null
       or v_posted_at is not null
       or v_posted_by is not null then
      raise exception
        'Schedule workflow history already exists for this draft roster season; approval was not performed.';
    end if;
  end if;


  -- ==========================================================
  -- Return authoritative approval state
  -- ==========================================================

  return query
  select
    v_season_id,
    p_roster_version_id,
    'approved'::text,
    v_division_count,
    v_populated_player_count,
    v_change_revision;
end;
$function$;

revoke all on function public.approve_stroke_roster_version(uuid, text) from public;
revoke all on function public.approve_stroke_roster_version(uuid, text) from anon;
revoke all on function public.approve_stroke_roster_version(uuid, text) from authenticated;
grant execute on function public.approve_stroke_roster_version(uuid, text) to authenticated;

create or replace function public.generate_stroke_schedule(
  p_season_id uuid
)
returns table(
  season_id uuid,
  roster_version_id uuid,
  change_revision integer,
  generated_revision integer,
  fixture_count integer,
  completed_fixture_count integer,
  inserted_count integer,
  updated_count integer,
  deleted_count integer,
  regeneration_performed boolean
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
  v_total_slot_count integer;
  v_populated_player_count integer;
  v_distinct_player_count integer;

  v_change_revision integer;
  v_generated_revision integer;

  v_desired_fixtures jsonb := '[]'::jsonb;

  v_fixture_count integer := 0;
  v_completed_fixture_count integer := 0;
  v_inserted_count integer := 0;
  v_updated_count integer := 0;
  v_deleted_count integer := 0;
begin
  v_user_id := auth.uid();

  if not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode = '42501';
  end if;

  if v_user_id is null then
    raise exception
      'Authentication is required to generate a Stroke schedule'
      using errcode = '42501';
  end if;

  if p_season_id is null then
    raise exception 'Season ID is required';
  end if;

  -- Lock the approved roster first. This follows the shared Stroke lock
  -- order: roster, parent season, schedule state, roster slots, schedule.

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
        'A locked historical Stroke roster cannot have its schedule regenerated'
        using errcode = '42501';
    end if;

    raise exception
      'Exactly one approved Stroke roster is required before schedule generation';
  end if;

  -- Lock and validate the parent season after locking the approved roster.

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

  -- Recheck the official roster shape while the parent season is locked.

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
      'A locked historical Stroke roster cannot have its schedule regenerated'
      using errcode = '42501';
  end if;

  if v_roster.division_count is null or v_roster.division_count <= 0 then
    raise exception
      'The approved Stroke roster must have a positive division count';
  end if;

  -- Lock the required schedule workflow state.

  select
    schedule_state.change_revision,
    schedule_state.generated_revision
  into
    v_change_revision,
    v_generated_revision
  from public.stroke_schedule_state as schedule_state
  where schedule_state.season_id = p_season_id
  for update;

  if not found then
    raise exception
      'The approved Stroke roster has no schedule workflow state';
  end if;

  if v_generated_revision > v_change_revision then
    raise exception
      'Schedule workflow state is invalid: generated revision % exceeds change revision %',
      v_generated_revision,
      v_change_revision;
  end if;

  -- Lock every persistent roster slot before validating and compacting
  -- the real players for each division.

  perform 1
  from public.stroke_division_roster_slots as roster_slot
  where roster_slot.roster_version_id = v_roster.id
  order by roster_slot.division_number, roster_slot.slot_number
  for update;

  select
    count(*)::integer,
    count(roster_slot.player_id)::integer,
    count(distinct roster_slot.player_id)::integer
  into
    v_total_slot_count,
    v_populated_player_count,
    v_distinct_player_count
  from public.stroke_division_roster_slots as roster_slot
  where roster_slot.roster_version_id = v_roster.id;

  if v_total_slot_count <> v_roster.division_count * 4 then
    raise exception
      'Approved roster must contain exactly % persistent slots; found %',
      v_roster.division_count * 4,
      v_total_slot_count;
  end if;

  if exists (
    select 1
    from public.stroke_division_roster_slots as roster_slot
    where roster_slot.roster_version_id = v_roster.id
      and (
        roster_slot.division_number < 1
        or roster_slot.division_number > v_roster.division_count
        or roster_slot.slot_number < 1
        or roster_slot.slot_number > 4
      )
  ) then
    raise exception
      'The approved roster contains an invalid division number or slot number';
  end if;

  if exists (
    select 1
    from pg_catalog.generate_series(
      1,
      v_roster.division_count
    ) as expected(division_number)
    left join public.stroke_division_roster_slots as roster_slot
      on roster_slot.roster_version_id = v_roster.id
     and roster_slot.division_number = expected.division_number
    group by expected.division_number
    having count(roster_slot.id) <> 4
       or count(distinct roster_slot.slot_number) <> 4
       or min(roster_slot.slot_number) <> 1
       or max(roster_slot.slot_number) <> 4
  ) then
    raise exception
      'Every division from 1 through % must contain exactly slots 1 through 4',
      v_roster.division_count;
  end if;

  if v_populated_player_count <> v_distinct_player_count then
    raise exception
      'A real player cannot occupy more than one slot in the approved roster'
      using errcode = '23505';
  end if;

  if exists (
    select 1
    from public.stroke_division_roster_slots as roster_slot
    left join public.players as player
      on player.id = roster_slot.player_id
    where roster_slot.roster_version_id = v_roster.id
      and roster_slot.player_id is not null
      and (
        player.id is null
        or roster_slot.player_screen_name is null
      )
  ) then
    raise exception
      'Every populated roster slot must reference a real player and preserve a screen-name snapshot';
  end if;

  -- If this exact logical revision is already generated, leave all
  -- fixtures and review/post workflow state untouched.

  if v_generated_revision = v_change_revision then
    select count(*)::integer
    into v_fixture_count
    from public.schedule as scheduled_fixture
    where lower(btrim(scheduled_fixture.league_type)) = 'stroke'
      and scheduled_fixture.season_id = p_season_id;

    select count(*)::integer
    into v_completed_fixture_count
    from public.schedule as scheduled_fixture
    where lower(btrim(scheduled_fixture.league_type)) = 'stroke'
      and scheduled_fixture.season_id = p_season_id
      and exists (
        select 1
        from public.results as completed_result
        where completed_result.schedule_id = scheduled_fixture.id
          and lower(btrim(completed_result.league_type)) = 'stroke'
          and completed_result.player1_score is not null
          and completed_result.player2_score is not null
      );

    return query
    select
      p_season_id,
      v_roster.id,
      v_change_revision,
      v_generated_revision,
      v_fixture_count,
      v_completed_fixture_count,
      0,
      0,
      0,
      false;

    return;
  end if;

  -- Build the complete desired real-fixture set. Populated slots are
  -- compacted in persistent slot order. No BYE row is ever constructed.

  with compacted_players as (
    select
      roster_slot.division_number,
      row_number() over (
        partition by roster_slot.division_number
        order by roster_slot.slot_number
      )::integer as player_position,
      count(*) over (
        partition by roster_slot.division_number
      )::integer as player_count,
      roster_slot.player_id,
      roster_slot.player_screen_name
    from public.stroke_division_roster_slots as roster_slot
    where roster_slot.roster_version_id = v_roster.id
      and roster_slot.player_id is not null
  ),
  pairing_pattern as (
    select *
    from (
      values
        (4, 1, 1, 2),
        (4, 1, 3, 4),
        (4, 2, 4, 1),
        (4, 2, 2, 3),
        (4, 3, 1, 3),
        (4, 3, 2, 4),
        (3, 1, 1, 2),
        (3, 2, 2, 3),
        (3, 3, 1, 3),
        (2, 1, 1, 2)
    ) as pattern(
      player_count,
      game_number,
      player1_position,
      player2_position
    )
  ),
  desired_rows as (
    select
      player1.division_number,
      pattern.game_number,
      player1.player_id as player1_id,
      player2.player_id as player2_id,
      player1.player_screen_name as player1_screen_name,
      player2.player_screen_name as player2_screen_name,
      case pattern.game_number
        when 1 then coalesce(
          course_override.game1_course_override,
          v_season.game1_course
        )
        when 2 then coalesce(
          course_override.game2_course_override,
          v_season.game2_course
        )
        when 3 then coalesce(
          course_override.game3_course_override,
          v_season.game3_course
        )
      end as effective_course
    from pairing_pattern as pattern
    join compacted_players as player1
      on player1.player_count = pattern.player_count
     and player1.player_position = pattern.player1_position
    join compacted_players as player2
      on player2.division_number = player1.division_number
     and player2.player_count = pattern.player_count
     and player2.player_position = pattern.player2_position
    left join public.stroke_division_course_overrides as course_override
      on course_override.season_id = p_season_id
     and course_override.division_number = player1.division_number
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'division_number', desired_row.division_number,
        'game_number', desired_row.game_number,
        'player1_id', desired_row.player1_id,
        'player2_id', desired_row.player2_id,
        'player1_screen_name', desired_row.player1_screen_name,
        'player2_screen_name', desired_row.player2_screen_name,
        'effective_course', desired_row.effective_course
      )
      order by
        desired_row.division_number,
        desired_row.game_number,
        desired_row.player1_id,
        desired_row.player2_id
    ),
    '[]'::jsonb
  )
  into v_desired_fixtures
  from desired_rows as desired_row;

  -- Prevent result writes from racing the completed-history checks.

  lock table public.results in share mode;

  -- Lock only managed Stroke fixtures for this season. Legacy/test rows
  -- have season_id NULL and are never selected by this function.

  perform 1
  from public.schedule as scheduled_fixture
  where lower(btrim(scheduled_fixture.league_type)) = 'stroke'
    and scheduled_fixture.season_id = p_season_id
  order by scheduled_fixture.division_number, scheduled_fixture.game_number,
    scheduled_fixture.id
  for update;

  -- Completed fixtures must still represent a desired unordered pair in
  -- the same division. Any conflict fails instead of rewriting history.

  if exists (
    select 1
    from public.schedule as scheduled_fixture
    where lower(btrim(scheduled_fixture.league_type)) = 'stroke'
      and scheduled_fixture.season_id = p_season_id
      and exists (
        select 1
        from public.results as completed_result
        where completed_result.schedule_id = scheduled_fixture.id
          and lower(btrim(completed_result.league_type)) = 'stroke'
          and completed_result.player1_score is not null
          and completed_result.player2_score is not null
      )
      and not exists (
        select 1
        from jsonb_to_recordset(v_desired_fixtures) as desired_fixture(
          division_number integer,
          game_number integer,
          player1_id uuid,
          player2_id uuid,
          player1_screen_name text,
          player2_screen_name text,
          effective_course text
        )
        where desired_fixture.division_number =
              scheduled_fixture.division_number
          and desired_fixture.game_number = scheduled_fixture.game_number
          and least(
                desired_fixture.player1_id,
                desired_fixture.player2_id
              ) = least(
                scheduled_fixture.player1_id,
                scheduled_fixture.player2_id
              )
          and greatest(
                desired_fixture.player1_id,
                desired_fixture.player2_id
              ) = greatest(
                scheduled_fixture.player1_id,
                scheduled_fixture.player2_id
              )
      )
  ) then
    raise exception
      'A completed Stroke fixture conflicts with the current approved roster; completed history was not changed';
  end if;

  -- An obsolete fixture with any linked result cannot be deleted without
  -- mutating result history or violating the schedule_id foreign key.

  if exists (
    select 1
    from public.schedule as scheduled_fixture
    where lower(btrim(scheduled_fixture.league_type)) = 'stroke'
      and scheduled_fixture.season_id = p_season_id
      and not exists (
        select 1
        from jsonb_to_recordset(v_desired_fixtures) as desired_fixture(
          division_number integer,
          game_number integer,
          player1_id uuid,
          player2_id uuid,
          player1_screen_name text,
          player2_screen_name text,
          effective_course text
        )
        where desired_fixture.division_number =
              scheduled_fixture.division_number
          and least(
                desired_fixture.player1_id,
                desired_fixture.player2_id
              ) = least(
                scheduled_fixture.player1_id,
                scheduled_fixture.player2_id
              )
          and greatest(
                desired_fixture.player1_id,
                desired_fixture.player2_id
              ) = greatest(
                scheduled_fixture.player1_id,
                scheduled_fixture.player2_id
              )
      )
      and exists (
        select 1
        from public.results as linked_result
        where linked_result.schedule_id = scheduled_fixture.id
      )
  ) then
    raise exception
      'An obsolete Stroke fixture has a linked result and cannot be removed safely';
  end if;

  -- Update retained unplayed fixtures only when a stored value differs.
  -- Completed fixtures are excluded and remain byte-for-byte unchanged.

  with desired_rows as (
    select *
    from jsonb_to_recordset(v_desired_fixtures) as desired_fixture(
      division_number integer,
      game_number integer,
      player1_id uuid,
      player2_id uuid,
      player1_screen_name text,
      player2_screen_name text,
      effective_course text
    )
  )
  update public.schedule as scheduled_fixture
  set
    league_type = 'stroke',
    season_number = v_season.season_number,
    division = 'Stroke D' || desired_row.division_number::text,
    game = desired_row.game_number::text,
    course = desired_row.effective_course,
    player1 = desired_row.player1_screen_name,
    player2 = desired_row.player2_screen_name,
    player1_name = desired_row.player1_screen_name,
    player2_name = desired_row.player2_screen_name,
    player1_id = desired_row.player1_id,
    player2_id = desired_row.player2_id,
    due_date = v_season.due_date,
    roster_version_id = v_roster.id,
    division_number = desired_row.division_number,
    game_number = desired_row.game_number
  from desired_rows as desired_row
  where lower(btrim(scheduled_fixture.league_type)) = 'stroke'
    and scheduled_fixture.season_id = p_season_id
    and scheduled_fixture.division_number = desired_row.division_number
    and least(
          scheduled_fixture.player1_id,
          scheduled_fixture.player2_id
        ) = least(
          desired_row.player1_id,
          desired_row.player2_id
        )
    and greatest(
          scheduled_fixture.player1_id,
          scheduled_fixture.player2_id
        ) = greatest(
          desired_row.player1_id,
          desired_row.player2_id
        )
    and not exists (
      select 1
      from public.results as completed_result
      where completed_result.schedule_id = scheduled_fixture.id
        and lower(btrim(completed_result.league_type)) = 'stroke'
        and completed_result.player1_score is not null
        and completed_result.player2_score is not null
    )
    and row(
      scheduled_fixture.league_type,
      scheduled_fixture.season_number,
      scheduled_fixture.division,
      scheduled_fixture.game,
      scheduled_fixture.course,
      scheduled_fixture.player1,
      scheduled_fixture.player2,
      scheduled_fixture.player1_name,
      scheduled_fixture.player2_name,
      scheduled_fixture.player1_id,
      scheduled_fixture.player2_id,
      scheduled_fixture.due_date,
      scheduled_fixture.roster_version_id,
      scheduled_fixture.division_number,
      scheduled_fixture.game_number
    ) is distinct from row(
      'stroke'::text,
      v_season.season_number,
      'Stroke D' || desired_row.division_number::text,
      desired_row.game_number::text,
      desired_row.effective_course,
      desired_row.player1_screen_name,
      desired_row.player2_screen_name,
      desired_row.player1_screen_name,
      desired_row.player2_screen_name,
      desired_row.player1_id,
      desired_row.player2_id,
      v_season.due_date,
      v_roster.id,
      desired_row.division_number,
      desired_row.game_number
    );

  get diagnostics v_updated_count = row_count;

  -- Delete only obsolete, unplayed, managed fixtures. Legacy rows and
  -- every fixture with a completed result remain untouched.

  delete from public.schedule as scheduled_fixture
  where lower(btrim(scheduled_fixture.league_type)) = 'stroke'
    and scheduled_fixture.season_id = p_season_id
    and not exists (
      select 1
      from jsonb_to_recordset(v_desired_fixtures) as desired_fixture(
        division_number integer,
        game_number integer,
        player1_id uuid,
        player2_id uuid,
        player1_screen_name text,
        player2_screen_name text,
        effective_course text
      )
      where desired_fixture.division_number =
            scheduled_fixture.division_number
        and least(
              desired_fixture.player1_id,
              desired_fixture.player2_id
            ) = least(
              scheduled_fixture.player1_id,
              scheduled_fixture.player2_id
            )
        and greatest(
              desired_fixture.player1_id,
              desired_fixture.player2_id
            ) = greatest(
              scheduled_fixture.player1_id,
              scheduled_fixture.player2_id
            )
    )
    and not exists (
      select 1
      from public.results as completed_result
      where completed_result.schedule_id = scheduled_fixture.id
        and lower(btrim(completed_result.league_type)) = 'stroke'
        and completed_result.player1_score is not null
        and completed_result.player2_score is not null
    );

  get diagnostics v_deleted_count = row_count;

  -- Insert desired real fixtures that do not already exist as managed
  -- unordered pairs for this season and division.

  with desired_rows as (
    select *
    from jsonb_to_recordset(v_desired_fixtures) as desired_fixture(
      division_number integer,
      game_number integer,
      player1_id uuid,
      player2_id uuid,
      player1_screen_name text,
      player2_screen_name text,
      effective_course text
    )
  )
  insert into public.schedule (
    league_type,
    season_number,
    division,
    game,
    course,
    player1,
    player2,
    player1_name,
    player2_name,
    player1_id,
    player2_id,
    status,
    due_date,
    season_id,
    roster_version_id,
    division_number,
    game_number
  )
  select
    'stroke',
    v_season.season_number,
    'Stroke D' || desired_row.division_number::text,
    desired_row.game_number::text,
    desired_row.effective_course,
    desired_row.player1_screen_name,
    desired_row.player2_screen_name,
    desired_row.player1_screen_name,
    desired_row.player2_screen_name,
    desired_row.player1_id,
    desired_row.player2_id,
    'assigned',
    v_season.due_date,
    p_season_id,
    v_roster.id,
    desired_row.division_number,
    desired_row.game_number
  from desired_rows as desired_row
  where not exists (
    select 1
    from public.schedule as existing_fixture
    where lower(btrim(existing_fixture.league_type)) = 'stroke'
      and existing_fixture.season_id = p_season_id
      and existing_fixture.division_number = desired_row.division_number
      and least(
            existing_fixture.player1_id,
            existing_fixture.player2_id
          ) = least(
            desired_row.player1_id,
            desired_row.player2_id
          )
      and greatest(
            existing_fixture.player1_id,
            existing_fixture.player2_id
          ) = greatest(
            desired_row.player1_id,
            desired_row.player2_id
          )
  );

  get diagnostics v_inserted_count = row_count;

  -- Mark only generation completion for this logical revision. Review
  -- and Discord-post revisions and metadata remain unchanged.

  update public.stroke_schedule_state as schedule_state
  set
    generated_revision = schedule_state.change_revision,
    generated_at = now(),
    generated_by = v_user_id
  where schedule_state.season_id = p_season_id
    and schedule_state.change_revision = v_change_revision;

  if not found then
    raise exception
      'Schedule workflow revision changed during generation; no schedule changes were committed';
  end if;

  v_generated_revision := v_change_revision;

  select count(*)::integer
  into v_fixture_count
  from public.schedule as scheduled_fixture
  where lower(btrim(scheduled_fixture.league_type)) = 'stroke'
    and scheduled_fixture.season_id = p_season_id;

  select count(*)::integer
  into v_completed_fixture_count
  from public.schedule as scheduled_fixture
  where lower(btrim(scheduled_fixture.league_type)) = 'stroke'
    and scheduled_fixture.season_id = p_season_id
    and exists (
      select 1
      from public.results as completed_result
      where completed_result.schedule_id = scheduled_fixture.id
        and lower(btrim(completed_result.league_type)) = 'stroke'
        and completed_result.player1_score is not null
        and completed_result.player2_score is not null
    );

  return query
  select
    p_season_id,
    v_roster.id,
    v_change_revision,
    v_generated_revision,
    v_fixture_count,
    v_completed_fixture_count,
    v_inserted_count,
    v_updated_count,
    v_deleted_count,
    true;
end;
$function$;

revoke all
  on function public.generate_stroke_schedule(uuid)
  from public;

revoke all
  on function public.generate_stroke_schedule(uuid)
  from anon;

revoke all
  on function public.generate_stroke_schedule(uuid)
  from authenticated;

grant execute
  on function public.generate_stroke_schedule(uuid)
  to authenticated;

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

  if not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode = '42501';
  end if;

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

create or replace function public.save_stroke_result(
  p_schedule_id uuid,
  p_player1_score integer,
  p_player2_score integer
)
returns table(
  result_id uuid,
  schedule_id uuid,
  player1_score integer,
  player2_score integer,
  winner text,
  is_draw boolean,
  result_created boolean
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid;
  v_schedule public.schedule%rowtype;
  v_result public.results%rowtype;
  v_player1_name text;
  v_player2_name text;
  v_winner text;
  v_is_draw boolean;
  v_result_created boolean := false;
begin
  v_user_id := auth.uid();

  if not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode = '42501';
  end if;

  if v_user_id is null then
    raise exception
      'Authentication is required to save a Stroke result'
      using errcode = '42501';
  end if;

  if p_schedule_id is null then
    raise exception 'Schedule fixture ID is required';
  end if;

  if p_player1_score is null or p_player2_score is null then
    raise exception 'Both Stroke scores are required';
  end if;

  select scheduled_fixture.*
  into v_schedule
  from public.schedule as scheduled_fixture
  where scheduled_fixture.id = p_schedule_id
  for update;

  if not found then
    raise exception 'Schedule fixture % was not found', p_schedule_id;
  end if;

  if lower(btrim(v_schedule.league_type)) is distinct from 'stroke'
    or v_schedule.season_id is null
    or v_schedule.roster_version_id is null
    or v_schedule.division_number is null
    or v_schedule.division_number <= 0
    or v_schedule.game_number is null
    or v_schedule.game_number not between 1 and 3
    or v_schedule.player1_id is null
    or v_schedule.player2_id is null
    or v_schedule.player1_id = v_schedule.player2_id
  then
    raise exception
      'Schedule fixture % is not a valid managed Stroke fixture',
      p_schedule_id;
  end if;

  perform 1
  from public.stroke_schedule_state as schedule_state
  where schedule_state.season_id = v_schedule.season_id
    and schedule_state.change_revision = schedule_state.generated_revision
    and schedule_state.generated_revision = schedule_state.reviewed_revision
    and schedule_state.generated_revision > 0
  for update;

  if not found then
    raise exception
      'Stroke results can be saved only after the current schedule has been generated and reviewed';
  end if;

  v_player1_name := coalesce(v_schedule.player1_name, v_schedule.player1);
  v_player2_name := coalesce(v_schedule.player2_name, v_schedule.player2);

  if v_player1_name is null or btrim(v_player1_name) = ''
    or v_player2_name is null or btrim(v_player2_name) = ''
  then
    raise exception
      'Managed Stroke fixture % is missing a player display snapshot',
      p_schedule_id;
  end if;

  if p_player1_score < p_player2_score then
    v_winner := v_player1_name;
    v_is_draw := false;
  elsif p_player2_score < p_player1_score then
    v_winner := v_player2_name;
    v_is_draw := false;
  else
    v_winner := null;
    v_is_draw := true;
  end if;

  select existing_result.*
  into v_result
  from public.results as existing_result
  where existing_result.schedule_id = p_schedule_id
    and lower(btrim(existing_result.league_type)) = 'stroke'
  for update;

  if found then
    update public.results as result_row
    set player1_score = p_player1_score,
        player2_score = p_player2_score,
        winner = v_winner,
        is_draw = v_is_draw
    where result_row.id = v_result.id
    returning result_row.* into v_result;
  else
    insert into public.results (
      schedule_id,
      league_type,
      season_number,
      division,
      game,
      course,
      player1,
      player2,
      player1_id,
      player2_id,
      result_type,
      player1_score,
      player2_score,
      winner,
      is_draw
    )
    values (
      v_schedule.id,
      v_schedule.league_type,
      v_schedule.season_number,
      v_schedule.division,
      v_schedule.game,
      v_schedule.course,
      v_player1_name,
      v_player2_name,
      v_schedule.player1_id,
      v_schedule.player2_id,
      'league_result',
      p_player1_score,
      p_player2_score,
      v_winner,
      v_is_draw
    )
    returning * into v_result;

    v_result_created := true;
  end if;

  return query
  select
    v_result.id,
    v_result.schedule_id,
    v_result.player1_score,
    v_result.player2_score,
    v_result.winner,
    v_result.is_draw,
    v_result_created;
end;
$function$;

revoke all on function public.save_stroke_result(uuid, integer, integer)
from public;

revoke all on function public.save_stroke_result(uuid, integer, integer)
from anon;

revoke all on function public.save_stroke_result(uuid, integer, integer)
from authenticated;

grant execute on function public.save_stroke_result(uuid, integer, integer)
to authenticated;

create or replace function public.rebuild_stroke_standings(
  p_season_id uuid,
  p_division_number integer
)
returns table(
  season_id uuid,
  roster_version_id uuid,
  division_number integer,
  rostered_player_count integer,
  completed_fixture_count integer
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
  v_rostered_player_count integer;
  v_completed_fixture_count integer;
  v_division text;
  v_standing record;
begin
  v_user_id := auth.uid();

  if not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode = '42501';
  end if;

  if v_user_id is null then
    raise exception
      'Authentication is required to rebuild Stroke standings'
      using errcode = '42501';
  end if;

  if p_season_id is null then
    raise exception 'Season ID is required';
  end if;

  if p_division_number is null or p_division_number <= 0 then
    raise exception 'Division number must be a positive integer';
  end if;

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
        'A locked historical Stroke roster cannot have live standings rebuilt'
        using errcode = '42501';
    end if;

    raise exception 'Exactly one approved Stroke roster is required';
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
      'A locked historical Stroke roster exists for this season; live standings rebuild is not allowed'
      using errcode = '42501';
  end if;

  select season.*
  into v_season
  from public.seasons as season
  where season.id = p_season_id
  for share;

  if not found then
    raise exception 'Season % was not found', p_season_id;
  end if;

  if lower(btrim(v_season.league_type)) is distinct from 'stroke' then
    raise exception 'Season % is not a Stroke season', p_season_id;
  end if;

  if p_division_number > v_roster.division_count then
    raise exception
      'Division % is outside the valid range 1..%',
      p_division_number,
      v_roster.division_count;
  end if;

  perform 1
  from public.stroke_schedule_state as schedule_state
  where schedule_state.season_id = p_season_id
    and schedule_state.change_revision = schedule_state.generated_revision
    and schedule_state.generated_revision = schedule_state.reviewed_revision
    and schedule_state.generated_revision > 0
  for update;

  if not found then
    raise exception
      'Stroke standings can be rebuilt only after the current schedule has been generated and reviewed';
  end if;

  perform 1
  from public.stroke_division_roster_slots as roster_slot
  where roster_slot.roster_version_id = v_roster.id
    and roster_slot.division_number = p_division_number
  order by roster_slot.slot_number
  for share;

  if exists (
    select 1
    from public.stroke_division_roster_slots as roster_slot
    where roster_slot.roster_version_id = v_roster.id
      and roster_slot.division_number = p_division_number
      and roster_slot.player_id is not null
      and (
        roster_slot.player_screen_name is null
        or btrim(roster_slot.player_screen_name) = ''
      )
  ) then
    raise exception
      'Every populated Stroke roster slot must have a screen-name snapshot';
  end if;

  if exists (
    select 1
    from public.results as result_row
    join public.schedule as scheduled_fixture
      on scheduled_fixture.id = result_row.schedule_id
    where lower(btrim(result_row.league_type)) = 'stroke'
      and lower(btrim(scheduled_fixture.league_type)) = 'stroke'
      and scheduled_fixture.season_id = p_season_id
      and scheduled_fixture.roster_version_id = v_roster.id
      and scheduled_fixture.division_number = p_division_number
      and result_row.player1_score is not null
      and result_row.player2_score is not null
      and (
        result_row.player1_id is null
        or result_row.player2_id is null
        or result_row.player1_id <> scheduled_fixture.player1_id
        or result_row.player2_id <> scheduled_fixture.player2_id
        or not exists (
          select 1
          from public.stroke_division_roster_slots as player1_slot
          where player1_slot.roster_version_id = v_roster.id
            and player1_slot.division_number = p_division_number
            and player1_slot.player_id = result_row.player1_id
        )
        or not exists (
          select 1
          from public.stroke_division_roster_slots as player2_slot
          where player2_slot.roster_version_id = v_roster.id
            and player2_slot.division_number = p_division_number
            and player2_slot.player_id = result_row.player2_id
        )
      )
  ) then
    raise exception
      'A managed completed Stroke result does not match the approved roster or its schedule fixture';
  end if;

  v_division := 'Stroke D' || p_division_number::text;

  select count(*)::integer
  into v_rostered_player_count
  from public.stroke_division_roster_slots as roster_slot
  where roster_slot.roster_version_id = v_roster.id
    and roster_slot.division_number = p_division_number
    and roster_slot.player_id is not null;

  select count(*)::integer
  into v_completed_fixture_count
  from public.results as result_row
  join public.schedule as scheduled_fixture
    on scheduled_fixture.id = result_row.schedule_id
  where lower(btrim(result_row.league_type)) = 'stroke'
    and lower(btrim(scheduled_fixture.league_type)) = 'stroke'
    and scheduled_fixture.season_id = p_season_id
    and scheduled_fixture.roster_version_id = v_roster.id
    and scheduled_fixture.division_number = p_division_number
    and result_row.player1_id is not null
    and result_row.player2_id is not null
    and result_row.player1_score is not null
    and result_row.player2_score is not null;

  perform 1
  from public.season_standings as standing
  where standing.league_type = 'stroke'
    and standing.season_number = v_season.season_number
    and (
      standing.division = v_division
      or standing.player_id in (
        select roster_slot.player_id
        from public.stroke_division_roster_slots as roster_slot
        where roster_slot.roster_version_id = v_roster.id
          and roster_slot.division_number = p_division_number
          and roster_slot.player_id is not null
      )
    )
  for update;

  delete from public.season_standings as standing
  where standing.league_type = 'stroke'
    and standing.season_number = v_season.season_number
    and standing.division = v_division
    and not exists (
      select 1
      from public.stroke_division_roster_slots as roster_slot
      where roster_slot.roster_version_id = v_roster.id
        and roster_slot.division_number = p_division_number
        and roster_slot.player_id = standing.player_id
    );

  for v_standing in
    with roster_players as (
      select
        roster_slot.player_id,
        roster_slot.player_screen_name
      from public.stroke_division_roster_slots as roster_slot
      where roster_slot.roster_version_id = v_roster.id
        and roster_slot.division_number = p_division_number
        and roster_slot.player_id is not null
    ),
    completed_results as (
      select
        result_row.player1_id,
        result_row.player2_id,
        result_row.player1_score,
        result_row.player2_score
      from public.results as result_row
      join public.schedule as scheduled_fixture
        on scheduled_fixture.id = result_row.schedule_id
      where lower(btrim(result_row.league_type)) = 'stroke'
        and lower(btrim(scheduled_fixture.league_type)) = 'stroke'
        and scheduled_fixture.season_id = p_season_id
        and scheduled_fixture.roster_version_id = v_roster.id
        and scheduled_fixture.division_number = p_division_number
        and result_row.player1_id is not null
        and result_row.player2_id is not null
        and result_row.player1_score is not null
        and result_row.player2_score is not null
    ),
    contributions as (
      select
        completed_result.player1_id as player_id,
        case when completed_result.player1_score < completed_result.player2_score then 1 else 0 end as wins,
        case when completed_result.player1_score > completed_result.player2_score then 1 else 0 end as losses,
        case when completed_result.player1_score = completed_result.player2_score then 1 else 0 end as ties,
        completed_result.player1_score as strokes
      from completed_results as completed_result

      union all

      select
        completed_result.player2_id as player_id,
        case when completed_result.player2_score < completed_result.player1_score then 1 else 0 end as wins,
        case when completed_result.player2_score > completed_result.player1_score then 1 else 0 end as losses,
        case when completed_result.player2_score = completed_result.player1_score then 1 else 0 end as ties,
        completed_result.player2_score as strokes
      from completed_results as completed_result
    ),
    totals as (
      select
        roster_player.player_id,
        roster_player.player_screen_name,
        coalesce(sum(contribution.wins), 0)::integer as wins,
        coalesce(sum(contribution.losses), 0)::integer as losses,
        coalesce(sum(contribution.ties), 0)::integer as ties,
        coalesce(sum(contribution.strokes), 0)::integer as strokes
      from roster_players as roster_player
      left join contributions as contribution
        on contribution.player_id = roster_player.player_id
      group by roster_player.player_id, roster_player.player_screen_name
    )
    select
      total.player_id,
      total.wins,
      total.losses,
      total.ties,
      total.wins * 3 + total.ties as points,
      total.strokes,
      row_number() over (
        order by
          total.wins * 3 + total.ties desc,
          total.wins desc,
          total.strokes asc,
          total.player_screen_name asc
      )::integer as rank
    from totals as total
  loop
    insert into public.season_standings (
      player_id,
      league_type,
      season_number,
      division,
      points,
      wins,
      losses,
      ties,
      strokes,
      rank,
      updated_at
    )
    values (
      v_standing.player_id,
      'stroke',
      v_season.season_number,
      v_division,
      v_standing.points,
      v_standing.wins,
      v_standing.losses,
      v_standing.ties,
      v_standing.strokes,
      v_standing.rank,
      now()
    )
    on conflict (player_id, league_type, season_number)
    do update set
      division = excluded.division,
      points = excluded.points,
      wins = excluded.wins,
      losses = excluded.losses,
      ties = excluded.ties,
      strokes = excluded.strokes,
      rank = excluded.rank,
      updated_at = excluded.updated_at;
  end loop;

  return query
  select
    p_season_id,
    v_roster.id,
    p_division_number,
    v_rostered_player_count,
    v_completed_fixture_count;
end;
$function$;

revoke all on function public.rebuild_stroke_standings(uuid, integer)
from public;

revoke all on function public.rebuild_stroke_standings(uuid, integer)
from anon;

revoke all on function public.rebuild_stroke_standings(uuid, integer)
from authenticated;

grant execute on function public.rebuild_stroke_standings(uuid, integer)
to authenticated;

create or replace function public.generate_stroke_final_scorecard(
  p_season_id uuid
)
returns table(
  scorecard_id uuid,
  season_id uuid,
  roster_version_id uuid,
  status text,
  player_count integer,
  completed_fixture_count integer,
  total_fixture_count integer,
  incomplete_fixture_count integer
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid;
  v_roster public.stroke_roster_versions%rowtype;
  v_season public.seasons%rowtype;
  v_scorecard public.stroke_final_scorecards%rowtype;
  v_approved_roster_count integer;
  v_player_count integer;
  v_completed_fixture_count integer;
  v_total_fixture_count integer;
begin
  v_user_id := auth.uid();

  if not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode = '42501';
  end if;

  if v_user_id is null then
    raise exception
      'Authentication is required to generate a Stroke Final Scorecard'
      using errcode = '42501';
  end if;

  if p_season_id is null then
    raise exception 'Season ID is required';
  end if;

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
        'A locked historical Stroke roster cannot generate another Final Scorecard'
        using errcode = '42501';
    end if;

    raise exception 'Exactly one approved Stroke roster is required';
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

  select season.*
  into v_season
  from public.seasons as season
  where season.id = p_season_id
  for share;

  if not found then
    raise exception 'Season % was not found', p_season_id;
  end if;

  if lower(btrim(v_season.league_type)) is distinct from 'stroke' then
    raise exception 'Season % is not a Stroke season', p_season_id;
  end if;

  perform 1
  from public.stroke_schedule_state as schedule_state
  where schedule_state.season_id = p_season_id
    and schedule_state.change_revision = schedule_state.generated_revision
    and schedule_state.generated_revision = schedule_state.reviewed_revision
    and schedule_state.generated_revision > 0
  for update;

  if not found then
    raise exception
      'The current Stroke schedule must be generated and reviewed before generating a Final Scorecard';
  end if;

  perform 1
  from public.stroke_division_roster_slots as roster_slot
  where roster_slot.roster_version_id = v_roster.id
  order by roster_slot.division_number, roster_slot.slot_number
  for share;

  if exists (
    select 1
    from public.stroke_final_scorecards as approved_scorecard
    where approved_scorecard.season_id = p_season_id
      and approved_scorecard.status = 'approved'
  ) then
    raise exception 'An approved Final Scorecard already exists for this Stroke season';
  end if;

  select scorecard.*
  into v_scorecard
  from public.stroke_final_scorecards as scorecard
  where scorecard.season_id = p_season_id
    and scorecard.status = 'draft'
  for update;

  if found then
    if v_scorecard.source_roster_version_id <> v_roster.id then
      raise exception
        'The existing draft Final Scorecard belongs to a different roster version';
    end if;
  else
    insert into public.stroke_final_scorecards (
      season_id,
      source_roster_version_id,
      status
    )
    values (
      p_season_id,
      v_roster.id,
      'draft'
    )
    returning * into v_scorecard;
  end if;

  if exists (
    select 1
    from public.results as result_row
    join public.schedule as scheduled_fixture
      on scheduled_fixture.id = result_row.schedule_id
    where lower(btrim(result_row.league_type)) = 'stroke'
      and lower(btrim(scheduled_fixture.league_type)) = 'stroke'
      and scheduled_fixture.season_id = p_season_id
      and scheduled_fixture.roster_version_id = v_roster.id
      and result_row.player1_score is not null
      and result_row.player2_score is not null
      and (
        result_row.player1_id is null
        or result_row.player2_id is null
        or result_row.player1_id <> scheduled_fixture.player1_id
        or result_row.player2_id <> scheduled_fixture.player2_id
        or not exists (
          select 1
          from public.stroke_division_roster_slots as player1_slot
          where player1_slot.roster_version_id = v_roster.id
            and player1_slot.division_number = scheduled_fixture.division_number
            and player1_slot.player_id = result_row.player1_id
        )
        or not exists (
          select 1
          from public.stroke_division_roster_slots as player2_slot
          where player2_slot.roster_version_id = v_roster.id
            and player2_slot.division_number = scheduled_fixture.division_number
            and player2_slot.player_id = result_row.player2_id
        )
      )
  ) then
    raise exception
      'A managed completed Stroke result does not match its schedule fixture or approved roster';
  end if;

  delete from public.stroke_final_scorecard_entries as entry
  where entry.scorecard_id = v_scorecard.id;

  insert into public.stroke_final_scorecard_entries (
    scorecard_id,
    season_id,
    division_number,
    division_rank,
    player_id,
    player_screen_name,
    completed_game_count,
    wins,
    losses,
    ties,
    points,
    strokes
  )
  with roster_players as (
    select
      roster_slot.player_id,
      roster_slot.player_screen_name,
      roster_slot.division_number
    from public.stroke_division_roster_slots as roster_slot
    where roster_slot.roster_version_id = v_roster.id
      and roster_slot.player_id is not null
  ),
  completed_results as (
    select
      scheduled_fixture.division_number,
      result_row.player1_id,
      result_row.player2_id,
      result_row.player1_score,
      result_row.player2_score
    from public.results as result_row
    join public.schedule as scheduled_fixture
      on scheduled_fixture.id = result_row.schedule_id
    where lower(btrim(result_row.league_type)) = 'stroke'
      and lower(btrim(scheduled_fixture.league_type)) = 'stroke'
      and scheduled_fixture.season_id = p_season_id
      and scheduled_fixture.roster_version_id = v_roster.id
      and result_row.player1_id is not null
      and result_row.player2_id is not null
      and result_row.player1_score is not null
      and result_row.player2_score is not null
  ),
  contributions as (
    select
      completed_result.division_number,
      completed_result.player1_id as player_id,
      1 as completed_games,
      case when completed_result.player1_score < completed_result.player2_score then 1 else 0 end as wins,
      case when completed_result.player1_score > completed_result.player2_score then 1 else 0 end as losses,
      case when completed_result.player1_score = completed_result.player2_score then 1 else 0 end as ties,
      completed_result.player1_score as strokes
    from completed_results as completed_result

    union all

    select
      completed_result.division_number,
      completed_result.player2_id as player_id,
      1 as completed_games,
      case when completed_result.player2_score < completed_result.player1_score then 1 else 0 end as wins,
      case when completed_result.player2_score > completed_result.player1_score then 1 else 0 end as losses,
      case when completed_result.player2_score = completed_result.player1_score then 1 else 0 end as ties,
      completed_result.player2_score as strokes
    from completed_results as completed_result
  ),
  totals as (
    select
      roster_player.player_id,
      roster_player.player_screen_name,
      roster_player.division_number,
      coalesce(sum(contribution.completed_games), 0)::integer as completed_game_count,
      coalesce(sum(contribution.wins), 0)::integer as wins,
      coalesce(sum(contribution.losses), 0)::integer as losses,
      coalesce(sum(contribution.ties), 0)::integer as ties,
      coalesce(sum(contribution.strokes), 0)::integer as strokes
    from roster_players as roster_player
    left join contributions as contribution
      on contribution.player_id = roster_player.player_id
      and contribution.division_number = roster_player.division_number
    group by
      roster_player.player_id,
      roster_player.player_screen_name,
      roster_player.division_number
  ),
  ranked as (
    select
      total.*,
      total.wins * 3 + total.ties as points,
      row_number() over (
        partition by total.division_number
        order by
          total.wins * 3 + total.ties desc,
          total.wins desc,
          total.strokes asc,
          total.player_screen_name asc
      )::integer as division_rank
    from totals as total
  )
  select
    v_scorecard.id,
    p_season_id,
    ranked.division_number,
    ranked.division_rank,
    ranked.player_id,
    ranked.player_screen_name,
    ranked.completed_game_count,
    ranked.wins,
    ranked.losses,
    ranked.ties,
    ranked.points,
    ranked.strokes
  from ranked;

  update public.stroke_final_scorecards as scorecard
  set updated_at = now()
  where scorecard.id = v_scorecard.id
  returning scorecard.* into v_scorecard;

  select count(*)::integer
  into v_player_count
  from public.stroke_final_scorecard_entries as entry
  where entry.scorecard_id = v_scorecard.id;

  select count(*)::integer
  into v_total_fixture_count
  from public.schedule as scheduled_fixture
  where lower(btrim(scheduled_fixture.league_type)) = 'stroke'
    and scheduled_fixture.season_id = p_season_id
    and scheduled_fixture.roster_version_id = v_roster.id;

  select count(*)::integer
  into v_completed_fixture_count
  from public.schedule as scheduled_fixture
  where lower(btrim(scheduled_fixture.league_type)) = 'stroke'
    and scheduled_fixture.season_id = p_season_id
    and scheduled_fixture.roster_version_id = v_roster.id
    and exists (
      select 1
      from public.results as result_row
      where result_row.schedule_id = scheduled_fixture.id
        and lower(btrim(result_row.league_type)) = 'stroke'
        and result_row.player1_score is not null
        and result_row.player2_score is not null
    );

  return query
  select
    v_scorecard.id,
    p_season_id,
    v_roster.id,
    v_scorecard.status,
    v_player_count,
    v_completed_fixture_count,
    v_total_fixture_count,
    v_total_fixture_count - v_completed_fixture_count;
end;
$function$;

revoke all on function public.generate_stroke_final_scorecard(uuid)
from public;

revoke all on function public.generate_stroke_final_scorecard(uuid)
from anon;

revoke all on function public.generate_stroke_final_scorecard(uuid)
from authenticated;

grant execute on function public.generate_stroke_final_scorecard(uuid)
to authenticated;

create or replace function public.approve_stroke_final_scorecard(
  p_final_scorecard_id uuid,
  p_approval_note text default null
)
returns table(
  scorecard_id uuid,
  season_id uuid,
  roster_version_id uuid,
  status text,
  approved_at timestamptz,
  approved_by uuid
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid;
  v_scorecard public.stroke_final_scorecards%rowtype;
  v_roster public.stroke_roster_versions%rowtype;
  v_season public.seasons%rowtype;
  v_incomplete_fixture_count integer;
begin
  v_user_id := auth.uid();

  if not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode = '42501';
  end if;

  if v_user_id is null then
    raise exception
      'Authentication is required to approve a Stroke Final Scorecard'
      using errcode = '42501';
  end if;

  if p_final_scorecard_id is null then
    raise exception 'Final Scorecard ID is required';
  end if;

  select scorecard.*
  into v_scorecard
  from public.stroke_final_scorecards as scorecard
  where scorecard.id = p_final_scorecard_id;

  if not found then
    raise exception 'Final Scorecard % was not found', p_final_scorecard_id;
  end if;

  select roster.*
  into v_roster
  from public.stroke_roster_versions as roster
  where roster.id = v_scorecard.source_roster_version_id
    and roster.season_id = v_scorecard.season_id
  for update;

  if not found or v_roster.status <> 'approved' then
    raise exception 'The Final Scorecard source roster is no longer approved';
  end if;

  select season.*
  into v_season
  from public.seasons as season
  where season.id = v_scorecard.season_id
  for share;

  if not found then
    raise exception 'The Final Scorecard parent season was not found';
  end if;

  if lower(btrim(v_season.league_type)) is distinct from 'stroke' then
    raise exception 'The Final Scorecard parent season is not a Stroke season';
  end if;

  perform 1
  from public.stroke_schedule_state as schedule_state
  where schedule_state.season_id = v_scorecard.season_id
    and schedule_state.change_revision = schedule_state.generated_revision
    and schedule_state.generated_revision = schedule_state.reviewed_revision
    and schedule_state.generated_revision > 0
  for update;

  if not found then
    raise exception
      'The current Stroke schedule must be generated and reviewed before Final Scorecard approval';
  end if;

  select scorecard.*
  into v_scorecard
  from public.stroke_final_scorecards as scorecard
  where scorecard.id = p_final_scorecard_id
  for update;

  if v_scorecard.status <> 'draft' then
    raise exception 'Only a draft Final Scorecard can be approved';
  end if;

  if exists (
    select 1
    from public.stroke_final_scorecards as approved_scorecard
    where approved_scorecard.season_id = v_scorecard.season_id
      and approved_scorecard.status = 'approved'
      and approved_scorecard.id <> v_scorecard.id
  ) then
    raise exception 'An approved Final Scorecard already exists for this Stroke season';
  end if;

  perform 1
  from public.stroke_division_roster_slots as roster_slot
  where roster_slot.roster_version_id = v_roster.id
  order by roster_slot.division_number, roster_slot.slot_number
  for share;

  select count(*)::integer
  into v_incomplete_fixture_count
  from public.schedule as scheduled_fixture
  where lower(btrim(scheduled_fixture.league_type)) = 'stroke'
    and scheduled_fixture.season_id = v_scorecard.season_id
    and scheduled_fixture.roster_version_id = v_roster.id
    and not exists (
      select 1
      from public.results as result_row
      where result_row.schedule_id = scheduled_fixture.id
        and lower(btrim(result_row.league_type)) = 'stroke'
        and result_row.player1_score is not null
        and result_row.player2_score is not null
    );

  if v_incomplete_fixture_count > 0 then
    raise exception
      'Final Scorecard cannot be approved: % managed fixture(s) are incomplete',
      v_incomplete_fixture_count;
  end if;

  if exists (
    with roster_players as (
      select
        roster_slot.player_id,
        roster_slot.player_screen_name,
        roster_slot.division_number
      from public.stroke_division_roster_slots as roster_slot
      where roster_slot.roster_version_id = v_roster.id
        and roster_slot.player_id is not null
    ),
    completed_results as (
      select
        scheduled_fixture.division_number,
        result_row.player1_id,
        result_row.player2_id,
        result_row.player1_score,
        result_row.player2_score
      from public.results as result_row
      join public.schedule as scheduled_fixture
        on scheduled_fixture.id = result_row.schedule_id
      where lower(btrim(result_row.league_type)) = 'stroke'
        and lower(btrim(scheduled_fixture.league_type)) = 'stroke'
        and scheduled_fixture.season_id = v_scorecard.season_id
        and scheduled_fixture.roster_version_id = v_roster.id
        and result_row.player1_id is not null
        and result_row.player2_id is not null
        and result_row.player1_score is not null
        and result_row.player2_score is not null
    ),
    contributions as (
      select
        completed_result.division_number,
        completed_result.player1_id as player_id,
        1 as completed_games,
        case when completed_result.player1_score < completed_result.player2_score then 1 else 0 end as wins,
        case when completed_result.player1_score > completed_result.player2_score then 1 else 0 end as losses,
        case when completed_result.player1_score = completed_result.player2_score then 1 else 0 end as ties,
        completed_result.player1_score as strokes
      from completed_results as completed_result

      union all

      select
        completed_result.division_number,
        completed_result.player2_id as player_id,
        1 as completed_games,
        case when completed_result.player2_score < completed_result.player1_score then 1 else 0 end as wins,
        case when completed_result.player2_score > completed_result.player1_score then 1 else 0 end as losses,
        case when completed_result.player2_score = completed_result.player1_score then 1 else 0 end as ties,
        completed_result.player2_score as strokes
      from completed_results as completed_result
    ),
    totals as (
      select
        roster_player.player_id,
        roster_player.player_screen_name,
        roster_player.division_number,
        coalesce(sum(contribution.completed_games), 0)::integer as completed_game_count,
        coalesce(sum(contribution.wins), 0)::integer as wins,
        coalesce(sum(contribution.losses), 0)::integer as losses,
        coalesce(sum(contribution.ties), 0)::integer as ties,
        coalesce(sum(contribution.strokes), 0)::integer as strokes
      from roster_players as roster_player
      left join contributions as contribution
        on contribution.player_id = roster_player.player_id
        and contribution.division_number = roster_player.division_number
      group by
        roster_player.player_id,
        roster_player.player_screen_name,
        roster_player.division_number
    ),
    expected as (
      select
        total.player_id,
        total.player_screen_name,
        total.division_number,
        row_number() over (
          partition by total.division_number
          order by
            total.wins * 3 + total.ties desc,
            total.wins desc,
            total.strokes asc,
            total.player_screen_name asc
        )::integer as division_rank,
        total.completed_game_count,
        total.wins,
        total.losses,
        total.ties,
        total.wins * 3 + total.ties as points,
        total.strokes
      from totals as total
    ),
    differences as (
      (
        select
          expected.player_id,
          expected.player_screen_name,
          expected.division_number,
          expected.division_rank,
          expected.completed_game_count,
          expected.wins,
          expected.losses,
          expected.ties,
          expected.points,
          expected.strokes
        from expected
        except
        select
          entry.player_id,
          entry.player_screen_name,
          entry.division_number,
          entry.division_rank,
          entry.completed_game_count,
          entry.wins,
          entry.losses,
          entry.ties,
          entry.points,
          entry.strokes
        from public.stroke_final_scorecard_entries as entry
        where entry.scorecard_id = v_scorecard.id
      )
      union all
      (
        select
          entry.player_id,
          entry.player_screen_name,
          entry.division_number,
          entry.division_rank,
          entry.completed_game_count,
          entry.wins,
          entry.losses,
          entry.ties,
          entry.points,
          entry.strokes
        from public.stroke_final_scorecard_entries as entry
        where entry.scorecard_id = v_scorecard.id
        except
        select
          expected.player_id,
          expected.player_screen_name,
          expected.division_number,
          expected.division_rank,
          expected.completed_game_count,
          expected.wins,
          expected.losses,
          expected.ties,
          expected.points,
          expected.strokes
        from expected
      )
    )
    select 1
    from differences
    limit 1
  ) then
    raise exception 'Final Scorecard is stale. Regenerate it before approval.';
  end if;

  update public.stroke_final_scorecards as scorecard
  set status = 'approved',
      approved_at = now(),
      approved_by = v_user_id,
      approval_note = nullif(btrim(p_approval_note), ''),
      updated_at = now()
  where scorecard.id = v_scorecard.id
  returning scorecard.* into v_scorecard;

  return query
  select
    v_scorecard.id,
    v_scorecard.season_id,
    v_scorecard.source_roster_version_id,
    v_scorecard.status,
    v_scorecard.approved_at,
    v_scorecard.approved_by;
end;
$function$;

revoke all on function public.approve_stroke_final_scorecard(uuid, text)
from public;

revoke all on function public.approve_stroke_final_scorecard(uuid, text)
from anon;

revoke all on function public.approve_stroke_final_scorecard(uuid, text)
from authenticated;

grant execute on function public.approve_stroke_final_scorecard(uuid, text)
to authenticated;

create or replace function public.set_stroke_return_decision(
  p_final_scorecard_id uuid,
  p_player_id uuid,
  p_decision text
)
returns table(
  final_scorecard_id uuid,
  player_id uuid,
  decision text,
  decided_at timestamptz,
  decided_by uuid
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid;
  v_decision text;
  v_row public.stroke_final_scorecard_player_decisions%rowtype;
begin
  v_user_id := auth.uid();

  if not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode = '42501';
  end if;
  if v_user_id is null then
    raise exception 'Authentication is required to set a Stroke return decision' using errcode = '42501';
  end if;

  if p_final_scorecard_id is null or p_player_id is null then
    raise exception 'Final Scorecard ID and player ID are required';
  end if;

  v_decision := lower(btrim(p_decision));
  if v_decision not in ('returning', 'not_returning') then
    raise exception 'Decision must be returning or not_returning';
  end if;

  perform 1
  from public.stroke_final_scorecards as scorecard
  where scorecard.id = p_final_scorecard_id
    and scorecard.status = 'approved'
  for share;
  if not found then raise exception 'An approved Stroke Final Scorecard is required'; end if;

  if not exists (
    select 1 from public.stroke_final_scorecard_entries as entry
    where entry.scorecard_id = p_final_scorecard_id and entry.player_id = p_player_id
  ) then
    raise exception 'Player is not an entry on this approved Final Scorecard';
  end if;

  insert into public.stroke_final_scorecard_player_decisions (
    final_scorecard_id, player_id, decision, decided_at, decided_by
  ) values (
    p_final_scorecard_id, p_player_id, v_decision, now(), v_user_id
  )
  on conflict on constraint stroke_transition_decisions_scorecard_player_key
  do update set decision = excluded.decision, decided_at = excluded.decided_at,
    decided_by = excluded.decided_by, updated_at = now()
  returning * into v_row;

  return query select v_row.final_scorecard_id, v_row.player_id, v_row.decision,
    v_row.decided_at, v_row.decided_by;
end;
$function$;

revoke all on function public.set_stroke_return_decision(uuid, uuid, text) from public;
revoke all on function public.set_stroke_return_decision(uuid, uuid, text) from anon;
revoke all on function public.set_stroke_return_decision(uuid, uuid, text) from authenticated;
grant execute on function public.set_stroke_return_decision(uuid, uuid, text) to authenticated;

create or replace function public.generate_stroke_next_season_proposal(
  p_final_scorecard_id uuid,
  p_target_season_id uuid,
  p_target_division_count integer,
  p_new_player_ids uuid[] default '{}'
)
returns table(
  roster_version_id uuid,
  target_season_id uuid,
  target_division_count integer,
  division_number integer,
  slot_number integer,
  player_id uuid,
  player_screen_name text,
  movement_reason text
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_scorecard public.stroke_final_scorecards%rowtype;
  v_source_season public.seasons%rowtype;
  v_target_season public.seasons%rowtype;
  v_roster public.stroke_roster_versions%rowtype;
  v_source_division_count integer;
  v_returning_count integer;
  v_new_count integer;
  v_draft_count integer;
  v_missing_decisions integer;
  v_division integer;
  v_demand integer;
  v_target integer;
  v_player record;
  v_slot integer;
begin
  if not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode = '42501';
  end if;

  if v_user_id is null then
    raise exception 'Authentication is required to generate a Stroke next-season proposal' using errcode = '42501';
  end if;
  if p_final_scorecard_id is null or p_target_season_id is null then
    raise exception 'Final Scorecard ID and target season ID are required';
  end if;
  if p_target_division_count is null or p_target_division_count not between 1 and 20 then
    raise exception 'Target division count must be between 1 and 20';
  end if;
  p_new_player_ids := coalesce(p_new_player_ids, '{}'::uuid[]);

  select * into v_scorecard from public.stroke_final_scorecards
  where id = p_final_scorecard_id for share;
  if not found or v_scorecard.status <> 'approved' then
    raise exception 'An approved Stroke Final Scorecard is required';
  end if;

  select * into v_source_season from public.seasons where id = v_scorecard.season_id for share;
  if not found or lower(btrim(v_source_season.league_type)) is distinct from 'stroke' then
    raise exception 'The source season is not a valid Stroke season';
  end if;
  select * into v_target_season from public.seasons where id = p_target_season_id for share;
  if not found or lower(btrim(v_target_season.league_type)) is distinct from 'stroke' then
    raise exception 'The target season is not a valid Stroke season';
  end if;
  if v_target_season.season_number <> v_source_season.season_number + 1 then
    raise exception 'Target Stroke season number must equal source season number + 1';
  end if;

  select roster.division_count
  into v_source_division_count
  from public.stroke_roster_versions as roster
  where roster.id = v_scorecard.source_roster_version_id
    and roster.season_id = v_scorecard.season_id
    and roster.status = 'locked'
  for share;
  if not found then
    raise exception 'The approved Final Scorecard source roster is not locked historical data';
  end if;

  select count(*) filter (where decision.decision = 'returning')::integer
  into v_returning_count
  from public.stroke_final_scorecard_entries as entry
  left join public.stroke_final_scorecard_player_decisions as decision
    on decision.final_scorecard_id = entry.scorecard_id and decision.player_id = entry.player_id
  where entry.scorecard_id = p_final_scorecard_id;

  select count(*)::integer into v_missing_decisions
  from public.stroke_final_scorecard_entries as entry
  where entry.scorecard_id = p_final_scorecard_id and not exists (
    select 1 from public.stroke_final_scorecard_player_decisions as decision
    where decision.final_scorecard_id = entry.scorecard_id and decision.player_id = entry.player_id
  );
  if v_missing_decisions > 0 then
    raise exception 'Every Final Scorecard player requires a return decision; % missing', v_missing_decisions;
  end if;

  if cardinality(p_new_player_ids) <> (
    select count(distinct item.player_id) from unnest(p_new_player_ids) as item(player_id)
  ) then raise exception 'New-player selection contains duplicate UUIDs'; end if;
  if exists (select 1 from unnest(p_new_player_ids) as item(player_id)
    left join public.players as player on player.id = item.player_id where player.id is null) then
    raise exception 'Every selected new-player UUID must exist';
  end if;
  if exists (select 1 from unnest(p_new_player_ids) as item(player_id)
    join public.stroke_final_scorecard_entries as entry on entry.player_id = item.player_id
    where entry.scorecard_id = p_final_scorecard_id) then
    raise exception 'A Final Scorecard player cannot also be selected as a new player';
  end if;
  v_new_count := cardinality(p_new_player_ids);
  if v_returning_count + v_new_count > p_target_division_count * 4 then
    raise exception 'Returning and selected new players exceed target roster capacity';
  end if;

  select count(*)::integer into v_draft_count from public.stroke_roster_versions
  where season_id = p_target_season_id and status = 'draft';
  if v_draft_count > 1 then raise exception 'Target season has multiple draft rosters'; end if;
  if exists (select 1 from public.stroke_roster_versions where season_id = p_target_season_id
    and status in ('approved', 'locked')) then
    raise exception 'An approved or locked target roster cannot be replaced';
  end if;

  select * into v_roster from public.stroke_roster_versions
  where season_id = p_target_season_id and status = 'draft' limit 1 for update;
  if found then
    if v_roster.source_final_scorecard_id is not null
      and v_roster.source_final_scorecard_id <> p_final_scorecard_id then
      raise exception 'Target draft belongs to a different Final Scorecard transition';
    end if;
    if v_roster.source_final_scorecard_id is null and exists (
      select 1 from public.stroke_division_roster_slots as existing_slot
      where existing_slot.roster_version_id = v_roster.id
        and existing_slot.player_id is not null
    ) then raise exception 'Existing unlinked target draft is not empty and cannot be attached'; end if;
    update public.stroke_roster_versions set source_final_scorecard_id = p_final_scorecard_id,
      division_count = p_target_division_count, updated_at = now() where id = v_roster.id returning * into v_roster;
  else
    insert into public.stroke_roster_versions (season_id, division_count, status, source_final_scorecard_id)
    values (p_target_season_id, p_target_division_count, 'draft', p_final_scorecard_id)
    returning * into v_roster;
  end if;

  create temporary table if not exists pg_temp.stroke_transition_work (
    player_id uuid primary key, player_screen_name text not null, source_division integer,
    source_rank integer, completed_games integer, mandatory boolean not null default false,
    zero_game boolean not null default false, bottom_finish boolean not null default false,
    target_division integer, movement_reason text
  ) on commit drop;
  truncate pg_temp.stroke_transition_work;

  insert into pg_temp.stroke_transition_work (
    player_id, player_screen_name, source_division, source_rank, completed_games,
    mandatory, zero_game, bottom_finish
  )
  select entry.player_id, entry.player_screen_name, entry.division_number,
    entry.division_rank, entry.completed_game_count,
    ((entry.completed_game_count = 0 and entry.division_number < v_source_division_count)
      or entry.division_rank = (
        select max(all_entry.division_rank)
        from public.stroke_final_scorecard_entries as all_entry
        where all_entry.scorecard_id = entry.scorecard_id
          and all_entry.division_number = entry.division_number
      )),
    entry.completed_game_count = 0 and entry.division_number < v_source_division_count,
    entry.division_rank = (
      select max(all_entry.division_rank)
      from public.stroke_final_scorecard_entries as all_entry
      where all_entry.scorecard_id = entry.scorecard_id
        and all_entry.division_number = entry.division_number
    )
  from public.stroke_final_scorecard_entries as entry
  join public.stroke_final_scorecard_player_decisions as decision
    on decision.final_scorecard_id = entry.scorecard_id and decision.player_id = entry.player_id
  where entry.scorecard_id = p_final_scorecard_id and decision.decision = 'returning';

  if exists (select 1 from pg_temp.stroke_transition_work
    where mandatory and source_division + 1 > p_target_division_count) then
    raise exception 'A mandatory relegation destination does not exist in the target division structure';
  end if;

  update pg_temp.stroke_transition_work set target_division = source_division + 1,
    movement_reason = case when zero_game and bottom_finish then 'Relegated — Zero Games + Bottom Finish'
      when zero_game then 'Relegated — Zero Games' else 'Relegated — Bottom Finish' end
  where mandatory;

  for v_division in 1..greatest(v_source_division_count - 1, 0) loop
    if v_division > p_target_division_count then continue; end if;
    select count(*)::integer into v_demand
    from public.stroke_final_scorecard_entries as entry
    join public.stroke_final_scorecard_player_decisions as decision
      on decision.final_scorecard_id = entry.scorecard_id and decision.player_id = entry.player_id
    where entry.scorecard_id = p_final_scorecard_id and entry.division_number = v_division
      and (decision.decision = 'not_returning' or exists (
        select 1 from pg_temp.stroke_transition_work as work
        where work.player_id = entry.player_id and work.mandatory
      ));
    select greatest(
      0,
      v_demand
        + count(*) filter (
            where source_division = v_division
              and target_division = v_division - 1
          )
        - count(*) filter (
            where source_division = v_division - 1
              and target_division = v_division
          )
    )::integer
    into v_demand
    from pg_temp.stroke_transition_work;

    for v_player in select * from pg_temp.stroke_transition_work
      where source_division = v_division + 1 and not mandatory and completed_games > 0
        and target_division is null order by source_rank limit v_demand
    loop
      update pg_temp.stroke_transition_work as work set target_division = v_division,
        movement_reason = 'Promoted' where work.player_id = v_player.player_id;
    end loop;
  end loop;

  if exists (select target_division from pg_temp.stroke_transition_work where target_division is not null
    group by target_division having count(*) > 4) then
    raise exception 'Mandatory movement exceeds a target division capacity';
  end if;

  for v_player in select * from pg_temp.stroke_transition_work where target_division is null
    order by source_division, source_rank
  loop
    v_target := null;
    foreach v_division in array array[v_player.source_division, v_player.source_division + 1, v_player.source_division - 1]
    loop
      if v_division between 1 and p_target_division_count and (
        select count(*) from pg_temp.stroke_transition_work where target_division = v_division
      ) < 4 then v_target := v_division; exit; end if;
    end loop;
    if v_target is null then
      raise exception 'Returning player % has no legal target slot within one division', v_player.player_screen_name;
    end if;
    update pg_temp.stroke_transition_work as work set target_division = v_target,
      movement_reason = case when v_target = v_player.source_division then 'Stayed' else 'Placement Adjustment' end
    where work.player_id = v_player.player_id;
  end loop;

  create temporary table if not exists pg_temp.stroke_transition_new_players (
    player_id uuid primary key, player_screen_name text not null, selection_order integer not null,
    target_division integer
  ) on commit drop;
  truncate pg_temp.stroke_transition_new_players;
  insert into pg_temp.stroke_transition_new_players (player_id, player_screen_name, selection_order)
  select player.id, player.screen_name, item.ordinality::integer
  from unnest(p_new_player_ids) with ordinality as item(player_id, ordinality)
  join public.players as player on player.id = item.player_id;

  for v_player in select * from pg_temp.stroke_transition_new_players order by selection_order loop
    v_target := null;
    if p_target_division_count > v_source_division_count then
      for v_division in v_source_division_count + 1..p_target_division_count loop
        if (select count(*) from pg_temp.stroke_transition_work where target_division = v_division)
          + (select count(*) from pg_temp.stroke_transition_new_players where target_division = v_division) < 4
        then v_target := v_division; exit; end if;
      end loop;
      if v_target is null then
        for v_division in reverse v_source_division_count..1 loop
          if (select count(*) from pg_temp.stroke_transition_work where target_division = v_division)
            + (select count(*) from pg_temp.stroke_transition_new_players where target_division = v_division) < 4
          then v_target := v_division; exit; end if;
        end loop;
      end if;
    else
      for v_division in reverse p_target_division_count..1 loop
        if (select count(*) from pg_temp.stroke_transition_work where target_division = v_division)
          + (select count(*) from pg_temp.stroke_transition_new_players where target_division = v_division) < 4
        then v_target := v_division; exit; end if;
      end loop;
    end if;
    if v_target is null then raise exception 'Selected new player % cannot be placed within target capacity', v_player.player_screen_name; end if;
    update pg_temp.stroke_transition_new_players as new_player
    set target_division = v_target
    where new_player.player_id = v_player.player_id;
  end loop;

  delete from public.stroke_division_roster_slots as roster_slot
  where roster_slot.roster_version_id = v_roster.id;
  insert into public.stroke_division_roster_slots (
    roster_version_id, division_number, slot_number, player_id, player_screen_name, slot_status
  ) select v_roster.id, division.division_number, slot.slot_number, null, null, 'empty'
  from generate_series(1, p_target_division_count) as division(division_number)
  cross join generate_series(1, 4) as slot(slot_number);

  for v_player in
    select work.player_id, work.player_screen_name, work.target_division,
      work.movement_reason, work.source_rank, 0 as selection_order
    from pg_temp.stroke_transition_work as work
    union all
    select new_player.player_id, new_player.player_screen_name,
      new_player.target_division, 'New Player', 1000000, new_player.selection_order
    from pg_temp.stroke_transition_new_players as new_player
    order by target_division, source_rank, selection_order
  loop
    select min(roster_slot.slot_number) into v_slot
    from public.stroke_division_roster_slots as roster_slot
    where roster_slot.roster_version_id = v_roster.id
      and roster_slot.division_number = v_player.target_division
      and roster_slot.player_id is null;
    if v_slot is null then raise exception 'Target division % exceeds four players', v_player.target_division; end if;
    update public.stroke_division_roster_slots as roster_slot set player_id = v_player.player_id,
      player_screen_name = v_player.player_screen_name, slot_status = 'active'
    where roster_slot.roster_version_id = v_roster.id
      and roster_slot.division_number = v_player.target_division
      and roster_slot.slot_number = v_slot;
  end loop;

  return query
  select v_roster.id, p_target_season_id, p_target_division_count,
    slot.division_number, slot.slot_number, slot.player_id, slot.player_screen_name,
    coalesce(work.movement_reason, case when new_player.player_id is not null then 'New Player' end)
  from public.stroke_division_roster_slots as slot
  left join pg_temp.stroke_transition_work as work on work.player_id = slot.player_id
  left join pg_temp.stroke_transition_new_players as new_player on new_player.player_id = slot.player_id
  where slot.roster_version_id = v_roster.id
  order by slot.division_number, slot.slot_number;
end;
$function$;

revoke all on function public.generate_stroke_next_season_proposal(uuid, uuid, integer, uuid[]) from public;
revoke all on function public.generate_stroke_next_season_proposal(uuid, uuid, integer, uuid[]) from anon;
revoke all on function public.generate_stroke_next_season_proposal(uuid, uuid, integer, uuid[]) from authenticated;
grant execute on function public.generate_stroke_next_season_proposal(uuid, uuid, integer, uuid[]) to authenticated;

do $legacy_roster_slot_revoke$
begin
  if to_regprocedure(
    'public.set_stroke_roster_slot(uuid,integer,integer,uuid)'
  ) is not null then
    execute
      'revoke execute on function public.set_stroke_roster_slot(uuid, integer, integer, uuid) from public, anon, authenticated';
  end if;
end;
$legacy_roster_slot_revoke$;

commit;

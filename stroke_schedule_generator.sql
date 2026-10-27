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

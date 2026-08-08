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

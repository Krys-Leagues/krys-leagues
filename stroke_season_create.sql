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

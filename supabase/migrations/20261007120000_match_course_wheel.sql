begin;

create table if not exists public.match_course_wheel_selections (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete restrict,
  division_number integer not null check (division_number > 0),
  game_number integer not null check (game_number between 1 and 3),
  required_difficulty text not null check (required_difficulty in ('Easy', 'Hard')),
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) = 3),
  selected_course_code text not null,
  selected_course_name text not null,
  selected_base_map text not null,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint match_course_wheel_selection_key unique (season_id, division_number, game_number)
);

alter table public.match_course_wheel_selections enable row level security;
revoke all on public.match_course_wheel_selections from anon, authenticated;

create or replace function public.protect_match_course_wheel_override()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if coalesce(current_setting('krys.match_course_wheel_write', true), '') = 'on' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if exists (
      select 1
      from public.match_course_wheel_selections as selection
      where selection.season_id = old.season_id
        and selection.division_number = old.division_number
    ) then
      raise exception 'A committed Match course wheel selection cannot be cleared or replaced';
    end if;
    return old;
  end if;

  if exists (
    select 1 from public.match_course_wheel_selections as selection
    where selection.season_id = new.season_id
      and selection.division_number = new.division_number
      and selection.game_number = 1
      and new.game1_course_override is distinct from selection.selected_course_name
  ) or exists (
    select 1 from public.match_course_wheel_selections as selection
    where selection.season_id = new.season_id
      and selection.division_number = new.division_number
      and selection.game_number = 2
      and new.game2_course_override is distinct from selection.selected_course_name
  ) or exists (
    select 1 from public.match_course_wheel_selections as selection
    where selection.season_id = new.season_id
      and selection.division_number = new.division_number
      and selection.game_number = 3
      and new.game3_course_override is distinct from selection.selected_course_name
  ) then
    raise exception 'A committed Match course wheel selection cannot be cleared or replaced';
  end if;

  return new;
end;
$function$;

drop trigger if exists protect_match_course_wheel_override_trigger on public.match_division_course_overrides;
create trigger protect_match_course_wheel_override_trigger
before insert or update or delete on public.match_division_course_overrides
for each row execute function public.protect_match_course_wheel_override();

create or replace function public.spin_match_course_wheel(
  p_season_id uuid,
  p_division_number integer,
  p_game_number integer
)
returns table(
  season_id uuid,
  division_number integer,
  game_number integer,
  required_difficulty text,
  options jsonb,
  selected_course_code text,
  selected_course_name text,
  selected_base_map text,
  reused boolean
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid;
  v_season public.seasons%rowtype;
  v_roster public.match_roster_versions%rowtype;
  v_state public.match_schedule_state%rowtype;
  v_existing public.match_course_wheel_selections%rowtype;
  v_required_difficulty text;
  v_options jsonb;
  v_selected jsonb;
  v_current_override text;
  v_course_name text;
  v_map_key text;
  v_blocked_maps text[] := array[]::text[];
  v_game_number integer;
begin
  v_user_id := auth.uid();

  if not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode = '42501';
  end if;

  if v_user_id is null then
    raise exception 'Authentication is required to use the Match course wheel' using errcode = '42501';
  end if;

  if p_season_id is null or p_division_number is null or p_division_number <= 0 then
    raise exception 'A valid Match season and division are required';
  end if;

  if p_game_number is null or p_game_number not between 1 and 3 then
    raise exception 'Match game number must be 1, 2, or 3';
  end if;

  v_required_difficulty := case when p_game_number = 2 then 'Hard' else 'Easy' end;

  select roster.* into v_roster
  from public.match_roster_versions as roster
  where roster.season_id = p_season_id
    and roster.status in ('draft', 'approved')
  order by case roster.status when 'draft' then 1 else 2 end, roster.created_at, roster.id
  limit 1
  for update;

  if not found then
    raise exception 'The Match roster is locked or does not exist';
  end if;

  select season.* into v_season
  from public.seasons as season
  where season.id = p_season_id
  for share;

  if not found or lower(btrim(v_season.league_type)) <> 'match' then
    raise exception 'The requested season is not a Match season';
  end if;

  if p_division_number > v_roster.division_count then
    raise exception 'Division % is outside this Match roster', p_division_number;
  end if;

  if v_roster.status = 'approved' then
    select state.* into v_state
    from public.match_schedule_state as state
    where state.season_id = p_season_id
    for update;

    if not found then
      raise exception 'The approved Match roster has no schedule workflow state';
    end if;
  end if;

  select selection.* into v_existing
  from public.match_course_wheel_selections as selection
  where selection.season_id = p_season_id
    and selection.division_number = p_division_number
    and selection.game_number = p_game_number
  for update;

  if found then
    return query select
      v_existing.season_id,
      v_existing.division_number,
      v_existing.game_number,
      v_existing.required_difficulty,
      v_existing.options,
      v_existing.selected_course_code,
      v_existing.selected_course_name,
      v_existing.selected_base_map,
      true;
    return;
  end if;

  v_current_override := case p_game_number
    when 1 then (select course_override.game1_course_override from public.match_division_course_overrides as course_override where course_override.season_id = p_season_id and course_override.division_number = p_division_number)
    when 2 then (select course_override.game2_course_override from public.match_division_course_overrides as course_override where course_override.season_id = p_season_id and course_override.division_number = p_division_number)
    else (select course_override.game3_course_override from public.match_division_course_overrides as course_override where course_override.season_id = p_season_id and course_override.division_number = p_division_number)
  end;

  if v_current_override is not null then
    raise exception 'This Match course is already assigned; the wheel will not replace it';
  end if;

  perform set_config('krys.match_course_wheel_write', 'on', true);

  -- The same underlying map is unavailable later in this division even when
  -- its other difficulty variant would otherwise be eligible.
  for v_game_number in 1..(p_game_number - 1) loop
    v_course_name := case v_game_number
      when 1 then coalesce((select course_override.game1_course_override from public.match_division_course_overrides as course_override where course_override.season_id = p_season_id and course_override.division_number = p_division_number), v_season.game1_course)
      when 2 then coalesce((select course_override.game2_course_override from public.match_division_course_overrides as course_override where course_override.season_id = p_season_id and course_override.division_number = p_division_number), v_season.game2_course)
      else coalesce((select course_override.game3_course_override from public.match_division_course_overrides as course_override where course_override.season_id = p_season_id and course_override.division_number = p_division_number), v_season.game3_course)
    end;

    select lower(btrim(course.base_map)) into v_map_key
    from public.all_time_courses as course
    where lower(btrim(course.display_name)) = lower(btrim(v_course_name))
       or lower(btrim(course.code)) = lower(btrim(v_course_name))
    order by case when lower(btrim(course.display_name)) = lower(btrim(v_course_name)) then 1 else 2 end
    limit 1;

    if v_map_key is not null then
      v_blocked_maps := array_append(v_blocked_maps, v_map_key);
    end if;
  end loop;

  select coalesce(jsonb_agg(to_jsonb(option_row) order by option_row.sort_order), '[]'::jsonb)
  into v_options
  from (
    select chosen.code, chosen.base_map, chosen.difficulty, chosen.display_name,
      row_number() over (order by random()) as sort_order
    from (
      select distinct on (lower(btrim(course.base_map)))
        course.code, course.base_map, course.difficulty, course.display_name
      from public.all_time_courses as course
      where course.active = true
        and course.difficulty = v_required_difficulty
        and (course.release_date is null or course.release_date <= current_date)
        and not (lower(btrim(course.base_map)) = any(v_blocked_maps))
      order by lower(btrim(course.base_map)), random()
    ) as chosen
  ) as option_row;

  if jsonb_array_length(v_options) <> 3 then
    raise exception 'At least three eligible % Match courses are required', v_required_difficulty;
  end if;

  v_selected := v_options -> 0;

  insert into public.match_course_wheel_selections (
    season_id, division_number, game_number, required_difficulty, options,
    selected_course_code, selected_course_name, selected_base_map, created_by
  )
  values (
    p_season_id, p_division_number, p_game_number, v_required_difficulty, v_options,
    v_selected ->> 'code', v_selected ->> 'display_name', v_selected ->> 'base_map', v_user_id
  );

  insert into public.match_division_course_overrides as existing (
    season_id, division_number, game1_course_override, game2_course_override, game3_course_override
  )
  values (
    p_season_id,
    p_division_number,
    case when p_game_number = 1 then v_selected ->> 'display_name' end,
    case when p_game_number = 2 then v_selected ->> 'display_name' end,
    case when p_game_number = 3 then v_selected ->> 'display_name' end
  )
  on conflict (season_id, division_number) do update set
    game1_course_override = case when p_game_number = 1 then excluded.game1_course_override else existing.game1_course_override end,
    game2_course_override = case when p_game_number = 2 then excluded.game2_course_override else existing.game2_course_override end,
    game3_course_override = case when p_game_number = 3 then excluded.game3_course_override else existing.game3_course_override end;

  if v_roster.status = 'approved' then
    update public.match_schedule_state
    set change_revision = change_revision + 1
    where season_id = p_season_id;
  end if;

  return query select
    p_season_id,
    p_division_number,
    p_game_number,
    v_required_difficulty,
    v_options,
    v_selected ->> 'code',
    v_selected ->> 'display_name',
    v_selected ->> 'base_map',
    false;
end;
$function$;

revoke all on function public.spin_match_course_wheel(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.spin_match_course_wheel(uuid, integer, integer) to authenticated;

commit;

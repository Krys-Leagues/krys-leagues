create or replace function public.save_match_result(
  p_schedule_id uuid,
  p_player1_hw integer,
  p_player2_hw integer
)
returns table(
  result_id uuid,
  schedule_id uuid,
  player1_hw integer,
  player2_hw integer,
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
      'Authentication is required to save a Match result'
      using errcode = '42501';
  end if;

  if p_schedule_id is null then
    raise exception 'Schedule fixture ID is required';
  end if;

  if p_player1_hw is null or p_player2_hw is null then
    raise exception 'Both Match HW values are required';
  end if;

  select scheduled_fixture.*
  into v_schedule
  from public.schedule as scheduled_fixture
  where scheduled_fixture.id = p_schedule_id
  for update;

  if not found then
    raise exception 'Schedule fixture % was not found', p_schedule_id;
  end if;

  if lower(btrim(v_schedule.league_type)) is distinct from 'match'
    or v_schedule.season_id is null
    or v_schedule.match_roster_version_id is null
    or v_schedule.division_number is null
    or v_schedule.division_number <= 0
    or v_schedule.game_number is null
    or v_schedule.game_number not between 1 and 3
    or v_schedule.player1_id is null
    or v_schedule.player2_id is null
    or v_schedule.player1_id = v_schedule.player2_id
  then
    raise exception
      'Schedule fixture % is not a valid managed Match fixture',
      p_schedule_id;
  end if;

  if exists (
    select 1 from public.match_roster_versions as roster
    where roster.id = v_schedule.match_roster_version_id
      and roster.season_id = v_schedule.season_id
      and roster.status = 'locked'
  ) or exists (
    select 1 from public.match_final_scorecards as scorecard
    where scorecard.season_id = v_schedule.season_id
      and scorecard.status = 'approved'
  ) then
    raise exception 'Results cannot be changed after Match Final Scorecard approval' using errcode = '42501';
  end if;

  perform 1
  from public.match_schedule_state as schedule_state
  where schedule_state.season_id = v_schedule.season_id
    and schedule_state.change_revision = schedule_state.generated_revision
    and schedule_state.generated_revision = schedule_state.reviewed_revision
    and schedule_state.generated_revision > 0
  for update;

  if not found then
    raise exception
      'Match results can be saved only after the current schedule has been generated and reviewed';
  end if;

  v_player1_name := coalesce(v_schedule.player1_name, v_schedule.player1);
  v_player2_name := coalesce(v_schedule.player2_name, v_schedule.player2);

  if v_player1_name is null or btrim(v_player1_name) = ''
    or v_player2_name is null or btrim(v_player2_name) = ''
  then
    raise exception
      'Managed Match fixture % is missing a player display snapshot',
      p_schedule_id;
  end if;

  if p_player1_hw > p_player2_hw then
    v_winner := v_player1_name;
    v_is_draw := false;
  elsif p_player2_hw > p_player1_hw then
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
    and lower(btrim(existing_result.league_type)) = 'match'
  for update;

  if found then
    update public.results as result_row
    set player1_hw = p_player1_hw,
        player2_hw = p_player2_hw,
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
      player1_hw,
      player2_hw,
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
      p_player1_hw,
      p_player2_hw,
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
    v_result.player1_hw,
    v_result.player2_hw,
    v_result.winner,
    v_result.is_draw,
    v_result_created;
end;
$function$;

revoke all on function public.save_match_result(uuid, integer, integer)
from public;

revoke all on function public.save_match_result(uuid, integer, integer)
from anon;

revoke all on function public.save_match_result(uuid, integer, integer)
from authenticated;

grant execute on function public.save_match_result(uuid, integer, integer)
to authenticated;

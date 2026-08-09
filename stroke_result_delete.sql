create or replace function public.delete_stroke_result(
  p_schedule_id uuid
)
returns table(
  result_id uuid,
  schedule_id uuid,
  season_id uuid,
  division_number integer,
  result_deleted boolean
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid;
  v_schedule public.schedule%rowtype;
  v_result public.results%rowtype;
begin
  v_user_id := auth.uid();

  if not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode = '42501';
  end if;

  if v_user_id is null then
    raise exception
      'Authentication is required to delete a Stroke result'
      using errcode = '42501';
  end if;

  if p_schedule_id is null then
    raise exception 'Schedule fixture ID is required';
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

  if exists (
    select 1
    from public.stroke_roster_versions as roster
    where roster.id = v_schedule.roster_version_id
      and roster.season_id = v_schedule.season_id
      and roster.status = 'locked'
  ) or exists (
    select 1
    from public.stroke_final_scorecards as scorecard
    where scorecard.season_id = v_schedule.season_id
      and scorecard.status = 'approved'
  ) then
    raise exception
      'Results cannot be deleted from a finalized Stroke season'
      using errcode = '42501';
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
      'Stroke results can be deleted only while the current schedule is generated and reviewed';
  end if;

  select existing_result.*
  into v_result
  from public.results as existing_result
  where existing_result.schedule_id = p_schedule_id
    and lower(btrim(existing_result.league_type)) = 'stroke'
  for update;

  if not found then
    return query
    select
      null::uuid,
      v_schedule.id,
      v_schedule.season_id,
      v_schedule.division_number,
      false;
    return;
  end if;

  delete from public.results as result_row
  where result_row.id = v_result.id;

  perform 1
  from public.rebuild_stroke_standings(
    v_schedule.season_id,
    v_schedule.division_number
  );

  return query
  select
    v_result.id,
    v_schedule.id,
    v_schedule.season_id,
    v_schedule.division_number,
    true;
end;
$function$;

revoke all on function public.delete_stroke_result(uuid)
from public;

revoke all on function public.delete_stroke_result(uuid)
from anon;

revoke all on function public.delete_stroke_result(uuid)
from authenticated;

grant execute on function public.delete_stroke_result(uuid)
to authenticated;

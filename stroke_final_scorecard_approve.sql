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
            (total.completed_game_count > 0) desc,
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

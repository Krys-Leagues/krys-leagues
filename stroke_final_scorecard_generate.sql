create or replace function public.populate_stroke_scorecard_player_screen_name()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_source_roster_version_id uuid;
  v_player_screen_name text;
begin
  select scorecard.source_roster_version_id
  into v_source_roster_version_id
  from public.stroke_final_scorecards as scorecard
  where scorecard.id = new.scorecard_id
    and scorecard.season_id = new.season_id;

  if not found then
    raise exception
      'Final Scorecard % was not found for season %',
      new.scorecard_id,
      new.season_id;
  end if;

  select roster_slot.player_screen_name
  into v_player_screen_name
  from public.stroke_division_roster_slots as roster_slot
  where roster_slot.roster_version_id = v_source_roster_version_id
    and roster_slot.division_number = new.division_number
    and roster_slot.player_id = new.player_id;

  if not found or v_player_screen_name is null or btrim(v_player_screen_name) = '' then
    raise exception
      'Player % is not a populated member of Stroke division % in the source roster',
      new.player_id,
      new.division_number;
  end if;

  new.player_screen_name := v_player_screen_name;
  return new;
end;
$function$;

drop trigger if exists stroke_scorecard_entries_populate_player_name
on public.stroke_final_scorecard_entries;

create trigger stroke_scorecard_entries_populate_player_name
before insert or update of scorecard_id, season_id, division_number, player_id, player_screen_name
on public.stroke_final_scorecard_entries
for each row
execute function public.populate_stroke_scorecard_player_screen_name();

revoke all on function public.populate_stroke_scorecard_player_screen_name()
from public;

revoke all on function public.populate_stroke_scorecard_player_screen_name()
from anon;

revoke all on function public.populate_stroke_scorecard_player_screen_name()
from authenticated;

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
          (total.completed_game_count > 0) desc,
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

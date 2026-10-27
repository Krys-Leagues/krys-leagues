begin;

create or replace function public.get_player_dashboard_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_player_id uuid;
  v_player_screen_name text;
  v_match jsonb;
  v_stroke jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication is required to load the player dashboard'
      using errcode = '42501';
  end if;

  v_player_id := public.current_user_canonical_player_id();

  if v_player_id is null then
    raise exception 'The authenticated account is not linked to one canonical player'
      using errcode = '42501';
  end if;

  select player.screen_name
  into v_player_screen_name
  from public.players as player
  where player.id = v_player_id;

  if v_player_screen_name is null then
    raise exception 'The authenticated player identity is unavailable'
      using errcode = '42501';
  end if;

  with current_season as (
    select season.id, season.season_number, season.due_date
    from public.seasons as season
    where lower(btrim(season.league_type)) = 'match'
      and season.division is null
      and exists (
        select 1
        from public.match_roster_versions as roster
        where roster.season_id = season.id
          and roster.status in ('approved', 'locked')
      )
    order by season.is_active desc, season.season_number desc
    limit 1
  ), current_roster as (
    select roster.id, roster.season_id, roster.division_count
    from public.match_roster_versions as roster
    join current_season as season on season.id = roster.season_id
    where roster.status in ('approved', 'locked')
    order by case roster.status when 'approved' then 0 else 1 end, roster.created_at desc
    limit 1
  ), player_slot as (
    select
      slot.player_id,
      slot.division_number,
      slot.slot_number::integer as starting_rank
    from current_roster as roster
    join public.match_division_roster_slots as slot
      on slot.roster_version_id = roster.id
     and slot.slot_status = 'active'
    where public.resolve_canonical_player_id(slot.player_id) = v_player_id
    limit 1
  ), division_state as (
    select coalesce(bool_or(
      coalesce(standing.wins, 0)
      + coalesce(standing.losses, 0)
      + coalesce(standing.ties, 0) > 0
    ), false) as results_started
    from current_season as season
    join current_roster as roster on roster.season_id = season.id
    join player_slot as caller_slot on true
    join public.match_division_roster_slots as division_slot
      on division_slot.roster_version_id = roster.id
     and division_slot.division_number = caller_slot.division_number
     and division_slot.slot_status = 'active'
    left join public.season_standings as standing
      on standing.player_id = division_slot.player_id
     and standing.season_number = season.season_number
     and lower(btrim(standing.league_type)) = 'match'
     and standing.division = 'Match D' || caller_slot.division_number::text
  ), caller_standing as (
    select standing.rank, standing.wins, standing.losses, standing.ties,
      standing.points, standing.strokes
    from current_season as season
    join player_slot as slot on true
    left join public.season_standings as standing
      on standing.player_id = slot.player_id
     and standing.season_number = season.season_number
     and lower(btrim(standing.league_type)) = 'match'
     and standing.division = 'Match D' || slot.division_number::text
  ), caller_fixtures as (
    select
      fixture.game_number,
      case
        when fixture.player1_id = slot.player_id
          then coalesce(opponent_two.screen_name, nullif(btrim(fixture.player2_name), ''))
        else coalesce(opponent_one.screen_name, nullif(btrim(fixture.player1_name), ''))
      end as opponent_screen_name,
      nullif(btrim(fixture.course), '') as course,
      fixture.due_date,
      result_row.player1_hw,
      result_row.player2_hw,
      fixture.player1_id = slot.player_id as caller_is_player_one,
      result_row.player1_hw is not null and result_row.player2_hw is not null as completed
    from current_season as season
    join current_roster as roster on roster.season_id = season.id
    join player_slot as slot on true
    join public.schedule as fixture
      on fixture.season_id = roster.season_id
     and fixture.match_roster_version_id = roster.id
     and lower(btrim(fixture.league_type)) = 'match'
     and (fixture.player1_id = slot.player_id or fixture.player2_id = slot.player_id)
    left join public.results as result_row
      on result_row.schedule_id = fixture.id
     and lower(btrim(result_row.league_type)) = 'match'
    left join public.players as opponent_one
      on opponent_one.id = public.resolve_canonical_player_id(fixture.player1_id)
    left join public.players as opponent_two
      on opponent_two.id = public.resolve_canonical_player_id(fixture.player2_id)
    where fixture.game_number is not null
  ), assignment_rows as (
    select
      fixture.game_number,
      fixture.opponent_screen_name,
      fixture.course,
      case when fixture.completed then 'completed' else 'remaining' end as status,
      fixture.completed,
      fixture.due_date
    from caller_fixtures as fixture
  ), result_rows as (
    select
      fixture.game_number,
      fixture.opponent_screen_name,
      fixture.course,
      case when fixture.caller_is_player_one then fixture.player1_hw else fixture.player2_hw end as player_holes_won,
      case when fixture.caller_is_player_one then fixture.player2_hw else fixture.player1_hw end as opponent_holes_won,
      case
        when (case when fixture.caller_is_player_one then fixture.player1_hw else fixture.player2_hw end)
           > (case when fixture.caller_is_player_one then fixture.player2_hw else fixture.player1_hw end) then 'win'
        when (case when fixture.caller_is_player_one then fixture.player1_hw else fixture.player2_hw end)
           < (case when fixture.caller_is_player_one then fixture.player2_hw else fixture.player1_hw end) then 'loss'
        else 'draw'
      end as outcome
    from caller_fixtures as fixture
    where fixture.completed
  )
  select coalesce(
    (
      select jsonb_build_object(
        'rostered', true,
        'season_number', season.season_number,
        'season_due_date', season.due_date,
        'division_number', slot.division_number,
        'starting_rank', slot.starting_rank,
        'current_rank', case when state.results_started then standing.rank else null end,
        'displayed_rank', coalesce(case when state.results_started then standing.rank else null end, slot.starting_rank),
        'results_started', state.results_started,
        'played', coalesce(standing.wins, 0) + coalesce(standing.losses, 0) + coalesce(standing.ties, 0),
        'wins', coalesce(standing.wins, 0),
        'losses', coalesce(standing.losses, 0),
        'draws', coalesce(standing.ties, 0),
        'points', coalesce(standing.points, 0),
        'holes_won', coalesce(standing.strokes, 0),
        'remaining_count', (select count(*) from assignment_rows as assignment where not assignment.completed),
        'assignments', (select coalesce(jsonb_agg(to_jsonb(assignment) order by assignment.game_number, assignment.opponent_screen_name), '[]'::jsonb) from assignment_rows as assignment),
        'results', (select coalesce(jsonb_agg(to_jsonb(result) order by result.game_number, result.opponent_screen_name), '[]'::jsonb) from result_rows as result)
      )
      from current_season as season
      join player_slot as slot on true
      cross join division_state as state
      left join caller_standing as standing on true
    ),
    jsonb_build_object(
      'rostered', false,
      'season_number', (select season.season_number from current_season as season),
      'season_due_date', (select season.due_date from current_season as season),
      'division_number', null,
      'starting_rank', null,
      'current_rank', null,
      'displayed_rank', null,
      'results_started', false,
      'played', 0,
      'wins', 0,
      'losses', 0,
      'draws', 0,
      'points', 0,
      'holes_won', 0,
      'remaining_count', 0,
      'assignments', '[]'::jsonb,
      'results', '[]'::jsonb
    )
  ) into v_match;

  with current_season as (
    select season.id, season.season_number, season.due_date
    from public.seasons as season
    where lower(btrim(season.league_type)) = 'stroke'
      and season.division is null
      and exists (
        select 1
        from public.stroke_roster_versions as roster
        where roster.season_id = season.id
          and roster.status = 'approved'
      )
    order by season.is_active desc, season.season_number desc
    limit 1
  ), current_roster as (
    select roster.id, roster.season_id, roster.division_count
    from public.stroke_roster_versions as roster
    join current_season as season on season.id = roster.season_id
    where roster.status = 'approved'
    order by roster.created_at desc, roster.id
    limit 1
  ), player_slot as (
    select
      slot.player_id,
      slot.division_number,
      slot.slot_number::integer as starting_rank
    from current_roster as roster
    join public.stroke_division_roster_slots as slot
      on slot.roster_version_id = roster.id
     and slot.player_id is not null
    where public.resolve_canonical_player_id(slot.player_id) = v_player_id
    limit 1
  ), caller_standing as (
    select standing.rank, standing.wins, standing.losses, standing.ties,
      standing.points, standing.strokes
    from current_season as season
    join player_slot as slot on true
    left join public.season_standings as standing
      on standing.player_id = slot.player_id
     and standing.season_number = season.season_number
     and lower(btrim(standing.league_type)) = 'stroke'
     and standing.division = 'Stroke D' || slot.division_number::text
  ), caller_fixtures as (
    select
      fixture.game_number,
      case
        when fixture.player1_id = slot.player_id
          then coalesce(opponent_two.screen_name, nullif(btrim(fixture.player2_name), ''))
        else coalesce(opponent_one.screen_name, nullif(btrim(fixture.player1_name), ''))
      end as opponent_screen_name,
      nullif(btrim(fixture.course), '') as course,
      season.due_date,
      result_row.player1_score,
      result_row.player2_score,
      fixture.player1_id = slot.player_id as caller_is_player_one,
      result_row.player1_score is not null and result_row.player2_score is not null as completed
    from current_season as season
    join current_roster as roster on roster.season_id = season.id
    join player_slot as slot on true
    join public.schedule as fixture
      on fixture.season_id = roster.season_id
     and fixture.roster_version_id = roster.id
     and lower(btrim(fixture.league_type)) = 'stroke'
     and (fixture.player1_id = slot.player_id or fixture.player2_id = slot.player_id)
    left join public.results as result_row
      on result_row.schedule_id = fixture.id
     and lower(btrim(result_row.league_type)) = 'stroke'
    left join public.players as opponent_one
      on opponent_one.id = public.resolve_canonical_player_id(fixture.player1_id)
    left join public.players as opponent_two
      on opponent_two.id = public.resolve_canonical_player_id(fixture.player2_id)
    where fixture.game_number is not null
  ), assignment_rows as (
    select
      fixture.game_number,
      fixture.opponent_screen_name,
      fixture.course,
      case when fixture.completed then 'completed' else 'remaining' end as status,
      fixture.completed,
      fixture.due_date
    from caller_fixtures as fixture
  ), result_rows as (
    select
      fixture.game_number,
      fixture.opponent_screen_name,
      fixture.course,
      case when fixture.caller_is_player_one then fixture.player1_score else fixture.player2_score end as player_score,
      case when fixture.caller_is_player_one then fixture.player2_score else fixture.player1_score end as opponent_score,
      case
        when (case when fixture.caller_is_player_one then fixture.player1_score else fixture.player2_score end)
           < (case when fixture.caller_is_player_one then fixture.player2_score else fixture.player1_score end) then 'win'
        when (case when fixture.caller_is_player_one then fixture.player1_score else fixture.player2_score end)
           > (case when fixture.caller_is_player_one then fixture.player2_score else fixture.player1_score end) then 'loss'
        else 'draw'
      end as outcome
    from caller_fixtures as fixture
    where fixture.completed
  )
  select coalesce(
    (
      select jsonb_build_object(
        'rostered', true,
        'season_number', season.season_number,
        'season_due_date', season.due_date,
        'division_number', slot.division_number,
        'starting_rank', slot.starting_rank,
        'current_rank', standing.rank,
        'displayed_rank', coalesce(standing.rank, slot.starting_rank),
        'played', coalesce(standing.wins, 0) + coalesce(standing.losses, 0) + coalesce(standing.ties, 0),
        'wins', coalesce(standing.wins, 0),
        'losses', coalesce(standing.losses, 0),
        'draws', coalesce(standing.ties, 0),
        'points', coalesce(standing.points, 0),
        'strokes', coalesce(standing.strokes, 0),
        'remaining_count', (select count(*) from assignment_rows as assignment where not assignment.completed),
        'assignments', (select coalesce(jsonb_agg(to_jsonb(assignment) order by assignment.game_number, assignment.opponent_screen_name), '[]'::jsonb) from assignment_rows as assignment),
        'results', (select coalesce(jsonb_agg(to_jsonb(result) order by result.game_number, result.opponent_screen_name), '[]'::jsonb) from result_rows as result)
      )
      from current_season as season
      join player_slot as slot on true
      left join caller_standing as standing on true
    ),
    jsonb_build_object(
      'rostered', false,
      'season_number', (select season.season_number from current_season as season),
      'season_due_date', (select season.due_date from current_season as season),
      'division_number', null,
      'starting_rank', null,
      'current_rank', null,
      'displayed_rank', null,
      'played', 0,
      'wins', 0,
      'losses', 0,
      'draws', 0,
      'points', 0,
      'strokes', 0,
      'remaining_count', 0,
      'assignments', '[]'::jsonb,
      'results', '[]'::jsonb
    )
  ) into v_stroke;

  return jsonb_build_object(
    'player', jsonb_build_object('screen_name', v_player_screen_name),
    'leagues', jsonb_build_object('match', v_match, 'stroke', v_stroke)
  );
end;
$function$;

revoke all on function public.get_player_dashboard_v1() from public;
revoke all on function public.get_player_dashboard_v1() from anon;
revoke all on function public.get_player_dashboard_v1() from authenticated;
grant execute on function public.get_player_dashboard_v1() to authenticated;

commit;

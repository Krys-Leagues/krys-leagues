begin;

create or replace function public.get_public_pyp_player_history(
  p_player_id uuid
)
returns table(
  season_number integer,
  season_id uuid,
  player_screen_name text,
  division_number integer,
  division_rank integer,
  completed_game_count integer,
  wins integer,
  losses integer,
  ties integer,
  points integer,
  holes_won integer
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if p_player_id is null then
    raise exception 'Player ID is required';
  end if;

  return query
  select
    season.season_number,
    season.id,
    entry.player_screen_name,
    entry.division_number,
    entry.division_rank,
    entry.completed_game_count,
    entry.wins,
    entry.losses,
    entry.ties,
    entry.points,
    entry.holes_won
  from public.pyp_final_scorecard_entries as entry
  join public.pyp_final_scorecards as scorecard
    on scorecard.id = entry.scorecard_id
    and scorecard.season_id = entry.season_id
  join public.seasons as season
    on season.id = scorecard.season_id
  where public.resolve_canonical_player_id(entry.player_id)
      = public.resolve_canonical_player_id(p_player_id)
    and scorecard.status = 'approved'
    and lower(btrim(season.league_type)) is not distinct from 'pyp'
  order by season.season_number desc;
end;
$function$;

revoke all on function public.get_public_pyp_player_history(uuid) from public;
revoke all on function public.get_public_pyp_player_history(uuid) from anon;
revoke all on function public.get_public_pyp_player_history(uuid) from authenticated;
grant execute on function public.get_public_pyp_player_history(uuid) to anon;
grant execute on function public.get_public_pyp_player_history(uuid) to authenticated;

create or replace function public.list_public_pyp_final_scorecard_seasons()
returns table(
  season_id uuid,
  season_number integer,
  division_count integer
)
language sql
stable
security definer
set search_path to ''
as $function$
  select
    season.id,
    season.season_number,
    roster.division_count
  from public.pyp_final_scorecards as scorecard
  join public.seasons as season
    on season.id = scorecard.season_id
  join public.pyp_roster_versions as roster
    on roster.id = scorecard.source_roster_version_id
    and roster.season_id = scorecard.season_id
  where scorecard.status = 'approved'
    and roster.status = 'locked'
    and lower(btrim(season.league_type)) is not distinct from 'pyp'
  order by season.season_number desc;
$function$;

revoke all on function public.list_public_pyp_final_scorecard_seasons() from public;
revoke all on function public.list_public_pyp_final_scorecard_seasons() from anon;
revoke all on function public.list_public_pyp_final_scorecard_seasons() from authenticated;
grant execute on function public.list_public_pyp_final_scorecard_seasons() to anon;
grant execute on function public.list_public_pyp_final_scorecard_seasons() to authenticated;

create or replace function public.get_public_pyp_final_scorecard(
  p_season_id uuid
)
returns table(
  season_id uuid,
  season_number integer,
  division_number integer,
  division_rank integer,
  player_id uuid,
  player_screen_name text,
  completed_game_count integer,
  wins integer,
  losses integer,
  ties integer,
  points integer,
  holes_won integer
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if p_season_id is null then
    raise exception 'Season ID is required';
  end if;

  return query
  select
    season.id,
    season.season_number,
    entry.division_number,
    entry.division_rank,
    entry.player_id,
    entry.player_screen_name,
    entry.completed_game_count,
    entry.wins,
    entry.losses,
    entry.ties,
    entry.points,
    entry.holes_won
  from public.pyp_final_scorecards as scorecard
  join public.pyp_final_scorecard_entries as entry
    on entry.scorecard_id = scorecard.id
    and entry.season_id = scorecard.season_id
  join public.seasons as season
    on season.id = scorecard.season_id
  where scorecard.season_id = p_season_id
    and scorecard.status = 'approved'
    and lower(btrim(season.league_type)) is not distinct from 'pyp'
  order by entry.division_number, entry.division_rank;
end;
$function$;

revoke all on function public.get_public_pyp_final_scorecard(uuid) from public;
revoke all on function public.get_public_pyp_final_scorecard(uuid) from anon;
revoke all on function public.get_public_pyp_final_scorecard(uuid) from authenticated;
grant execute on function public.get_public_pyp_final_scorecard(uuid) to anon;
grant execute on function public.get_public_pyp_final_scorecard(uuid) to authenticated;

create or replace function public.get_public_pyp_player_fixture_history(
  p_player_id uuid
)
returns table(
  season_number integer,
  season_id uuid,
  division_number integer,
  game_number integer,
  player_screen_name text,
  opponent_screen_name text,
  player_role text,
  course1_name text,
  course1_difficulty text,
  course1_player_hw integer,
  course1_opponent_hw integer,
  course2_name text,
  course2_difficulty text,
  course2_player_hw integer,
  course2_opponent_hw integer,
  player_total_hw integer,
  opponent_total_hw integer,
  outcome text
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if p_player_id is null then
    raise exception 'Player ID is required';
  end if;

  return query
  select
    season.season_number,
    season.id,
    detail.division_number,
    detail.game_number,
    entry.player_screen_name,
    detail.opponent_screen_name,
    detail.player_role,
    detail.course1_name,
    detail.course1_difficulty,
    detail.course1_player_hw,
    detail.course1_opponent_hw,
    detail.course2_name,
    detail.course2_difficulty,
    detail.course2_player_hw,
    detail.course2_opponent_hw,
    detail.player_total_hw,
    detail.opponent_total_hw,
    detail.outcome
  from public.pyp_final_scorecard_fixture_details as detail
  join public.pyp_final_scorecards as scorecard
    on scorecard.id = detail.scorecard_id
    and scorecard.season_id = detail.season_id
  join public.pyp_final_scorecard_entries as entry
    on entry.scorecard_id = detail.scorecard_id
    and entry.season_id = detail.season_id
    and entry.player_id = detail.player_id
  join public.seasons as season
    on season.id = scorecard.season_id
  where public.resolve_canonical_player_id(detail.player_id)
      = public.resolve_canonical_player_id(p_player_id)
    and scorecard.status = 'approved'
    and lower(btrim(season.league_type)) is not distinct from 'pyp'
  order by season.season_number desc, detail.game_number;
end;
$function$;

revoke all on function public.get_public_pyp_player_fixture_history(uuid) from public;
revoke all on function public.get_public_pyp_player_fixture_history(uuid) from anon;
revoke all on function public.get_public_pyp_player_fixture_history(uuid) from authenticated;
grant execute on function public.get_public_pyp_player_fixture_history(uuid) to anon;
grant execute on function public.get_public_pyp_player_fixture_history(uuid) to authenticated;

commit;

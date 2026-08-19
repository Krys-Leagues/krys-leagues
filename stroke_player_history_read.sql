begin;

create or replace function public.get_public_stroke_player_history(
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
  strokes integer
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
  with managed_history as (
    select
      season.season_number,
      season.id as season_id,
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
    join public.stroke_final_scorecards as scorecard
      on scorecard.id = entry.scorecard_id
      and scorecard.season_id = entry.season_id
    join public.seasons as season
      on season.id = scorecard.season_id
    where public.resolve_canonical_player_id(entry.player_id)
        = public.resolve_canonical_player_id(p_player_id)
      and scorecard.status = 'approved'
      and lower(btrim(season.league_type)) is not distinct from 'stroke'

  ), historical_history as (
    select
      historical_import.season_number,
      historical_import.id as season_id,
      standing.historical_display_name as player_screen_name,
      standing.division_number,
      coalesce(standing.source_display_position, standing.source_position) as division_rank,
      standing.played as completed_game_count,
      standing.wins,
      standing.losses,
      standing.draws as ties,
      standing.points,
      standing.strokes
    from public.historical_stroke_standings as standing
    join public.historical_stroke_imports as historical_import
      on historical_import.id = standing.historical_stroke_import_id
    where standing.player_id is not null
      and public.resolve_canonical_player_id(standing.player_id)
        = public.resolve_canonical_player_id(p_player_id)
  )
  select
    history.season_number,
    history.season_id,
    history.player_screen_name,
    history.division_number,
    history.division_rank,
    history.completed_game_count,
    history.wins,
    history.losses,
    history.ties,
    history.points,
    history.strokes
  from managed_history as history

  union all

  select
    history.season_number,
    history.season_id,
    history.player_screen_name,
    history.division_number,
    history.division_rank,
    history.completed_game_count,
    history.wins,
    history.losses,
    history.ties,
    history.points,
    history.strokes
  from historical_history as history
  where not exists (
    select 1
    from managed_history as managed
    where managed.season_number = history.season_number
  )
  order by 1 desc, 2;
end;
$function$;

revoke all on function public.get_public_stroke_player_history(uuid)
from public;

revoke all on function public.get_public_stroke_player_history(uuid)
from anon;

revoke all on function public.get_public_stroke_player_history(uuid)
from authenticated;

grant execute on function public.get_public_stroke_player_history(uuid)
to anon;

grant execute on function public.get_public_stroke_player_history(uuid)
to authenticated;

commit;

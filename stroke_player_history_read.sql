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
  order by season.season_number desc;
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

-- Chunk 2R repair: preserve the public Doubles historical reader contract
-- without reopening the RLS-protected historical base tables.

create or replace function public.get_doubles_historical_public_results()
returns table (
  season_number integer,
  division text,
  season_team_id uuid,
  global_team_id uuid,
  team_name text,
  player_1_id uuid,
  player_2_id uuid,
  player_1_name text,
  player_2_name text,
  player_2_state text,
  game_number integer,
  result_state text,
  opponent_evidence text,
  opponent_team_name text,
  team_score integer,
  opponent_score integer,
  team_holes_won integer,
  opponent_holes_won integer,
  team_points integer,
  opponent_points integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    season_team.season_number,
    season_team.division,
    season_team.id as season_team_id,
    global_team.id as global_team_id,
    season_team.historical_team_name as team_name,
    public.resolve_canonical_player_id(global_team.player_1_id) as player_1_id,
    public.resolve_canonical_player_id(global_team.player_2_id) as player_2_id,
    player_1.screen_name as player_1_name,
    player_2.screen_name as player_2_name,
    global_team.player_2_state,
    game.game_number,
    game.result_state,
    game.opponent_evidence,
    coalesce(opponent_season_team.historical_team_name, game.opponent_historical_team_name) as opponent_team_name,
    game.team_score,
    game.opponent_score,
    game.team_holes_won,
    game.opponent_holes_won,
    game.team_points,
    game.opponent_points
  from public.doubles_historical_games as game
  join public.doubles_season_teams as season_team
    on season_team.id = game.season_team_id
  join public.doubles_global_teams as global_team
    on global_team.id = season_team.global_team_id
  join public.players as player_1
    on player_1.id = public.resolve_canonical_player_id(global_team.player_1_id)
  left join public.players as player_2
    on player_2.id = public.resolve_canonical_player_id(global_team.player_2_id)
  left join public.doubles_season_teams as opponent_season_team
    on opponent_season_team.id = game.opponent_season_team_id;
$$;

create or replace function public.get_doubles_historical_public_standings()
returns table (
  season_number integer,
  division text,
  season_team_id uuid,
  global_team_id uuid,
  team_name text,
  player_1_id uuid,
  player_2_id uuid,
  player_1_name text,
  player_2_name text,
  player_2_state text,
  played integer,
  wins integer,
  draws integer,
  losses integer,
  points bigint,
  holes_won bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with game_aggregate as (
    select
      public_results.season_team_id,
      count(*) filter (where public_results.result_state = 'PLAYED'::text)::integer as played,
      count(*) filter (
        where public_results.result_state = 'PLAYED'::text
          and public_results.team_points > public_results.opponent_points
      )::integer as wins,
      count(*) filter (
        where public_results.result_state = 'PLAYED'::text
          and public_results.team_points = public_results.opponent_points
          and public_results.team_points is not null
      )::integer as draws,
      count(*) filter (
        where public_results.result_state = 'PLAYED'::text
          and public_results.team_points < public_results.opponent_points
      )::integer as losses,
      case
        when count(public_results.team_points) > 0 then sum(public_results.team_points)
        else null::bigint
      end as points,
      case
        when count(public_results.team_holes_won) > 0 then sum(public_results.team_holes_won)
        else null::bigint
      end as holes_won
    from public.get_doubles_historical_public_results() as public_results
    group by public_results.season_team_id
  )
  select
    season_team.season_number,
    season_team.division,
    season_team.id as season_team_id,
    global_team.id as global_team_id,
    season_team.historical_team_name as team_name,
    public.resolve_canonical_player_id(global_team.player_1_id) as player_1_id,
    public.resolve_canonical_player_id(global_team.player_2_id) as player_2_id,
    player_1.screen_name as player_1_name,
    player_2.screen_name as player_2_name,
    global_team.player_2_state,
    case when explicit_standing.id is not null then explicit_standing.played else game_aggregate.played end as played,
    case when explicit_standing.id is not null then explicit_standing.wins else game_aggregate.wins end as wins,
    case when explicit_standing.id is not null then explicit_standing.draws else game_aggregate.draws end as draws,
    case when explicit_standing.id is not null then explicit_standing.losses else game_aggregate.losses end as losses,
    case when explicit_standing.id is not null then explicit_standing.points::bigint else game_aggregate.points end as points,
    case when explicit_standing.id is not null then explicit_standing.holes_won::bigint else game_aggregate.holes_won end as holes_won
  from public.doubles_season_teams as season_team
  join public.doubles_global_teams as global_team
    on global_team.id = season_team.global_team_id
  join public.players as player_1
    on player_1.id = public.resolve_canonical_player_id(global_team.player_1_id)
  left join public.players as player_2
    on player_2.id = public.resolve_canonical_player_id(global_team.player_2_id)
  left join public.doubles_historical_standings as explicit_standing
    on explicit_standing.season_team_id = season_team.id
  left join game_aggregate
    on game_aggregate.season_team_id = season_team.id
  where explicit_standing.id is not null or game_aggregate.season_team_id is not null;
$$;

revoke all on function public.get_doubles_historical_public_results() from public, anon, authenticated;
revoke all on function public.get_doubles_historical_public_standings() from public, anon, authenticated;
grant execute on function public.get_doubles_historical_public_results() to anon, authenticated, service_role;
grant execute on function public.get_doubles_historical_public_standings() to anon, authenticated, service_role;

create or replace view public.doubles_historical_public_results as
select
  season_number,
  division,
  season_team_id,
  global_team_id,
  team_name,
  player_1_id,
  player_2_id,
  player_1_name,
  player_2_name,
  player_2_state,
  game_number,
  result_state,
  opponent_evidence,
  opponent_team_name,
  team_score,
  opponent_score,
  team_holes_won,
  opponent_holes_won,
  team_points,
  opponent_points
from public.get_doubles_historical_public_results();

create or replace view public.doubles_historical_public_standings as
select
  season_number,
  division,
  season_team_id,
  global_team_id,
  team_name,
  player_1_id,
  player_2_id,
  player_1_name,
  player_2_name,
  player_2_state,
  played,
  wins,
  draws,
  losses,
  points,
  holes_won
from public.get_doubles_historical_public_standings();

alter view public.doubles_historical_public_results set (security_invoker = true);
alter view public.doubles_historical_public_standings set (security_invoker = true);

revoke all on public.doubles_historical_public_results from public;
revoke all on public.doubles_historical_public_standings from public;
grant select on public.doubles_historical_public_results to anon, authenticated, service_role;
grant select on public.doubles_historical_public_standings to anon, authenticated, service_role;

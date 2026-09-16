begin;

create or replace function public.get_public_match_play()
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
with current_season as (
  select season.id, season.season_number
  from public.seasons as season
  where lower(btrim(season.league_type)) = 'match'
    and season.division is null
    and exists (
      select 1 from public.match_roster_versions as roster
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
), current_rows as (
  select
    season.season_number,
    slot.division_number,
    standing.rank,
    slot.slot_number::integer as starting_rank,
    slot.player_screen_name,
    coalesce(standing.wins, 0)::integer as wins,
    coalesce(standing.losses, 0)::integer as losses,
    coalesce(standing.ties, 0)::integer as draws,
    (coalesce(standing.wins, 0) + coalesce(standing.losses, 0) + coalesce(standing.ties, 0))::integer as played,
    coalesce(standing.points, 0)::integer as points,
    coalesce(standing.strokes, 0)::integer as holes_won
  from current_season as season
  join current_roster as roster on roster.season_id = season.id
  join public.match_division_roster_slots as slot
    on slot.roster_version_id = roster.id and slot.slot_status = 'active'
  left join public.season_standings as standing
    on standing.player_id = slot.player_id
   and standing.season_number = season.season_number
   and lower(btrim(standing.league_type)) = 'match'
   and standing.division = 'Match D' || slot.division_number::text
), current_matchups as (
  select
    season.season_number,
    fixture.division_number,
    fixture.game_number,
    nullif(btrim(fixture.player1_name), '') as player1_display_name,
    nullif(btrim(fixture.player2_name), '') as player2_display_name,
    nullif(btrim(fixture.course), '') as course
  from current_season as season
  join current_roster as roster on roster.season_id = season.id
  join public.schedule as fixture
    on fixture.season_id = roster.season_id
   and fixture.match_roster_version_id = roster.id
  where lower(btrim(fixture.league_type)) = 'match'
    and fixture.game_number is not null
), historical_seasons as (
  select id, season_number, historical_label, historical_year, evidence_level
  from public.historical_match_imports
), historical_rows as (
  select standing.id, source.season_number, standing.division_number,
    standing.source_final_rank, standing.historical_display_name,
    standing.played, standing.wins, standing.losses, standing.draws,
    standing.points, standing.holes_won
  from public.historical_match_standings as standing
  join historical_seasons as source on source.id = standing.historical_match_import_id
), historical_matchups as (
  select
    source.season_number,
    fixture.division_number,
    fixture.course_order as game_number,
    player1.historical_display_name as player1_historical_display_name,
    player2.historical_display_name as player2_historical_display_name,
    fixture.historical_course_name
  from public.historical_match_fixtures as fixture
  join historical_seasons as source
    on source.id = fixture.historical_match_import_id
  join public.historical_match_standings as player1
    on player1.id = fixture.player1_standing_id
   and player1.historical_match_import_id = fixture.historical_match_import_id
   and player1.division_number = fixture.division_number
  join public.historical_match_standings as player2
    on player2.id = fixture.player2_standing_id
   and player2.historical_match_import_id = fixture.historical_match_import_id
   and player2.division_number = fixture.division_number
)
select jsonb_build_object(
  'current', jsonb_build_object(
    'season_number', (select season_number from current_season),
    'division_count', (select division_count from current_roster),
    'standings', (select coalesce(jsonb_agg(to_jsonb(row) order by row.division_number, coalesce(row.rank, row.starting_rank)), '[]'::jsonb) from current_rows as row),
    'schedule', (select coalesce(jsonb_agg(to_jsonb(matchup) order by matchup.division_number, matchup.game_number), '[]'::jsonb) from current_matchups as matchup)
  ),
  'historical_seasons', (select coalesce(jsonb_agg(to_jsonb(season) - 'id' order by season.season_number desc), '[]'::jsonb) from historical_seasons as season),
  'historical_standings', (select coalesce(jsonb_agg(to_jsonb(row) - 'id' order by row.season_number desc, row.division_number, row.source_final_rank), '[]'::jsonb) from historical_rows as row),
  'historical_matchups', (select coalesce(jsonb_agg(to_jsonb(matchup) order by matchup.season_number desc, matchup.division_number, matchup.game_number), '[]'::jsonb) from historical_matchups as matchup)
);
$function$;

revoke all on function public.get_public_match_play() from public;
revoke all on function public.get_public_match_play() from anon;
revoke all on function public.get_public_match_play() from authenticated;
grant execute on function public.get_public_match_play() to anon;
grant execute on function public.get_public_match_play() to authenticated;

commit;

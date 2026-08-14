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
  join public.season_standings as standing
    on standing.player_id = slot.player_id
   and standing.season_number = season.season_number
   and lower(btrim(standing.league_type)) = 'match'
   and standing.division = 'Match D' || slot.division_number::text
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
), historical_courses as (
  select source.season_number, standing.division_number, standing.source_final_rank,
    appearance.course_order, appearance.historical_course_name,
    appearance.played, appearance.outcome, appearance.holes_won
  from public.historical_match_course_appearances as appearance
  join public.historical_match_standings as standing on standing.id = appearance.historical_match_standing_id
  join historical_seasons as source on source.id = standing.historical_match_import_id
)
select jsonb_build_object(
  'current', jsonb_build_object(
    'season_number', (select season_number from current_season),
    'division_count', (select division_count from current_roster),
    'standings', (select coalesce(jsonb_agg(to_jsonb(row) order by row.division_number, row.rank), '[]'::jsonb) from current_rows as row)
  ),
  'historical_seasons', (select coalesce(jsonb_agg(to_jsonb(season) - 'id' order by season.season_number desc), '[]'::jsonb) from historical_seasons as season),
  'historical_standings', (select coalesce(jsonb_agg(to_jsonb(row) - 'id' order by row.season_number desc, row.division_number, row.source_final_rank), '[]'::jsonb) from historical_rows as row),
  'historical_courses', (select coalesce(jsonb_agg(to_jsonb(course) order by course.season_number desc, course.division_number, course.source_final_rank, course.course_order), '[]'::jsonb) from historical_courses as course)
);
$function$;

revoke all on function public.get_public_match_play() from public;
revoke all on function public.get_public_match_play() from anon;
revoke all on function public.get_public_match_play() from authenticated;
grant execute on function public.get_public_match_play() to anon;
grant execute on function public.get_public_match_play() to authenticated;

commit;

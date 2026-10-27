-- READ-ONLY PREFLIGHT. No DDL, DML, function calls, or migration execution.

select version, name
from supabase_migrations.schema_migrations
where name ilike '%doubles%'
order by version;

with required(name) as (
  values
    ('doubles_season_member_replacements'),
    ('doubles_season_lifecycle'),
    ('doubles_final_snapshots'),
    ('doubles_board_mappings'),
    ('doubles_board_outbox'),
    ('doubles_final_scorecards'),
    ('doubles_managed_season_teams'),
    ('doubles_managed_fixtures'),
    ('doubles_managed_results'),
    ('doubles_managed_standings')
)
select name, (to_regclass('public.' || name) is not null) as present
from required
order by name;

select p.proname, pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'generate_doubles_final_scorecard',
    'approve_doubles_final_scorecard',
    'finalize_doubles_season',
    'create_doubles_managed_season_team',
    'create_doubles_managed_fixture',
    'save_doubles_managed_result',
    'rebuild_doubles_managed_standings'
  )
order by p.proname;

select
  (select count(*) from public.doubles_global_teams) as global_teams,
  (select count(*) from public.doubles_managed_season_teams) as managed_season_teams,
  (select count(*) from public.doubles_season_team_members) as season_members,
  (select count(*) from public.doubles_managed_fixtures) as managed_fixtures,
  (select count(*) from public.doubles_managed_results) as managed_results,
  (select count(*) from public.doubles_managed_standings) as managed_standings;

select id, league_type, season_number, start_date, end_date, is_active, is_locked
from public.seasons
where lower(btrim(league_type)) = 'doubles'
order by season_number desc;

select tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public'
  and tablename in (
    'doubles_season_member_replacements',
    'doubles_season_lifecycle',
    'doubles_final_snapshots',
    'doubles_board_mappings',
    'doubles_board_outbox',
    'doubles_final_scorecards',
    'doubles_managed_season_teams',
    'doubles_managed_fixtures',
    'doubles_managed_results',
    'doubles_managed_standings'
  )
order by tablename, policyname;

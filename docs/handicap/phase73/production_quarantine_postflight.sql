-- SELECT-ONLY Phase 73 postflight. Run only after a separately authorized
-- schema installation. This file performs no writes.

select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'handicap_calculation_runs'
  and column_name = 'publication_eligibility';

select conrelid::regclass::text as table_name,
       conname,
       pg_get_constraintdef(oid) as definition,
       convalidated
from pg_constraint
where conname in (
  'handicap_calculation_runs_publication_eligibility_check',
  'handicap_rating_snapshots_publication_status_check',
  'handicap_index_snapshots_publication_status_check'
)
order by table_name, conname;

select c.relname as object_name,
       c.relkind,
       c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as force_rls,
       pg_get_userbyid(c.relowner) as owner
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('handicap_publishable_rating_snapshots', 'handicap_publishable_index_snapshots')
order by c.relname;

select table_name, privilege_type, grantee
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('handicap_publishable_rating_snapshots', 'handicap_publishable_index_snapshots')
  and grantee in ('public', 'anon', 'authenticated', 'service_role')
order by table_name, grantee, privilege_type;

select count(*)::bigint as rating_snapshots,
       count(*) filter (where publication_status <> 'UNPUBLISHED')::bigint as non_unpublished
from public.handicap_rating_snapshots;

select count(*)::bigint as player_index_snapshots
from public.handicap_index_snapshots;

select count(*)::bigint as invalid_run_rows
from public.handicap_calculation_runs
where status <> 'COMPLETED'
   or publication_eligibility <> 'ELIGIBLE';

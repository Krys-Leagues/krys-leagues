-- READ-ONLY PREFLIGHT ONLY. Do not execute an import from this file.
-- Phase 64 package: 14,394 provenance rows, 169 rating snapshots.

select current_database() as database_name, current_user as connected_role;

select c.relname as table_name,
       pg_get_userbyid(c.relowner) as owner,
       c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as force_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'handicap_calculation_runs',
    'handicap_source_provenance',
    'handicap_rating_snapshots',
    'handicap_index_snapshots',
    'handicap_review_evidence',
    'handicap_review_decisions'
  )
order by c.relname;

select 'handicap_calculation_runs' as table_name, count(*) as row_count from public.handicap_calculation_runs
union all select 'handicap_source_provenance', count(*) from public.handicap_source_provenance
union all select 'handicap_rating_snapshots', count(*) from public.handicap_rating_snapshots
union all select 'handicap_index_snapshots', count(*) from public.handicap_index_snapshots
union all select 'handicap_review_evidence', count(*) from public.handicap_review_evidence
union all select 'handicap_review_decisions', count(*) from public.handicap_review_decisions
order by table_name;

select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.handicap_rating_snapshots'::regclass
order by conname;

select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in (
    'handicap_calculation_runs',
    'handicap_source_provenance',
    'handicap_rating_snapshots',
    'handicap_index_snapshots',
    'handicap_review_evidence',
    'handicap_review_decisions'
  )
  and grantee in ('anon', 'authenticated', 'service_role', 'postgres', 'PUBLIC')
order by table_name, grantee, privilege_type;

select event_object_table as table_name, trigger_name, action_statement
from information_schema.triggers
where event_object_schema = 'public'
  and event_object_table in (
    'handicap_source_provenance',
    'handicap_rating_snapshots',
    'handicap_index_snapshots',
    'handicap_review_evidence',
    'handicap_review_decisions'
  )
order by event_object_table, trigger_name;

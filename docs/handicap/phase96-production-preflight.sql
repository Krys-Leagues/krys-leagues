-- PHASE 96 SELECT-ONLY PREFLIGHT — DO NOT EXECUTE AS A WRITE WORKFLOW.
-- Target only the verified Krys Leagues Supabase project.

select current_database() as database_name,
       current_user as connected_role;

select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'handicap_calculation_runs',
    'handicap_index_snapshots',
    'handicap_source_provenance',
    'handicap_rating_snapshots'
  )
  and column_name in (
    'chronology_policy',
    'chronology_confidence',
    'publication_eligibility',
    'publication_status'
  )
order by table_name, ordinal_position;

select c.conname,
       t.relname as table_name,
       pg_get_constraintdef(c.oid) as definition
from pg_constraint as c
join pg_class as t on t.oid = c.conrelid
join pg_namespace as n on n.oid = t.relnamespace
where n.nspname = 'public'
  and t.relname in (
    'handicap_calculation_runs',
    'handicap_index_snapshots'
  )
  and c.contype = 'c'
order by t.relname, c.conname;

select schemaname, viewname, viewowner, definition
from pg_views
where schemaname = 'public'
  and viewname = 'handicap_publishable_index_snapshots';

select c.relname as view_name,
       coalesce(c.reloptions::text, '{}') as reloptions,
       has_table_privilege('anon', format('%I.%I', n.nspname, c.relname), 'select') as anon_select,
       has_table_privilege('authenticated', format('%I.%I', n.nspname, c.relname), 'select') as authenticated_select,
       has_table_privilege('service_role', format('%I.%I', n.nspname, c.relname), 'select') as service_role_select
from pg_class as c
join pg_namespace as n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'handicap_publishable_index_snapshots';

select count(*)::bigint as calculation_runs,
       count(*) filter (where status = 'DRAFT')::bigint as draft_runs,
       count(*) filter (where publication_eligibility = 'QUARANTINED')::bigint as quarantined_runs
from public.handicap_calculation_runs;

select count(*)::bigint as index_snapshots,
       count(*) filter (where publication_status <> 'UNPUBLISHED')::bigint as non_unpublished
from public.handicap_index_snapshots;

select count(*)::bigint as publishable_indexes
from public.handicap_publishable_index_snapshots;

select id, status, publication_eligibility, chronology_policy,
       metadata ->> 'allow_official_kwt_sequence_publication' as official_sequence_opt_in
from public.handicap_calculation_runs
order by created_at;

-- Expected before installation: no run has the official-sequence opt-in,
-- no index snapshots exist, and the chronology constraint lacks the new value.

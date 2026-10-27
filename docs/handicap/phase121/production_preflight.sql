-- Phase 121 proposal only. READ-ONLY. Do not execute as a write migration.
-- Target: Supabase project jfbndcwdsvsjgnzwvexp.
begin;
set transaction read only;

select current_database(), current_setting('server_version');

select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'handicap_calculation_runs',
    'handicap_rating_snapshots',
    'handicap_index_snapshots',
    'handicap_review_evidence',
    'handicap_review_decisions',
    'handicap_source_provenance'
  )
order by table_name;

select c.relname as table_name, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as force_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname like 'handicap_%'
order by c.relname;

select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name like 'handicap_%'
  and grantee in ('anon', 'authenticated', 'service_role')
order by table_name, grantee, privilege_type;

select id, status, publication_eligibility, chronology_policy
from public.handicap_calculation_runs
order by created_at, id;

select count(*) as provenance_rows from public.handicap_source_provenance;
select count(*) as rating_rows from public.handicap_rating_snapshots;
select count(*) as index_rows from public.handicap_index_snapshots;
select count(*) as candidate_run_rows
from public.handicap_calculation_runs
where id = '19777bdb-8c2d-5c39-80fa-55a7b429fe93';

-- Required fail-closed checks for the future transaction:
-- * existing historical counts remain unchanged;
-- * candidate run ID is absent;
-- * all source fingerprints and canonical UUIDs are preflighted against the package;
-- * no client grants, RLS, append-only triggers, or publication views are broadened.

rollback;

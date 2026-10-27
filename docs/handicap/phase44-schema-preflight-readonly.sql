-- READ-ONLY PREFLIGHT ONLY. Do not run through an apply-migration path.
-- This reports existing definitions before any future persistence installation.

select
  n.nspname as schema_name,
  c.relname as table_name,
  c.relkind,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as force_rls,
  pg_get_userbyid(c.relowner) as owner_name
from pg_catalog.pg_class as c
join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'handicap_calculation_runs',
    'handicap_rating_snapshots',
    'handicap_index_snapshots',
    'handicap_review_evidence',
    'handicap_review_decisions',
    'handicap_source_provenance'
  )
order by c.relname;

select
  table_schema,
  table_name,
  column_name,
  ordinal_position,
  data_type,
  udt_name,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'handicap_calculation_runs',
    'handicap_rating_snapshots',
    'handicap_index_snapshots',
    'handicap_review_evidence',
    'handicap_review_decisions',
    'handicap_source_provenance'
  )
order by table_name, ordinal_position;

select
  n.nspname as schema_name,
  c.relname as table_name,
  con.conname,
  con.contype,
  pg_get_constraintdef(con.oid, true) as constraint_definition
from pg_catalog.pg_constraint as con
join pg_catalog.pg_class as c on c.oid = con.conrelid
join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname like 'handicap_%'
order by c.relname, con.conname;

select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_catalog.pg_policies
where schemaname = 'public'
  and tablename like 'handicap_%'
order by tablename, policyname;

select
  table_schema,
  table_name,
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name like 'handicap_%'
  and grantee in ('public', 'anon', 'authenticated', 'service_role')
order by table_name, grantee, privilege_type;

select
  n.nspname as schema_name,
  c.relname as table_name,
  t.tgname,
  t.tgenabled,
  pg_get_triggerdef(t.oid, true) as trigger_definition
from pg_catalog.pg_trigger as t
join pg_catalog.pg_class as c on c.oid = t.tgrelid
join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname like 'handicap_%'
  and not t.tgisinternal
order by c.relname, t.tgname;

-- SELECT-ONLY Phase 73 preflight. Do not add DDL or DML.

select current_database() as database_name, current_user as session_role;

select c.relname as object_name,
       c.relkind,
       c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as force_rls,
       pg_get_userbyid(c.relowner) as owner
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'handicap_calculation_runs',
    'handicap_rating_snapshots',
    'handicap_index_snapshots',
    'handicap_source_provenance',
    'handicap_publishable_rating_snapshots',
    'handicap_publishable_index_snapshots'
  )
order by c.relname;

select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'handicap_calculation_runs'
  and column_name in ('status', 'publication_eligibility')
order by ordinal_position;

select conrelid::regclass::text as table_name,
       conname,
       pg_get_constraintdef(oid) as definition,
       convalidated
from pg_constraint
where conrelid in (
  'public.handicap_calculation_runs'::regclass,
  'public.handicap_rating_snapshots'::regclass,
  'public.handicap_index_snapshots'::regclass
)
order by table_name, conname;

select table_name, privilege_type, grantee
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('handicap_publishable_rating_snapshots', 'handicap_publishable_index_snapshots')
  and grantee in ('public', 'anon', 'authenticated', 'service_role')
order by table_name, grantee, privilege_type;

select
  count(*)::bigint as calculation_runs,
  count(*) filter (where status = 'DRAFT')::bigint as draft_runs,
  count(*) filter (where publication_eligibility = 'QUARANTINED')::bigint as quarantined_runs,
  count(*) filter (where publication_eligibility = 'ELIGIBLE')::bigint as eligible_runs
from public.handicap_calculation_runs;

select
  count(*)::bigint as rating_snapshots,
  count(*) filter (where publication_status = 'UNPUBLISHED')::bigint as unpublished,
  count(*) filter (where publication_status = 'PUBLISHED')::bigint as published
from public.handicap_rating_snapshots;

select count(*)::bigint as player_index_snapshots
from public.handicap_index_snapshots;

select count(*) filter (
         where source_type = 'KWT'
           and (canonical_player_id is null
             or nullif(btrim(coalesce(original_player_name, '')), '') is null
             or nullif(btrim(coalesce(metadata ->> 'source_player_id', '')), '') is null
             or source_fingerprint !~ '^KWT[|][^|]+[|][^|]+[|][^|]+[|][^|]+$')
       )::bigint as invalid_kwt_provenance,
       count(*) filter (
         where source_type = 'THE_WEEKLY'
           and coalesce(metadata ->> 'personal_handicap_eligible', 'true') <> 'false'
       )::bigint as weekly_personal_source_rows
from public.handicap_source_provenance;

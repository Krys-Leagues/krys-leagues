-- SELECT-ONLY Phase 74 preflight. Never paste the proposal here.

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
    'handicap_review_evidence',
    'handicap_review_decisions',
    'handicap_source_provenance',
    'handicap_publishable_rating_snapshots',
    'handicap_publishable_index_snapshots'
  )
order by c.relname;

select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'handicap_calculation_runs',
    'handicap_rating_snapshots',
    'handicap_index_snapshots'
  )
order by table_name, ordinal_position;

select conrelid::regclass::text as table_name,
       conname,
       pg_get_constraintdef(oid) as definition,
       convalidated
from pg_constraint
where conrelid in (
  'public.handicap_calculation_runs'::regclass,
  'public.handicap_rating_snapshots'::regclass,
  'public.handicap_index_snapshots'::regclass,
  'public.handicap_source_provenance'::regclass
)
order by table_name, conname;

select table_name, privilege_type, grantee
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in (
    'handicap_calculation_runs',
    'handicap_rating_snapshots',
    'handicap_index_snapshots',
    'handicap_review_evidence',
    'handicap_review_decisions',
    'handicap_source_provenance',
    'handicap_publishable_rating_snapshots',
    'handicap_publishable_index_snapshots'
  )
  and grantee in ('public', 'anon', 'authenticated', 'service_role')
order by table_name, grantee, privilege_type;

select table_name, count(*)::bigint as row_count
from (
  select 'handicap_calculation_runs' as table_name, id from public.handicap_calculation_runs
  union all select 'handicap_rating_snapshots', id from public.handicap_rating_snapshots
  union all select 'handicap_index_snapshots', id from public.handicap_index_snapshots
  union all select 'handicap_review_evidence', id from public.handicap_review_evidence
  union all select 'handicap_review_decisions', id from public.handicap_review_decisions
  union all select 'handicap_source_provenance', id from public.handicap_source_provenance
) counts
group by table_name
order by table_name;

select r.id,
       r.status,
       r.publication_eligibility,
       count(s.id)::bigint as rating_snapshot_count
from public.handicap_calculation_runs r
left join public.handicap_rating_snapshots s on s.calculation_run_id = r.id
group by r.id, r.status, r.publication_eligibility
order by r.id;

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

select n.nspname as schema_name,
       c.relname as relation_name,
       c.relkind,
       c.reloptions
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('handicap_publishable_rating_snapshots', 'handicap_publishable_index_snapshots');


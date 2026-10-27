-- PHASE 72 SELECT-ONLY PREFLIGHT.
-- Do not add DDL/DML. Run against the verified Production project only after
-- independently confirming project id jfbndcwdsvsjgnzwvexp.

select id, status, policy_version, model_version, source_package_ref,
       chronology_policy, metadata
from public.handicap_calculation_runs
where id = '5a57560c-3548-54a8-879c-8fc516a85f26';

select exists (
  select 1 from public.handicap_calculation_runs
  where id = 'fb606c55-e2f6-5d01-b79d-bfcc129a7cc6'
) as corrected_run_already_present;

select source_type,
       count(*)::bigint as rows,
       count(*) filter (
         where source_type = 'KWT' and canonical_player_id is null
       )::bigint as kwt_missing_canonical,
       count(*) filter (
         where source_type = 'KWT' and source_fingerprint like 'KWT|%||%'
       )::bigint as kwt_malformed_fingerprint,
       count(*) filter (
         where source_type = 'KWT'
           and metadata->>'source_player_id' is null
       )::bigint as kwt_missing_source_player,
       count(*) filter (
         where source_type = 'THE_WEEKLY' and canonical_player_id is not null
       )::bigint as weekly_linked_player,
       count(*) filter (
         where source_type = 'THE_WEEKLY'
           and metadata->>'personal_handicap_eligible' <> 'false'
       )::bigint as weekly_personal_eligible
from public.handicap_source_provenance
group by source_type
order by source_type;

select count(*)::bigint as snapshots,
       count(*) filter (where publication_status = 'UNPUBLISHED')::bigint
         as unpublished,
       count(*) filter (where effective_from is not null)::bigint
         as effective_dated,
       count(*) filter (where review_scope is null)::bigint
         as missing_review_scope,
       count(*) filter (where publication_status <> 'UNPUBLISHED')::bigint
         as non_unpublished
from public.handicap_rating_snapshots;

select review_scope, count(*)::bigint as snapshots
from public.handicap_rating_snapshots
group by review_scope
order by review_scope;

select count(*)::bigint as player_index_snapshots
from public.handicap_index_snapshots;

select c.relname as table_name,
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
    'handicap_source_provenance'
  )
order by c.relname;

select conrelid::regclass::text as table_name,
       conname,
       pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid in (
  'public.handicap_calculation_runs'::regclass,
  'public.handicap_rating_snapshots'::regclass,
  'public.handicap_index_snapshots'::regclass,
  'public.handicap_review_evidence'::regclass,
  'public.handicap_review_decisions'::regclass,
  'public.handicap_source_provenance'::regclass
)
order by table_name, conname;

select table_name, privilege_type, grantee
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name like 'handicap_%'
  and grantee in ('public', 'anon', 'authenticated', 'service_role')
order by table_name, grantee, privilege_type;

select 'handicap_rounds' as table_name, count(*)::bigint as row_count
from public.handicap_rounds
union all
select 'course_ratings', count(*)::bigint from public.course_ratings
union all
select 'handicap_differentials', count(*)::bigint
from public.handicap_differentials
union all
select 'handicap_index', count(*)::bigint from public.handicap_index;

-- PHASE 72 SELECT-ONLY POSTFLIGHT.
-- Run only after a separately approved transaction reports COMMIT.

select id, status, policy_version, model_version, source_package_ref,
       metadata
from public.handicap_calculation_runs
where id in (
  '5a57560c-3548-54a8-879c-8fc516a85f26',
  'fb606c55-e2f6-5d01-b79d-bfcc129a7cc6'
)
order by id;

select count(*)::bigint as total_runs,
       count(*) filter (where id = '5a57560c-3548-54a8-879c-8fc516a85f26')::bigint
         as invalid_run_present,
       count(*) filter (where id = 'fb606c55-e2f6-5d01-b79d-bfcc129a7cc6')::bigint
         as corrected_run_present
from public.handicap_calculation_runs;

select source_type,
       count(*)::bigint as rows,
       count(*) filter (
         where source_type = 'KWT'
           and canonical_player_id is not null
           and nullif(metadata->>'source_player_id', '') is not null
           and source_fingerprint !~ '^KWT\|[^|]+\|[^|]+\|[^|]+\|[^|]+$'
       )::bigint as malformed_corrected_kwt,
       count(*) filter (
         where source_type = 'THE_WEEKLY'
           and canonical_player_id is null
           and metadata->>'personal_handicap_eligible' = 'false'
       )::bigint as valid_weekly_external
from public.handicap_source_provenance
group by source_type
order by source_type;

select count(*)::bigint as total_snapshots,
       count(*) filter (
         where calculation_run_id = 'fb606c55-e2f6-5d01-b79d-bfcc129a7cc6'
           and publication_status = 'UNPUBLISHED'
           and effective_from is null
       )::bigint as corrected_unpublished,
       count(*) filter (where publication_status <> 'UNPUBLISHED')::bigint
         as published_or_other,
       count(*) filter (where review_scope is null)::bigint as missing_scope
from public.handicap_rating_snapshots;

select review_scope, count(*)::bigint as corrected_snapshots
from public.handicap_rating_snapshots
where calculation_run_id = 'fb606c55-e2f6-5d01-b79d-bfcc129a7cc6'
group by review_scope
order by review_scope;

select count(*)::bigint as corrected_snapshot_reference_errors
from public.handicap_rating_snapshots s
cross join lateral unnest(s.source_evidence_refs) ref
left join public.handicap_source_provenance p
  on p.source_fingerprint = ref
where s.calculation_run_id = 'fb606c55-e2f6-5d01-b79d-bfcc129a7cc6'
  and (
    p.id is null
    or (p.source_type = 'KWT' and (
      p.canonical_player_id is null
      or nullif(p.metadata->>'source_player_id', '') is null
      or p.source_fingerprint like 'KWT|%||%'
    ))
    or (p.source_type = 'THE_WEEKLY' and (
      p.canonical_player_id is not null
      or p.metadata->>'personal_handicap_eligible' <> 'false'
    ))
  );

select subject_kind, subject_key, decision, decision_sequence
from public.handicap_review_decisions
where subject_kind = 'SOURCE_RECORD'
  and subject_key = '5a57560c-3548-54a8-879c-8fc516a85f26'
order by decision_sequence;

select count(*)::bigint as player_index_snapshots
from public.handicap_index_snapshots;

select 'handicap_rounds' as table_name, count(*)::bigint as row_count
from public.handicap_rounds
union all
select 'course_ratings', count(*)::bigint from public.course_ratings
union all
select 'handicap_differentials', count(*)::bigint
from public.handicap_differentials
union all
select 'handicap_index', count(*)::bigint from public.handicap_index;

select c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as force_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname like 'handicap_%'
order by c.relname;

select table_name, privilege_type, grantee
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name like 'handicap_%'
  and grantee in ('public', 'anon', 'authenticated', 'service_role')
order by table_name, grantee, privilege_type;

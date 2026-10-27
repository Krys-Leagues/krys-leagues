-- PHASE 68 READ-ONLY POSTFLIGHT. Do not run until a separately approved
-- append-only recovery transaction has completed.

select id, status, source_package_ref
from public.handicap_calculation_runs
where id in ('5a57560c-3548-54a8-879c-8fc516a85f26','fb606c55-e2f6-5d01-b79d-bfcc129a7cc6')
order by id;

select count(*) as total_provenance,
       count(*) filter (where source_type = 'KWT' and canonical_player_id is not null and metadata->>'source_player_id' is not null and source_fingerprint not like 'KWT|%||%') as corrected_kwt,
       count(*) filter (where source_type = 'THE_WEEKLY' and canonical_player_id is null and metadata->>'personal_handicap_eligible' = 'false') as valid_weekly
from public.handicap_source_provenance;

select count(*) as total_snapshots,
       count(*) filter (where calculation_run_id = 'fb606c55-e2f6-5d01-b79d-bfcc129a7cc6' and publication_status = 'UNPUBLISHED' and effective_from is null) as corrected_unpublished,
       count(*) filter (where publication_status <> 'UNPUBLISHED') as published_or_other
from public.handicap_rating_snapshots;

select count(*) as corrected_snapshot_reference_errors
from public.handicap_rating_snapshots s
cross join lateral unnest(s.source_evidence_refs) ref
left join public.handicap_source_provenance p on p.source_fingerprint = ref
where s.calculation_run_id = 'fb606c55-e2f6-5d01-b79d-bfcc129a7cc6'
  and (p.id is null
    or (p.source_type = 'KWT' and p.canonical_player_id is null)
    or (p.source_type = 'THE_WEEKLY' and (p.canonical_player_id is not null or p.metadata->>'personal_handicap_eligible' <> 'false')));

select count(*) as player_index_snapshots
from public.handicap_index_snapshots;

select subject_kind, subject_key, decision, decision_sequence
from public.handicap_review_decisions
where subject_kind = 'SOURCE_RECORD'
  and subject_key = '5a57560c-3548-54a8-879c-8fc516a85f26'
order by decision_sequence;

select table_name, privilege_type, grantee
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name like 'handicap_%'
  and grantee in ('public','anon','authenticated','service_role')
order by table_name, grantee, privilege_type;

select 'handicap_rounds' as table_name, count(*)::bigint as row_count from public.handicap_rounds
union all select 'course_ratings', count(*)::bigint from public.course_ratings
union all select 'handicap_differentials', count(*)::bigint from public.handicap_differentials
union all select 'handicap_index', count(*)::bigint from public.handicap_index;

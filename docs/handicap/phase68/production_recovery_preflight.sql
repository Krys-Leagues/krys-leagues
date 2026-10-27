-- PHASE 68 READ-ONLY PREFLIGHT. DO NOT ADD WRITE STATEMENTS.
-- Run only against the verified Supabase Production project after separately
-- confirming project id jfbndcwdsvsjgnzwvexp.

select id, status, policy_version, model_version, source_package_ref
from public.handicap_calculation_runs
where id = '5a57560c-3548-54a8-879c-8fc516a85f26';

select source_type, count(*) as rows,
       count(*) filter (where source_type = 'KWT' and canonical_player_id is null) as kwt_missing_canonical,
       count(*) filter (where source_type = 'KWT' and source_fingerprint like 'KWT|%||%') as kwt_malformed_fingerprint,
       count(*) filter (where source_type = 'THE_WEEKLY' and canonical_player_id is not null) as weekly_linked_player,
       count(*) filter (where source_type = 'THE_WEEKLY' and metadata->>'personal_handicap_eligible' <> 'false') as weekly_personal_eligible
from public.handicap_source_provenance
group by source_type
order by source_type;

select count(*) as snapshots,
       count(*) filter (where publication_status = 'UNPUBLISHED') as unpublished,
       count(*) filter (where effective_from is not null) as effective_dated,
       count(*) filter (where review_scope is null) as missing_review_scope
from public.handicap_rating_snapshots;

select count(*) as player_index_snapshots
from public.handicap_index_snapshots;

select c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as force_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('handicap_calculation_runs','handicap_rating_snapshots','handicap_index_snapshots','handicap_review_evidence','handicap_review_decisions','handicap_source_provenance')
order by c.relname;

select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.handicap_rating_snapshots'::regclass
order by conname;

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

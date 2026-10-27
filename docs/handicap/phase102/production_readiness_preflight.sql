-- Phase 102 READ-ONLY Production preflight.
-- This file intentionally contains SELECT statements only. Do not execute the
-- Phase 101 proposal until every result matches the readiness report.

with required_relations as (
  select unnest(array[
    'handicap_calculation_runs',
    'handicap_rating_snapshots',
    'handicap_index_snapshots',
    'handicap_review_evidence',
    'handicap_review_decisions',
    'handicap_source_provenance'
  ]) as relname
)
select
  r.relname,
  c.relkind,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as force_rls,
  case r.relname
    when 'handicap_calculation_runs' then (select count(*) from public.handicap_calculation_runs)
    when 'handicap_rating_snapshots' then (select count(*) from public.handicap_rating_snapshots)
    when 'handicap_index_snapshots' then (select count(*) from public.handicap_index_snapshots)
    when 'handicap_review_evidence' then (select count(*) from public.handicap_review_evidence)
    when 'handicap_review_decisions' then (select count(*) from public.handicap_review_decisions)
    when 'handicap_source_provenance' then (select count(*) from public.handicap_source_provenance)
  end as row_count
from required_relations r
left join pg_class c on c.relname = r.relname
left join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
order by r.relname;

select
  has_table_privilege('public', 'public.handicap_publishable_rating_snapshots', 'SELECT') as public_rating_select,
  has_table_privilege('anon', 'public.handicap_publishable_rating_snapshots', 'SELECT') as anon_rating_select,
  has_table_privilege('authenticated', 'public.handicap_publishable_rating_snapshots', 'SELECT') as authenticated_rating_select,
  has_table_privilege('service_role', 'public.handicap_publishable_rating_snapshots', 'SELECT') as service_rating_select,
  has_table_privilege('public', 'public.handicap_publishable_index_snapshots', 'SELECT') as public_index_select,
  has_table_privilege('anon', 'public.handicap_publishable_index_snapshots', 'SELECT') as anon_index_select,
  has_table_privilege('authenticated', 'public.handicap_publishable_index_snapshots', 'SELECT') as authenticated_index_select,
  has_table_privilege('service_role', 'public.handicap_publishable_index_snapshots', 'SELECT') as service_index_select;

select
  c.relname as view_name,
  ('security_invoker=true' = any(c.reloptions)) as security_invoker,
  pg_get_viewdef(c.oid, true) as definition
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('handicap_publishable_rating_snapshots', 'handicap_publishable_index_snapshots')
  and c.relkind = 'v'
order by c.relname;

select
  (select count(*) from public.handicap_calculation_runs) as calculation_runs,
  (select count(*) from public.handicap_rating_snapshots) as rating_snapshots,
  (select count(*) from public.handicap_index_snapshots) as index_snapshots,
  (select count(*) from public.handicap_source_provenance) as source_provenance,
  (select count(*) from public.handicap_publishable_rating_snapshots) as publishable_ratings,
  (select count(*) from public.handicap_publishable_index_snapshots) as publishable_indexes,
  (select count(*) from public.handicap_rating_snapshots where publication_status = 'PUBLISHED') as published_ratings,
  (select count(*) from public.handicap_index_snapshots where publication_status = 'PUBLISHED') as published_indexes,
  (select count(*) from public.handicap_rating_snapshots where effective_from is null) as ratings_without_calendar_date;

select
  id,
  status,
  publication_eligibility,
  chronology_policy,
  coalesce(metadata ->> 'allow_official_kwt_sequence_publication', 'false') as official_sequence_opt_in
from public.handicap_calculation_runs
order by created_at, id;

select
  tgrelid::regclass as table_name,
  tgname as trigger_name,
  tgenabled,
  pg_get_triggerdef(oid, true) as trigger_definition
from pg_trigger
where not tgisinternal
  and tgrelid in (
    'public.handicap_rating_snapshots'::regclass,
    'public.handicap_index_snapshots'::regclass,
    'public.handicap_review_evidence'::regclass,
    'public.handicap_review_decisions'::regclass,
    'public.handicap_source_provenance'::regclass
  )
order by tgrelid::regclass::text, tgname;

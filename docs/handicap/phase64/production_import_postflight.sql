-- READ-ONLY POSTFLIGHT ONLY. Run only after a separately authorized import.

select count(*) as draft_calculation_runs
from public.handicap_calculation_runs
where id = '5a57560c-3548-54a8-879c-8fc516a85f26'
  and status = 'DRAFT';

select count(*) as imported_provenance_rows
from public.handicap_source_provenance
where source_fingerprint in (
  select unnest(source_evidence_refs)
  from public.handicap_rating_snapshots
  where calculation_run_id = '5a57560c-3548-54a8-879c-8fc516a85f26'
);

select count(*) as imported_rating_snapshots,
       count(*) filter (where publication_status = 'UNPUBLISHED') as unpublished_snapshots,
       count(*) filter (where rating_confidence = 'ready') as ready_snapshots,
       count(*) filter (where rating_confidence = 'provisional') as provisional_snapshots,
       count(*) filter (where effective_from is not null) as dated_snapshots
from public.handicap_rating_snapshots
where calculation_run_id = '5a57560c-3548-54a8-879c-8fc516a85f26';

select count(*) as player_index_snapshots
from public.handicap_index_snapshots
where calculation_run_id = '5a57560c-3548-54a8-879c-8fc516a85f26';

select c.relname as table_name, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as force_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'handicap_calculation_runs',
    'handicap_source_provenance',
    'handicap_rating_snapshots',
    'handicap_index_snapshots',
    'handicap_review_evidence',
    'handicap_review_decisions'
  )
order by c.relname;

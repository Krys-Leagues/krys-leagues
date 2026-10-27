-- Phase 121 proposal only. READ-ONLY postflight for a separately approved install.
begin;
set transaction read only;

select count(*) as calculation_runs from public.handicap_calculation_runs;
select count(*) as provenance_rows from public.handicap_source_provenance;
select count(*) as rating_snapshots from public.handicap_rating_snapshots;
select count(*) as index_snapshots from public.handicap_index_snapshots;

select id, status, publication_eligibility, chronology_policy
from public.handicap_calculation_runs
where id = '19777bdb-8c2d-5c39-80fa-55a7b429fe93';

select publication_status, count(*)
from public.handicap_rating_snapshots
where calculation_run_id = '19777bdb-8c2d-5c39-80fa-55a7b429fe93'
group by publication_status;

select publication_status, count(*)
from public.handicap_index_snapshots
where calculation_run_id = '19777bdb-8c2d-5c39-80fa-55a7b429fe93'
group by publication_status;

select count(*) as publishable_ratings
from public.handicap_publishable_rating_snapshots;
select count(*) as publishable_indexes
from public.handicap_publishable_index_snapshots;

-- Verify no Weekly provenance is referenced by personal index snapshots.
select count(*) as weekly_index_references
from public.handicap_index_snapshots i
join public.handicap_source_provenance p
  on p.source_fingerprint = any(i.source_round_ids)
where p.source_type = 'THE_WEEKLY';

rollback;

-- Read-only postflight template for a separately authorized schema correction
-- and unpublished import. Do not run as part of Phase 65.

select review_scope, count(*) as snapshots
from public.handicap_rating_snapshots
group by review_scope
order by review_scope;

select count(*) as snapshots_without_scope
from public.handicap_rating_snapshots
where review_scope is null;

select conname, pg_get_constraintdef(oid) as definition, convalidated
from pg_constraint
where conrelid = 'public.handicap_rating_snapshots'::regclass
  and conname in (
    'handicap_rating_snapshots_review_scope_check',
    'handicap_rating_snapshots_calculation_run_scope_key'
  )
order by conname;

select
  count(*) as total_snapshots,
  count(*) filter (where publication_status <> 'UNPUBLISHED') as published_or_other,
  count(*) filter (where effective_from is not null) as invented_or_present_dates
from public.handicap_rating_snapshots;

select count(*) as player_index_snapshots
from public.handicap_index_snapshots;

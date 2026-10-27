-- PHASE134 READ-ONLY POSTFLIGHT TEMPLATE; no writes.
BEGIN; SET TRANSACTION READ ONLY;
SELECT count(*) AS calculation_runs FROM public.handicap_calculation_runs;
SELECT count(*) AS provenance_rows FROM public.handicap_source_provenance;
SELECT count(*) AS rating_snapshots FROM public.handicap_rating_snapshots;
SELECT count(*) AS index_snapshots FROM public.handicap_index_snapshots;
SELECT count(*) AS publishable_ratings FROM public.handicap_publishable_rating_snapshots;
SELECT count(*) AS publishable_indexes FROM public.handicap_publishable_index_snapshots;
ROLLBACK;

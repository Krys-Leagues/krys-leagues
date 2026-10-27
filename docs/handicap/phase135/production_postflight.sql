-- PHASE135 READ-ONLY POSTFLIGHT TEMPLATE; execute only after separately authorized installation.
BEGIN; SET TRANSACTION READ ONLY;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.handicap_calculation_runs) <> 5 THEN RAISE EXCEPTION 'run count mismatch'; END IF;
  IF (SELECT count(*) FROM public.handicap_source_provenance) <> 28672 THEN RAISE EXCEPTION 'provenance changed'; END IF;
  IF (SELECT count(*) FROM public.handicap_rating_snapshots) <> 426 THEN RAISE EXCEPTION 'rating count mismatch'; END IF;
  IF (SELECT count(*) FROM public.handicap_index_snapshots) <> 157 THEN RAISE EXCEPTION 'index count changed'; END IF;
  IF (SELECT count(*) FROM public.handicap_publishable_rating_snapshots) <> 0 OR (SELECT count(*) FROM public.handicap_publishable_index_snapshots) <> 0 THEN RAISE EXCEPTION 'publication gate opened'; END IF;
END $$;
SELECT 'phase135_postflight_passed' AS status; ROLLBACK;

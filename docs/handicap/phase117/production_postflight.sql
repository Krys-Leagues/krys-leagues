\set ON_ERROR_STOP on
select json_build_object(
  'calculation_runs', (select count(*) from public.handicap_calculation_runs),
  'provenance_rows', (select count(*) from public.handicap_source_provenance),
  'rating_snapshots', (select count(*) from public.handicap_rating_snapshots),
  'index_snapshots', (select count(*) from public.handicap_index_snapshots),
  'weekly_rows', (select count(*) from public.handicap_source_provenance where source_type='THE_WEEKLY'),
  'imported_namespace_rows', (select count(*) from public.handicap_source_provenance where metadata->>'provenance_namespace'='OFFICIAL_KWT_CSV'),
  'new_run_status', (select status || '/' || publication_eligibility from public.handicap_calculation_runs where id='9a9a4bc4-e43d-55d4-84fb-a83c0b757681'::uuid),
  'publishable_ratings', (select count(*) from public.handicap_publishable_rating_snapshots),
  'publishable_indexes', (select count(*) from public.handicap_publishable_index_snapshots),
  'client_private_table_select', (select count(*) from (values ('public.handicap_calculation_runs'::text),('public.handicap_rating_snapshots'),('public.handicap_index_snapshots'),('public.handicap_review_evidence'),('public.handicap_review_decisions'),('public.handicap_source_provenance')) as private_tables(table_name) where has_table_privilege('anon',table_name,'select') or has_table_privilege('authenticated',table_name,'select'))
) as phase117_postflight;
do $$ begin
  if (select count(*) from public.handicap_calculation_runs) <> 4 then raise exception 'expected four calculation runs'; end if;
  if (select count(*) from public.handicap_source_provenance) <> 28672 then raise exception 'expected 28672 provenance rows'; end if;
  if (select count(*) from public.handicap_rating_snapshots) <> 410 then raise exception 'ratings changed'; end if;
  if (select count(*) from public.handicap_index_snapshots) <> 157 then raise exception 'indexes changed'; end if;
  if (select count(*) from public.handicap_source_provenance where source_type='THE_WEEKLY') <> 844 then raise exception 'Weekly rows changed'; end if;
  if (select count(*) from public.handicap_source_provenance where metadata->>'provenance_namespace'='OFFICIAL_KWT_CSV') <> 728 then raise exception 'imported row count mismatch'; end if;
  if (select count(*) from public.handicap_calculation_runs where id='9a9a4bc4-e43d-55d4-84fb-a83c0b757681'::uuid and status='DRAFT' and publication_eligibility='QUARANTINED') <> 1 then raise exception 'new run is not quarantined'; end if;
  if (select count(*) from public.handicap_publishable_rating_snapshots) <> 0 or (select count(*) from public.handicap_publishable_index_snapshots) <> 0 then raise exception 'publication views are not empty'; end if;
  if exists (select 1 from (values ('public.handicap_calculation_runs'::text),('public.handicap_rating_snapshots'),('public.handicap_index_snapshots'),('public.handicap_review_evidence'),('public.handicap_review_decisions'),('public.handicap_source_provenance')) as private_tables(table_name) where has_table_privilege('anon',table_name,'select') or has_table_privilege('authenticated',table_name,'select')) then raise exception 'client SELECT unexpectedly granted'; end if;
end $$;

-- PHASE 141 READ-ONLY POSTFLIGHT TEMPLATE; execute only after separately authorized installation.
begin; set transaction read only;
do $$ begin
  if (select count(*) from public.handicap_calculation_runs) <> 6 then raise exception 'Phase 141 run count mismatch'; end if;
  if (select count(*) from public.handicap_source_provenance) <> 28672 then raise exception 'Phase 141 provenance count changed'; end if;
  if (select count(*) from public.handicap_rating_snapshots) <> 427 then raise exception 'Phase 141 rating count changed'; end if;
  if (select count(*) from public.handicap_index_snapshots) <> 323 then raise exception 'Phase 141 index count mismatch'; end if;
  if (select count(*) from public.handicap_index_snapshots where calculation_run_id = '5db94324-3789-559c-865c-35ed9c2081dd'::uuid and publication_status = 'UNPUBLISHED' and effective_from = '2026-10-22'::date) <> 166 then raise exception 'Phase 141 unpublished index/date mismatch'; end if;
  if (select count(*) from public.handicap_publishable_rating_snapshots) <> 0 or (select count(*) from public.handicap_publishable_index_snapshots) <> 0 then raise exception 'Phase 141 publication gate opened'; end if;
end $$;
select 'phase141_postflight_passed' as status; rollback;

-- PHASE 141 PUBLIC PROFILE RPC READ-ONLY POSTFLIGHT; execute only after separately authorized RPC installation.
begin; set transaction read only;
do $$ begin
  if to_regprocedure('public.get_public_published_handicap_for_player(uuid)') is null or to_regprocedure('handicap_private.get_public_published_handicap_for_player(uuid)') is null then raise exception 'public profile RPC is missing'; end if;
  if not has_function_privilege('anon', 'public.get_public_published_handicap_for_player(uuid)', 'EXECUTE') or not has_function_privilege('authenticated', 'public.get_public_published_handicap_for_player(uuid)', 'EXECUTE') then raise exception 'public wrapper execute grants missing'; end if;
  if has_table_privilege('anon', 'public.handicap_index_snapshots', 'SELECT') or has_table_privilege('authenticated', 'public.handicap_index_snapshots', 'SELECT') or has_table_privilege('anon', 'public.handicap_publishable_index_snapshots', 'SELECT') or has_table_privilege('authenticated', 'public.handicap_publishable_index_snapshots', 'SELECT') then raise exception 'direct client snapshot access was broadened'; end if;
  if (select count(*) from public.handicap_calculation_runs) <> 5 or (select count(*) from public.handicap_source_provenance) <> 28672 or (select count(*) from public.handicap_rating_snapshots) <> 427 or (select count(*) from public.handicap_index_snapshots) <> 157 then raise exception 'Phase 141 counts changed'; end if;
  if (select count(*) from public.handicap_publishable_rating_snapshots) <> 0 or (select count(*) from public.handicap_publishable_index_snapshots) <> 0 then raise exception 'publication state changed'; end if;
end $$;
select 'phase141_public_profile_read_postflight_passed' as status; rollback;

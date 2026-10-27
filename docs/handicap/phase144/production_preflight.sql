-- PHASE 144 READ-ONLY PRODUCTION PREFLIGHT; DO NOT EXECUTE AS A WRITE.
begin; set transaction read only;
do $$ begin
  if current_user <> 'postgres' then raise exception 'expected postgres owner-role execution'; end if;
  if to_regnamespace('handicap_private') is null or to_regclass('public.players') is null or to_regclass('public.handicap_publishable_index_snapshots') is null then raise exception 'Phase 144 dependencies missing'; end if;
  if to_regprocedure('public.get_published_handicap_for_player(uuid)') is null then raise exception 'existing self-read RPC missing'; end if;
  if to_regprocedure('public.get_public_published_handicap_for_player(uuid)') is not null or to_regprocedure('handicap_private.get_public_published_handicap_for_player(uuid)') is not null then raise exception 'Phase 144 target already exists'; end if;
  if has_table_privilege('anon', 'public.handicap_index_snapshots', 'SELECT') or has_table_privilege('authenticated', 'public.handicap_index_snapshots', 'SELECT') or has_table_privilege('anon', 'public.handicap_publishable_index_snapshots', 'SELECT') or has_table_privilege('authenticated', 'public.handicap_publishable_index_snapshots', 'SELECT') then raise exception 'direct client snapshot access is not denied'; end if;
  if (select count(*) from public.handicap_calculation_runs) <> 5 or (select count(*) from public.handicap_source_provenance) <> 28672 or (select count(*) from public.handicap_rating_snapshots) <> 427 or (select count(*) from public.handicap_index_snapshots) <> 157 or (select count(*) from public.handicap_review_evidence) <> 74 or (select count(*) from public.handicap_review_decisions) <> 74 then raise exception 'Phase 144 baseline counts changed'; end if;
  if (select count(*) from public.handicap_publishable_rating_snapshots) <> 0 or (select count(*) from public.handicap_publishable_index_snapshots) <> 0 then raise exception 'publishable data is not empty'; end if;
end $$;
select 'phase144_public_profile_preflight_passed' as status; rollback;

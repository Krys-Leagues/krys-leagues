-- PHASE 141 PUBLIC PROFILE RPC READ-ONLY PREFLIGHT; DO NOT EXECUTE AS A WRITE.
begin; set transaction read only;
do $$ begin
  if to_regnamespace('handicap_private') is null then raise exception 'handicap_private schema missing'; end if;
  if to_regclass('public.players') is null or to_regclass('public.handicap_publishable_index_snapshots') is null then raise exception 'public profile dependencies missing'; end if;
  if to_regprocedure('public.get_published_handicap_for_player(uuid)') is null then raise exception 'identity-bound self-read RPC missing'; end if;
  if to_regprocedure('public.get_public_published_handicap_for_player(uuid)') is not null or to_regprocedure('handicap_private.get_public_published_handicap_for_player(uuid)') is not null then raise exception 'public profile RPC already exists'; end if;
  if has_table_privilege('anon', 'public.handicap_index_snapshots', 'SELECT') or has_table_privilege('authenticated', 'public.handicap_index_snapshots', 'SELECT') or has_table_privilege('anon', 'public.handicap_publishable_index_snapshots', 'SELECT') or has_table_privilege('authenticated', 'public.handicap_publishable_index_snapshots', 'SELECT') then raise exception 'direct client snapshot access is not denied'; end if;
  if (select count(*) from public.handicap_calculation_runs) <> 5 or (select count(*) from public.handicap_source_provenance) <> 28672 or (select count(*) from public.handicap_rating_snapshots) <> 427 or (select count(*) from public.handicap_index_snapshots) <> 157 then raise exception 'Phase 141 baseline counts changed'; end if;
  if (select count(*) from public.handicap_publishable_rating_snapshots) <> 0 or (select count(*) from public.handicap_publishable_index_snapshots) <> 0 then raise exception 'publishable data is not empty'; end if;
end $$;
select 'phase141_public_profile_read_preflight_passed' as status; rollback;

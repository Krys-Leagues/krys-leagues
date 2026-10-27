-- PHASE 144 READ-ONLY PRODUCTION POSTFLIGHT; execute only after separately authorized installation.
begin; set transaction read only;
do $$ declare fn_owner text; fn_acl aclitem[]; begin
  select pg_get_userbyid(p.proowner), p.proacl into fn_owner, fn_acl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='get_public_published_handicap_for_player' and pg_get_function_identity_arguments(p.oid)='p_player_id uuid';
  if fn_owner is distinct from 'postgres' then raise exception 'public profile RPC owner is not postgres'; end if;
  if to_regprocedure('public.get_public_published_handicap_for_player(uuid)') is null then raise exception 'public profile RPC missing'; end if;
  if to_regprocedure('handicap_private.get_public_published_handicap_for_player(uuid)') is not null then raise exception 'private helper must not exist'; end if;
  if not has_function_privilege('anon', 'public.get_public_published_handicap_for_player(uuid)', 'EXECUTE') or not has_function_privilege('authenticated', 'public.get_public_published_handicap_for_player(uuid)', 'EXECUTE') then raise exception 'approved public RPC grants missing'; end if;
  if has_function_privilege('public', 'public.get_public_published_handicap_for_player(uuid)', 'EXECUTE') then raise exception 'PUBLIC execute grant must remain revoked'; end if;
  if has_table_privilege('anon', 'public.handicap_index_snapshots', 'SELECT') or has_table_privilege('authenticated', 'public.handicap_index_snapshots', 'SELECT') or has_table_privilege('anon', 'public.handicap_publishable_index_snapshots', 'SELECT') or has_table_privilege('authenticated', 'public.handicap_publishable_index_snapshots', 'SELECT') then raise exception 'direct client snapshot access was broadened'; end if;
  if (select count(*) from public.handicap_calculation_runs) <> 5 or (select count(*) from public.handicap_source_provenance) <> 28672 or (select count(*) from public.handicap_rating_snapshots) <> 427 or (select count(*) from public.handicap_index_snapshots) <> 157 or (select count(*) from public.handicap_review_evidence) <> 74 or (select count(*) from public.handicap_review_decisions) <> 74 then raise exception 'Phase 144 counts changed'; end if;
  if (select count(*) from public.handicap_publishable_rating_snapshots) <> 0 or (select count(*) from public.handicap_publishable_index_snapshots) <> 0 then raise exception 'publication state changed'; end if;
end $$;
select 'phase144_public_profile_postflight_passed' as status; rollback;

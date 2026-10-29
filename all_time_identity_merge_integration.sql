-- Install only after player_identity_foundation.sql, player_identity_merge.sql,
-- and all_time_records_foundation.sql. Definition-only installation; no merge is run.
begin;

create or replace function public.reconcile_all_time_player_identity_link()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_canonical_player_id uuid;
  v_course_id uuid;
  v_base_map text;
  v_individual_winner public.all_time_best_records%rowtype;
  v_combined_winner public.all_time_combined_best_records%rowtype;
begin
  v_canonical_player_id := public.resolve_canonical_player_id(new.canonical_player_id);
  if v_canonical_player_id is null then
    raise exception 'All-Time merge reconciliation could not resolve the canonical player';
  end if;

  -- Serialize All-Time imports and identity-family reconciliation with the
  -- existing central merge lock. This trigger runs in that merge transaction.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('site-player-identity-merge', 0)
  );

  -- Preserve every source observation while moving its current ownership to
  -- the canonical KEEP UUID. Names, scores, fingerprints, and provenance stay intact.
  update public.all_time_record_observations as observation
  set player_id = v_canonical_player_id
  where observation.player_id is not null
    and observation.player_id <> v_canonical_player_id
    and public.resolve_canonical_player_id(observation.player_id) = v_canonical_player_id;

  update public.all_time_combined_observations as observation
  set player_id = v_canonical_player_id
  where observation.player_id is not null
    and observation.player_id <> v_canonical_player_id
    and public.resolve_canonical_player_id(observation.player_id) = v_canonical_player_id;

  -- Current individual best is derived state. Rebuild one row per affected
  -- Easy/Hard course, selecting the lowest score across the whole family.
  for v_course_id in
    select distinct best.course_id
    from public.all_time_best_records as best
    where public.resolve_canonical_player_id(best.player_id) = v_canonical_player_id
  loop
    select best.*
    into strict v_individual_winner
    from public.all_time_best_records as best
    where best.course_id = v_course_id
      and public.resolve_canonical_player_id(best.player_id) = v_canonical_player_id
    order by best.score asc, best.updated_at asc, best.id asc
    limit 1;

    delete from public.all_time_best_records as best
    where best.course_id = v_course_id
      and public.resolve_canonical_player_id(best.player_id) = v_canonical_player_id;

    insert into public.all_time_best_records (
      id, course_id, player_id, best_observation_id, score,
      historical_player_name, first_recorded_at, updated_at
    ) values (
      v_individual_winner.id,
      v_individual_winner.course_id,
      v_canonical_player_id,
      v_individual_winner.best_observation_id,
      v_individual_winner.score,
      v_individual_winner.historical_player_name,
      v_individual_winner.first_recorded_at,
      now()
    );
  end loop;

  -- Combined best contains verified official state only. Rebuild one row per
  -- affected map using its generated combined_score (Easy + Hard).
  for v_base_map in
    select distinct best.base_map
    from public.all_time_combined_best_records as best
    where public.resolve_canonical_player_id(best.player_id) = v_canonical_player_id
  loop
    select best.*
    into strict v_combined_winner
    from public.all_time_combined_best_records as best
    where best.base_map = v_base_map
      and public.resolve_canonical_player_id(best.player_id) = v_canonical_player_id
    order by best.combined_score asc, best.updated_at asc, best.id asc
    limit 1;

    delete from public.all_time_combined_best_records as best
    where best.base_map = v_base_map
      and public.resolve_canonical_player_id(best.player_id) = v_canonical_player_id;

    insert into public.all_time_combined_best_records (
      id, base_map, player_id, best_observation_id, easy_score, hard_score,
      historical_player_name, source_authority, first_recorded_at, updated_at
    ) values (
      v_combined_winner.id,
      v_combined_winner.base_map,
      v_canonical_player_id,
      v_combined_winner.best_observation_id,
      v_combined_winner.easy_score,
      v_combined_winner.hard_score,
      v_combined_winner.historical_player_name,
      v_combined_winner.source_authority,
      v_combined_winner.first_recorded_at,
      now()
    );
  end loop;

  return null;
end;
$function$;

revoke all on function public.reconcile_all_time_player_identity_link()
from public, anon, authenticated;

drop trigger if exists reconcile_all_time_player_identity_link
  on public.player_identity_links;
create constraint trigger reconcile_all_time_player_identity_link
after insert or update
on public.player_identity_links
deferrable initially deferred
for each row execute function public.reconcile_all_time_player_identity_link();

-- Definition-only dependency check. It creates no records and runs no merge.
do $all_time_identity_integration_check$
begin
  if to_regprocedure('public.resolve_canonical_player_id(uuid)') is null
     or to_regclass('public.player_identity_links') is null
     or to_regclass('public.all_time_record_observations') is null
     or to_regclass('public.all_time_best_records') is null
     or to_regclass('public.all_time_combined_observations') is null
     or to_regclass('public.all_time_combined_best_records') is null then
    raise exception 'Install Identity and All-Time foundations before the All-Time merge integration';
  end if;
end;
$all_time_identity_integration_check$;

commit;

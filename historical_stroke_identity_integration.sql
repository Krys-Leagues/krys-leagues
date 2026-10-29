begin;

-- Historical Stroke consumes the shared Global Players / Identity system.
-- Frozen historical names and historical statistics are never rewritten here.

create or replace function public.remember_verified_player_alias(
  p_player_id uuid,
  p_alias text
)
returns table(
  canonical_player_id uuid,
  alias text,
  normalized_alias text,
  verified boolean,
  idempotent boolean,
  status text
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_canonical_player_id uuid;
  v_alias text;
  v_normalized_alias text;
  v_verified_canonical_ids uuid[];
  v_existing_alias public.player_aliases%rowtype;
begin
  if v_user_id is null or not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode = '42501';
  end if;
  if p_player_id is null or not exists (
    select 1 from public.players as player where player.id = p_player_id
  ) then
    raise exception 'Selected player does not exist';
  end if;

  v_alias := btrim(p_alias);
  if p_alias is null or v_alias = '' then raise exception 'Alias is required'; end if;
  v_normalized_alias := public.normalize_player_identity_name(v_alias);
  if v_normalized_alias is null or v_normalized_alias = '' then
    raise exception 'Alias must contain at least one letter or number';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('site-player-identity-merge', 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('verified-player-alias:' || v_normalized_alias, 0)
  );

  v_canonical_player_id := public.resolve_canonical_player_id(p_player_id);
  if v_canonical_player_id is null or not exists (
    select 1 from public.players as player where player.id = v_canonical_player_id
  ) then
    raise exception 'Selected player identity could not be resolved canonically';
  end if;

  perform 1
  from public.player_aliases as alias_row
  where public.normalize_player_identity_name(alias_row.normalized_alias) = v_normalized_alias
  order by alias_row.id
  for update;

  select array_agg(distinct public.resolve_canonical_player_id(alias_row.player_id)
                   order by public.resolve_canonical_player_id(alias_row.player_id))
  into v_verified_canonical_ids
  from public.player_aliases as alias_row
  where alias_row.verified
    and public.normalize_player_identity_name(alias_row.normalized_alias) = v_normalized_alias;

  if exists (
    select 1
    from unnest(coalesce(v_verified_canonical_ids, array[]::uuid[])) as existing_id
    where existing_id is null or existing_id <> v_canonical_player_id
  ) then
    raise exception
      'Verified alias "%" already belongs to a different canonical player identity', v_alias
      using errcode = '23505';
  end if;

  if v_canonical_player_id = any(coalesce(v_verified_canonical_ids, array[]::uuid[])) then
    return query select v_canonical_player_id, v_alias, v_normalized_alias,
      true, true, 'already_verified_same_identity'::text;
    return;
  end if;

  select alias_row.* into v_existing_alias
  from public.player_aliases as alias_row
  where alias_row.player_id = v_canonical_player_id and alias_row.alias = v_alias
  for update;

  if found then
    update public.player_aliases as alias_row
    set normalized_alias = v_normalized_alias,
        source = 'historical_alias',
        verified = true
    where alias_row.id = v_existing_alias.id;
  else
    insert into public.player_aliases(player_id, alias, normalized_alias, source, verified)
    values (v_canonical_player_id, v_alias, v_normalized_alias, 'historical_alias', true);
  end if;

  return query select v_canonical_player_id, v_alias, v_normalized_alias,
    true, false, 'created'::text;
end;
$function$;

revoke all on function public.remember_verified_player_alias(uuid, text)
  from public, anon, authenticated;
grant execute on function public.remember_verified_player_alias(uuid, text)
  to authenticated;

create or replace function public.set_historical_stroke_standing_identity(
  p_historical_stroke_standing_id uuid,
  p_player_id uuid,
  p_resolution_note text default null
)
returns table(
  historical_stroke_standing_id uuid,
  player_id uuid,
  historical_display_name text,
  identity_reviewed_at timestamptz,
  identity_reviewed_by uuid
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_standing public.historical_stroke_standings%rowtype;
  v_canonical_id uuid;
begin
  if v_user_id is null or not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode = '42501';
  end if;
  if p_historical_stroke_standing_id is null then
    raise exception 'Historical Stroke standing ID is required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('site-player-identity-merge', 0)
  );
  select standing.* into v_standing
  from public.historical_stroke_standings as standing
  where standing.id = p_historical_stroke_standing_id
  for update;
  if not found then raise exception 'Historical Stroke standing was not found'; end if;

  if p_player_id is not null then
    if not exists (select 1 from public.players as player where player.id = p_player_id) then
      raise exception 'Approved player was not found';
    end if;
    v_canonical_id := public.resolve_canonical_player_id(p_player_id);
    if v_canonical_id is null or not exists (
      select 1 from public.players as player where player.id = v_canonical_id
    ) then
      raise exception 'Approved player identity could not be resolved canonically';
    end if;

    -- The global RPC rejects cross-canonical verified-alias conflicts. Because
    -- this call and the standing update share one transaction, either both the
    -- global evidence and local UUID link succeed or neither does.
    perform public.remember_verified_player_alias(
      v_canonical_id,
      v_standing.historical_display_name
    );
  end if;

  update public.historical_stroke_standings as standing
  set player_id = v_canonical_id,
      identity_reviewed_at = now(),
      identity_reviewed_by = v_user_id,
      identity_resolution_note = nullif(btrim(p_resolution_note), '')
  where standing.id = v_standing.id
  returning standing.* into v_standing;

  return query select v_standing.id, v_standing.player_id,
    v_standing.historical_display_name, v_standing.identity_reviewed_at,
    v_standing.identity_reviewed_by;
end;
$function$;

revoke all on function public.set_historical_stroke_standing_identity(uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function public.set_historical_stroke_standing_identity(uuid,uuid,text)
  to authenticated;

-- Canonical identity links are the authoritative merge event. Move only the
-- nullable UUID reference; never touch the frozen name or historical totals.
create or replace function public.canonicalize_historical_stroke_player_links()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  update public.historical_stroke_standings as standing
  set player_id = public.resolve_canonical_player_id(standing.player_id)
  where standing.player_id is not null
    and standing.player_id is distinct from public.resolve_canonical_player_id(standing.player_id);
  return null;
end;
$function$;

revoke all on function public.canonicalize_historical_stroke_player_links()
  from public, anon, authenticated;

drop trigger if exists canonicalize_historical_stroke_links_after_identity_merge
  on public.player_identity_links;
create trigger canonicalize_historical_stroke_links_after_identity_merge
after insert or update of canonical_player_id
on public.player_identity_links
for each statement
execute function public.canonicalize_historical_stroke_player_links();

-- Preserve the existing merge-preview signature. Historical Stroke links are
-- included in its established approved_history_count aggregate.
create or replace function public.preview_site_player_identity_merge(
  p_keep_player_id uuid,
  p_merge_player_ids uuid[]
)
returns table(
  keep_player_id uuid,
  keep_screen_name text,
  keep_discord_linked boolean,
  merging_players jsonb,
  aliases_to_create text[],
  results_count bigint,
  schedule_count bigint,
  league_membership_count bigint,
  tournament_entry_count bigint,
  roster_reference_count bigint,
  transition_reference_count bigint,
  trophy_count bigint,
  approved_history_count bigint
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_merge_ids uuid[];
begin
  if not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required';
  end if;
  if p_keep_player_id is null then raise exception 'The canonical player to keep is required'; end if;
  select array_agg(distinct value order by value) into v_merge_ids
  from unnest(p_merge_player_ids) as value
  where value is not null and value <> p_keep_player_id;
  if coalesce(cardinality(v_merge_ids), 0) < 1 then
    raise exception 'Select at least one different player to merge';
  end if;
  if not exists (select 1 from public.players as player where player.id = p_keep_player_id) then
    raise exception 'The canonical player to keep does not exist';
  end if;
  if (select count(*) from public.players as player where player.id = any(v_merge_ids))
       <> cardinality(v_merge_ids) then
    raise exception 'One or more selected players to merge do not exist';
  end if;

  return query
  select
    keep_player.id,
    keep_player.screen_name,
    nullif(btrim(keep_player.discord_id), '') is not null,
    (select jsonb_agg(jsonb_build_object(
       'id', merging_player.id,
       'screen_name', merging_player.screen_name,
       'discord_linked', nullif(btrim(merging_player.discord_id), '') is not null
     ) order by merging_player.screen_name, merging_player.id)
     from public.players as merging_player where merging_player.id = any(v_merge_ids)),
    (select coalesce(array_agg(distinct merging_player.screen_name order by merging_player.screen_name), array[]::text[])
     from public.players as merging_player
     where merging_player.id = any(v_merge_ids)
       and merging_player.screen_name is distinct from keep_player.screen_name),
    ((select count(*) from public.results as result
      where result.player1_id = any(v_merge_ids) or result.player2_id = any(v_merge_ids))
     + (select count(*) from public.pyp_managed_results as result
        where result.home_player_id = any(v_merge_ids) or result.away_player_id = any(v_merge_ids))),
    (select count(*) from public.schedule as fixture
     where fixture.player1_id = any(v_merge_ids) or fixture.player2_id = any(v_merge_ids)
        or fixture.pyp_home_player_id = any(v_merge_ids) or fixture.pyp_away_player_id = any(v_merge_ids)),
    (select count(*) from public.player_league_memberships as membership where membership.player_id = any(v_merge_ids)),
    (select count(*) from public.player_tournament_entries as entry where entry.player_id = any(v_merge_ids)),
    ((select count(*) from public.stroke_division_roster_slots as slot where slot.player_id = any(v_merge_ids))
     + (select count(*) from public.match_division_roster_slots as slot where slot.player_id = any(v_merge_ids))
     + (select count(*) from public.pyp_division_roster_slots as slot where slot.player_id = any(v_merge_ids))),
    ((select count(*) from public.stroke_final_scorecard_player_decisions as decision where decision.player_id = any(v_merge_ids))
     + (select count(*) from public.match_final_scorecard_player_decisions as decision where decision.player_id = any(v_merge_ids))
     + (select count(*) from public.pyp_final_scorecard_player_decisions as decision where decision.player_id = any(v_merge_ids))),
    (select count(*) from public.player_trophies as trophy where trophy.player_id = any(v_merge_ids)),
    ((select count(*) from public.stroke_final_scorecard_entries as entry
      join public.stroke_final_scorecards as card on card.id = entry.scorecard_id
      where entry.player_id = any(v_merge_ids) and card.status = 'approved')
     + (select count(*) from public.match_final_scorecard_entries as entry
        join public.match_final_scorecards as card on card.id = entry.scorecard_id
        where entry.player_id = any(v_merge_ids) and card.status = 'approved')
     + (select count(*) from public.pyp_final_scorecard_entries as entry
        join public.pyp_final_scorecards as card on card.id = entry.scorecard_id
        where entry.player_id = any(v_merge_ids) and card.status = 'approved')
     + (select count(*) from public.historical_stroke_standings as standing
        where standing.player_id = any(v_merge_ids)))
  from public.players as keep_player
  where keep_player.id = p_keep_player_id;
end;
$function$;

revoke all on function public.preview_site_player_identity_merge(uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.preview_site_player_identity_merge(uuid, uuid[])
  to authenticated;

-- Definition-only checks. They inspect catalogs and create no historical data.
do $historical_stroke_identity_integration_check$
declare
  v_set_definition text;
  v_merge_definition text;
  v_preview_definition text;
begin
  if to_regprocedure('public.remember_verified_player_alias(uuid,text)') is null
     or to_regprocedure('public.set_historical_stroke_standing_identity(uuid,uuid,text)') is null
     or to_regprocedure('public.canonicalize_historical_stroke_player_links()') is null then
    raise exception 'Historical Stroke Global Identity functions are incomplete';
  end if;

  select pg_catalog.pg_get_functiondef(
    'public.set_historical_stroke_standing_identity(uuid,uuid,text)'::regprocedure
  ) into v_set_definition;
  select pg_catalog.pg_get_functiondef(
    'public.canonicalize_historical_stroke_player_links()'::regprocedure
  ) into v_merge_definition;
  select pg_catalog.pg_get_functiondef(
    'public.preview_site_player_identity_merge(uuid,uuid[])'::regprocedure
  ) into v_preview_definition;

  if v_set_definition not like '%public.remember_verified_player_alias%'
     or v_set_definition like '%historical_display_name =%'
     or v_merge_definition not like '%set player_id =%'
     or v_merge_definition like '%historical_display_name%'
     or v_merge_definition like '%played =%'
     or v_merge_definition like '%points =%'
     or v_merge_definition like '%strokes =%'
     or v_preview_definition not like '%public.historical_stroke_standings%' then
    raise exception 'Historical Stroke identity integration failed its isolation checks';
  end if;
end;
$historical_stroke_identity_integration_check$;

commit;

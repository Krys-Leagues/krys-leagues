begin;

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

  if p_keep_player_id is null then
    raise exception 'The canonical player to keep is required';
  end if;

  select array_agg(distinct value order by value)
  into v_merge_ids
  from unnest(p_merge_player_ids) as value
  where value is not null and value <> p_keep_player_id;

  if coalesce(cardinality(v_merge_ids), 0) < 1 then
    raise exception 'Select at least one different player to merge';
  end if;

  if not exists (select 1 from public.players as player where player.id = p_keep_player_id) then
    raise exception 'The canonical player to keep does not exist';
  end if;

  if (select count(*) from public.players as player where player.id = any(v_merge_ids)) <> cardinality(v_merge_ids) then
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
    (
      (select count(*) from public.stroke_division_roster_slots as slot where slot.player_id = any(v_merge_ids))
      + (select count(*) from public.match_division_roster_slots as slot where slot.player_id = any(v_merge_ids))
      + (select count(*) from public.pyp_division_roster_slots as slot where slot.player_id = any(v_merge_ids))
    ),
    (
      (select count(*) from public.stroke_final_scorecard_player_decisions as decision where decision.player_id = any(v_merge_ids))
      + (select count(*) from public.match_final_scorecard_player_decisions as decision where decision.player_id = any(v_merge_ids))
      + (select count(*) from public.pyp_final_scorecard_player_decisions as decision where decision.player_id = any(v_merge_ids))
    ),
    (select count(*) from public.player_trophies as trophy where trophy.player_id = any(v_merge_ids)),
    (
      (select count(*) from public.stroke_final_scorecard_entries as entry
       join public.stroke_final_scorecards as card on card.id = entry.scorecard_id
       where entry.player_id = any(v_merge_ids) and card.status = 'approved')
      + (select count(*) from public.match_final_scorecard_entries as entry
         join public.match_final_scorecards as card on card.id = entry.scorecard_id
         where entry.player_id = any(v_merge_ids) and card.status = 'approved')
      + (select count(*) from public.pyp_final_scorecard_entries as entry
         join public.pyp_final_scorecards as card on card.id = entry.scorecard_id
         where entry.player_id = any(v_merge_ids) and card.status = 'approved')
    )
  from public.players as keep_player
  where keep_player.id = p_keep_player_id;
end;
$function$;

revoke all on function public.preview_site_player_identity_merge(uuid, uuid[]) from public;
revoke all on function public.preview_site_player_identity_merge(uuid, uuid[]) from anon;
revoke all on function public.preview_site_player_identity_merge(uuid, uuid[]) from authenticated;
grant execute on function public.preview_site_player_identity_merge(uuid, uuid[]) to authenticated;

create or replace function public.merge_site_player_identities(
  p_keep_player_id uuid,
  p_merge_player_ids uuid[]
)
returns table(
  canonical_player_id uuid,
  canonical_screen_name text,
  merged_player_ids uuid[],
  aliases_created text[]
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_merge_ids uuid[];
  v_keep_name text;
  v_keep_discord_id text;
  v_keep_discord_name text;
  v_keep_discord_username text;
  v_final_discord_id text;
  v_final_discord_name text;
  v_distinct_discord_ids text[];
  v_aliases text[] := array[]::text[];
  v_alias_row record;
  v_inserted_alias_id uuid;
begin
  if not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required';
  end if;

  if p_keep_player_id is null then
    raise exception 'The canonical player to keep is required';
  end if;

  select array_agg(distinct value order by value)
  into v_merge_ids
  from unnest(p_merge_player_ids) as value
  where value is not null and value <> p_keep_player_id;

  if coalesce(cardinality(v_merge_ids), 0) < 1 then
    raise exception 'Select at least one different player to merge';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('site-player-identity-merge', 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('site-player-discord-identity', 0)
  );

  perform 1
  from public.players as player
  where player.id = p_keep_player_id or player.id = any(v_merge_ids)
  order by player.id
  for update;

  if (select count(*) from public.players as player
      where player.id = p_keep_player_id or player.id = any(v_merge_ids))
     <> cardinality(v_merge_ids) + 1 then
    raise exception 'One or more selected players do not exist';
  end if;

  perform 1
  from public.major_events as event
  where exists (
    select 1
    from public.major_entries as entry
    where entry.major_event_id = event.id
      and (entry.player_id = p_keep_player_id
           or entry.player_id = any(v_merge_ids))
  )
  order by event.id
  for update;

  perform 1
  from public.major_scoring_sessions as session
  where exists (
    select 1
    from public.major_scoring_participants as participant
    where participant.session_id = session.id
      and (participant.player_id = p_keep_player_id
           or participant.player_id = any(v_merge_ids))
  )
  order by session.id
  for update;

  perform 1
  from public.major_entries as entry
  where entry.player_id = p_keep_player_id
     or entry.player_id = any(v_merge_ids)
  order by entry.id
  for update;

  perform 1
  from public.major_scoring_participants as participant
  where participant.player_id = p_keep_player_id
     or participant.player_id = any(v_merge_ids)
  order by participant.id
  for update;

  if exists (
    select entry.major_event_id
    from public.major_entries as entry
    where entry.player_id = p_keep_player_id
       or entry.player_id = any(v_merge_ids)
    group by entry.major_event_id
    having count(distinct entry.player_id) > 1
  ) then
    raise exception 'Two selected identities have entries in the same Major event; review those entries before merging';
  end if;

  if exists (
    select participant.session_id
    from public.major_scoring_participants as participant
    where participant.player_id = p_keep_player_id
       or participant.player_id = any(v_merge_ids)
    group by participant.session_id
    having count(distinct participant.player_id) > 1
  ) then
    raise exception 'Two selected identities participate in the same Major scoring session; review that session before merging';
  end if;

  if exists (
    select 1 from public.player_identity_links as link
    where link.historical_player_id = p_keep_player_id
  ) then
    raise exception 'The selected KEEP player is already merged into another canonical player';
  end if;

  if exists (
    select 1 from public.player_identity_links as link
    where link.historical_player_id = any(v_merge_ids)
  ) then
    raise exception 'One or more selected MERGE players are already retired identities';
  end if;

  if exists (
    select entry.scorecard_id
    from public.stroke_final_scorecard_entries as entry
    join public.stroke_final_scorecards as card on card.id = entry.scorecard_id
    where card.status = 'approved'
      and (entry.player_id = p_keep_player_id or entry.player_id = any(v_merge_ids))
    group by entry.scorecard_id
    having count(distinct entry.player_id) > 1
  ) or exists (
    select entry.scorecard_id
    from public.match_final_scorecard_entries as entry
    join public.match_final_scorecards as card on card.id = entry.scorecard_id
    where card.status = 'approved'
      and (entry.player_id = p_keep_player_id or entry.player_id = any(v_merge_ids))
    group by entry.scorecard_id
    having count(distinct entry.player_id) > 1
  ) or exists (
    select entry.scorecard_id
    from public.pyp_final_scorecard_entries as entry
    join public.pyp_final_scorecards as card on card.id = entry.scorecard_id
    where card.status = 'approved'
      and (entry.player_id = p_keep_player_id or entry.player_id = any(v_merge_ids))
    group by entry.scorecard_id
    having count(distinct entry.player_id) > 1
  ) then
    raise exception 'Two selected identities appear in the same approved Final Scorecard; resolve that historical conflict before merging';
  end if;

  if exists (
    select 1 from public.stroke_division_roster_slots as slot
    join public.stroke_roster_versions as roster on roster.id = slot.roster_version_id
    where slot.player_id = any(v_merge_ids) and roster.status in ('draft', 'approved')
  ) or exists (
    select 1 from public.match_division_roster_slots as slot
    join public.match_roster_versions as roster on roster.id = slot.roster_version_id
    where slot.player_id = any(v_merge_ids) and roster.status in ('draft', 'approved')
  ) or exists (
    select 1 from public.pyp_division_roster_slots as slot
    join public.pyp_roster_versions as roster on roster.id = slot.roster_version_id
    where slot.player_id = any(v_merge_ids) and roster.status in ('draft', 'approved')
  ) then
    raise exception 'A selected duplicate is still assigned to a current draft/approved managed roster; replace it with the KEEP player through the protected roster workflow first';
  end if;

  select player.screen_name,
         nullif(btrim(player.discord_id), ''),
         nullif(btrim(player.discord_name), ''),
         nullif(btrim(player.discord_username), '')
  into v_keep_name, v_keep_discord_id, v_keep_discord_name, v_keep_discord_username
  from public.players as player
  where player.id = p_keep_player_id;

  select array_agg(distinct discord_id order by discord_id)
  into v_distinct_discord_ids
  from (
    select nullif(btrim(player.discord_id), '') as discord_id
    from public.players as player
    where player.id = p_keep_player_id or player.id = any(v_merge_ids)
    union
    select nullif(btrim(member.discord_id), '')
    from public.discord_members as member
    where member.player_id = p_keep_player_id or member.player_id = any(v_merge_ids)
  ) as identity
  where discord_id is not null;

  if coalesce(cardinality(v_distinct_discord_ids), 0) > 1 then
    raise exception 'The selected players have conflicting Discord identities and cannot be merged';
  end if;

  v_final_discord_id := coalesce(v_keep_discord_id, v_distinct_discord_ids[1]);

  select coalesce(
    v_keep_discord_name,
    v_keep_discord_username,
    max(nullif(btrim(player.discord_name), '')),
    max(nullif(btrim(player.discord_username), ''))
  )
  into v_final_discord_name
  from public.players as player
  where player.id = any(v_merge_ids);

  if v_final_discord_id is not null and exists (
    select 1 from public.players as other_player
    where other_player.id <> p_keep_player_id
      and not (other_player.id = any(v_merge_ids))
      and nullif(btrim(other_player.discord_id), '') = v_final_discord_id
  ) then
    raise exception 'The preserved Discord identity belongs to another player outside this merge';
  end if;

  select coalesce(array_agg(distinct player.screen_name order by player.screen_name), array[]::text[])
  into v_aliases
  from public.players as player
  where player.id = any(v_merge_ids)
    and player.screen_name is distinct from v_keep_name;

  delete from public.player_identity_not_matches as rejection
  where (rejection.player1_id = p_keep_player_id or rejection.player1_id = any(v_merge_ids))
    and (rejection.player2_id = p_keep_player_id or rejection.player2_id = any(v_merge_ids));

  for v_alias_row in
    select alias_row.id,
           alias_row.alias,
           alias_row.verified
    from public.player_aliases as alias_row
    where alias_row.player_id = any(v_merge_ids)
    order by alias_row.id
    for update
  loop
    if exists (
      select 1
      from public.player_aliases as existing_alias
      where existing_alias.player_id = p_keep_player_id
        and existing_alias.alias = v_alias_row.alias
    ) then
      update public.player_aliases as existing_alias
      set verified = existing_alias.verified or v_alias_row.verified
      where existing_alias.player_id = p_keep_player_id
        and existing_alias.alias = v_alias_row.alias;

      delete from public.player_aliases as alias_row
      where alias_row.id = v_alias_row.id;
    else
      update public.player_aliases as alias_row
      set player_id = p_keep_player_id
      where alias_row.id = v_alias_row.id;
    end if;
  end loop;

  for v_alias_row in
    select player.screen_name as alias,
           public.normalize_player_identity_name(player.screen_name) as normalized_alias
    from public.players as player
    where player.id = any(v_merge_ids)
      and player.screen_name is distinct from v_keep_name
    order by player.id
  loop
    if exists (
      select 1
      from public.player_aliases as existing_alias
      where existing_alias.player_id = p_keep_player_id
        and existing_alias.alias = v_alias_row.alias
    ) then
      update public.player_aliases as existing_alias
      set verified = true
      where existing_alias.player_id = p_keep_player_id
        and existing_alias.alias = v_alias_row.alias;
    else
      v_inserted_alias_id := null;

      insert into public.player_aliases(
        player_id, alias, normalized_alias, source, verified
      )
      values (
        p_keep_player_id,
        v_alias_row.alias,
        v_alias_row.normalized_alias,
        'historical_alias',
        true
      )
      on conflict do nothing
      returning id into v_inserted_alias_id;

      if v_inserted_alias_id is null and not exists (
        select 1
        from public.player_aliases as existing_alias
        where existing_alias.player_id = p_keep_player_id
          and existing_alias.alias = v_alias_row.alias
      ) then
        raise exception 'Could not preserve retiring player alias % because it conflicts with an existing alias constraint', v_alias_row.alias;
      end if;
    end if;
  end loop;

  insert into public.player_identity_links(
    historical_player_id, canonical_player_id, merged_at, merged_by
  )
  select merge_id, p_keep_player_id, now(), auth.uid()
  from unnest(v_merge_ids) as merge_id;

  update public.player_identity_links as link
  set canonical_player_id = p_keep_player_id,
      merged_at = now(),
      merged_by = auth.uid()
  where link.canonical_player_id = any(v_merge_ids);

  update public.discord_members as member
  set player_id = p_keep_player_id
  where member.player_id = any(v_merge_ids);

  update public.major_entries as entry
  set player_id = p_keep_player_id
  from public.major_events as event
  where event.id = entry.major_event_id
    and entry.player_id = any(v_merge_ids)
    and event.status not in ('complete', 'cancelled');

  update public.major_scoring_participants as participant
  set player_id = p_keep_player_id
  from public.major_scoring_sessions as session
  where session.id = participant.session_id
    and participant.player_id = any(v_merge_ids)
    and session.is_active;

  update public.players as player
  set discord_id = null,
      discord_name = null,
      active = false,
      status = 'archived'
  where player.id = any(v_merge_ids);

  update public.players as player
  set discord_id = v_final_discord_id,
      discord_name = v_final_discord_name
  where player.id = p_keep_player_id;

  return query select p_keep_player_id, v_keep_name, v_merge_ids, v_aliases;
end;
$function$;

revoke all on function public.merge_site_player_identities(uuid, uuid[]) from public;
revoke all on function public.merge_site_player_identities(uuid, uuid[]) from anon;
revoke all on function public.merge_site_player_identities(uuid, uuid[]) from authenticated;
grant execute on function public.merge_site_player_identities(uuid, uuid[]) to authenticated;

create or replace function public.merge_site_player_identity(
  p_keep_player_id uuid,
  p_merge_player_id uuid
)
returns table(
  kept_player_id uuid,
  kept_player_name text,
  removed_player_id uuid,
  removed_player_name text,
  affected_stroke_season_ids uuid[],
  affected_stroke_season_numbers integer[],
  affected_season_count integer
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_keep_name text;
  v_merge_name text;
begin
  if not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required';
  end if;

  select player.screen_name into v_keep_name
  from public.players as player where player.id = p_keep_player_id;
  select player.screen_name into v_merge_name
  from public.players as player where player.id = p_merge_player_id;

  perform public.merge_site_player_identities(p_keep_player_id, array[p_merge_player_id]);

  return query select
    p_keep_player_id, v_keep_name, p_merge_player_id, v_merge_name,
    array[]::uuid[], array[]::integer[], 0;
end;
$function$;

revoke all on function public.merge_site_player_identity(uuid, uuid) from public;
revoke all on function public.merge_site_player_identity(uuid, uuid) from anon;
revoke all on function public.merge_site_player_identity(uuid, uuid) from authenticated;
grant execute on function public.merge_site_player_identity(uuid, uuid) to authenticated;

commit;

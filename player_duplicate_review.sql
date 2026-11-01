begin;

create or replace function public.get_site_player_duplicate_candidates()
returns table(
  player1_id uuid,
  player1_screen_name text,
  player1_active boolean,
  player1_status text,
  player1_discord_linked boolean,
  player1_discord_name text,
  player1_results_count bigint,
  player1_schedule_count bigint,
  player1_membership_count bigint,
  player1_tournament_count bigint,
  player1_approved_history_count bigint,
  player1_trophy_count bigint,
  player1_aliases text[],
  player2_id uuid,
  player2_screen_name text,
  player2_active boolean,
  player2_status text,
  player2_discord_linked boolean,
  player2_discord_name text,
  player2_results_count bigint,
  player2_schedule_count bigint,
  player2_membership_count bigint,
  player2_tournament_count bigint,
  player2_approved_history_count bigint,
  player2_trophy_count bigint,
  player2_aliases text[],
  confidence integer,
  evidence text[],
  evidence_signature text
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required';
  end if;

  return query
  with player_stats as (
    select
      player.id,
      player.screen_name,
      coalesce(player.active, true) as active,
      coalesce(player.status::text, case when player.active is false then 'inactive' else 'active' end) as status,
      nullif(btrim(player.discord_id), '') as discord_id,
      coalesce(nullif(btrim(player.discord_name), ''), nullif(btrim(player.discord_username), '')) as discord_display_name,
      public.normalize_player_identity_name(player.screen_name) as normalized_name,
      lower(btrim(player.screen_name)) as casefold_name,
      ((select count(*) from public.results as result
        where result.player1_id = player.id or result.player2_id = player.id)
       + (select count(*) from public.pyp_managed_results as result
          where result.home_player_id = player.id or result.away_player_id = player.id)) as results_count,
      (select count(*) from public.schedule as fixture
       where fixture.player1_id = player.id or fixture.player2_id = player.id
          or fixture.pyp_home_player_id = player.id or fixture.pyp_away_player_id = player.id) as schedule_count,
      (select count(*) from public.player_league_memberships as membership
       where membership.player_id = player.id) as membership_count,
      (select count(*) from public.player_tournament_entries as entry
       where entry.player_id = player.id) as tournament_count,
      (
        (select count(*) from public.stroke_final_scorecard_entries as entry
         join public.stroke_final_scorecards as card on card.id = entry.scorecard_id
         where entry.player_id = player.id and card.status = 'approved')
        + (select count(*) from public.match_final_scorecard_entries as entry
           join public.match_final_scorecards as card on card.id = entry.scorecard_id
           where entry.player_id = player.id and card.status = 'approved')
        + (select count(*) from public.pyp_final_scorecard_entries as entry
           join public.pyp_final_scorecards as card on card.id = entry.scorecard_id
           where entry.player_id = player.id and card.status = 'approved')
      ) as approved_history_count,
      (select count(*) from public.player_trophies as trophy
       where trophy.player_id = player.id) as trophy_count,
      coalesce((select array_agg(alias_row.alias order by alias_row.alias)
                from public.player_aliases as alias_row
                where alias_row.player_id = player.id), array[]::text[]) as aliases
    from public.players as player
    where not exists (
      select 1 from public.player_identity_links as link
      where link.historical_player_id = player.id
    )
  ), candidate_pairs as (
    select
      left_player.*,
      right_player.id as right_id,
      right_player.screen_name as right_screen_name,
      right_player.active as right_active,
      right_player.status as right_status,
      right_player.discord_id as right_discord_id,
      right_player.discord_display_name as right_discord_display_name,
      right_player.results_count as right_results_count,
      right_player.schedule_count as right_schedule_count,
      right_player.membership_count as right_membership_count,
      right_player.tournament_count as right_tournament_count,
      right_player.approved_history_count as right_approved_history_count,
      right_player.trophy_count as right_trophy_count,
      right_player.aliases as right_aliases,
      case
        when left_player.discord_id is not null and left_player.discord_id = right_player.discord_id then 100
        when left_player.casefold_name = right_player.casefold_name then 95
        when left_player.normalized_name <> '' and left_player.normalized_name = right_player.normalized_name then 90
        when length(left_player.normalized_name) >= 4
         and length(right_player.normalized_name) >= 4
         and abs(length(left_player.normalized_name) - length(right_player.normalized_name)) <= 3
         and (left_player.normalized_name like right_player.normalized_name || '%'
              or right_player.normalized_name like left_player.normalized_name || '%') then 60
        else 0
      end as pair_confidence,
      array_remove(array[
        case when left_player.discord_id is not null and left_player.discord_id = right_player.discord_id then 'Same Discord identity' end,
        case when left_player.casefold_name = right_player.casefold_name then 'Same name ignoring capitalization/outer whitespace' end,
        case when left_player.normalized_name <> '' and left_player.normalized_name = right_player.normalized_name then 'Same normalized name' end,
        case when left_player.normalized_name <> right_player.normalized_name
               and length(left_player.normalized_name) >= 4
               and length(right_player.normalized_name) >= 4
               and abs(length(left_player.normalized_name) - length(right_player.normalized_name)) <= 3
               and (left_player.normalized_name like right_player.normalized_name || '%'
                    or right_player.normalized_name like left_player.normalized_name || '%')
             then 'Possible close name variant' end
      ], null)::text[] as pair_evidence,
      md5(concat_ws('|',
        left_player.id::text, right_player.id::text,
        coalesce(left_player.screen_name, ''), coalesce(right_player.screen_name, ''),
        coalesce(left_player.discord_id, ''), coalesce(right_player.discord_id, '')
      )) as pair_signature
    from player_stats as left_player
    join player_stats as right_player on right_player.id > left_player.id
  )
  select
    pair.id, pair.screen_name, pair.active, pair.status,
    pair.discord_id is not null, pair.discord_display_name,
    pair.results_count, pair.schedule_count, pair.membership_count,
    pair.tournament_count, pair.approved_history_count, pair.trophy_count, pair.aliases,
    pair.right_id, pair.right_screen_name, pair.right_active, pair.right_status,
    pair.right_discord_id is not null, pair.right_discord_display_name,
    pair.right_results_count, pair.right_schedule_count, pair.right_membership_count,
    pair.right_tournament_count, pair.right_approved_history_count, pair.right_trophy_count,
    pair.right_aliases, pair.pair_confidence, pair.pair_evidence, pair.pair_signature
  from candidate_pairs as pair
  where pair.pair_confidence > 0
    and not exists (
      select 1
      from public.player_identity_not_matches as rejection
      where rejection.player1_id = pair.id
        and rejection.player2_id = pair.right_id
        and rejection.evidence_signature = pair.pair_signature
    )
  order by pair.pair_confidence desc, pair.screen_name, pair.right_screen_name;
end;
$function$;

revoke all on function public.get_site_player_duplicate_candidates() from public;
revoke all on function public.get_site_player_duplicate_candidates() from anon;
revoke all on function public.get_site_player_duplicate_candidates() from authenticated;
grant execute on function public.get_site_player_duplicate_candidates() to authenticated;

create or replace function public.mark_site_players_not_match(
  p_player_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_ids uuid[];
  v_saved integer;
begin
  if not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required';
  end if;

  select array_agg(distinct value order by value)
  into v_ids
  from unnest(p_player_ids) as value
  where value is not null;

  if coalesce(cardinality(v_ids), 0) < 2 then
    raise exception 'Select at least two players to mark as different people';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('site-player-identity-merge', 0)
  );

  if (select count(*) from public.players as player where player.id = any(v_ids)) <> cardinality(v_ids) then
    raise exception 'One or more selected players do not exist';
  end if;

  insert into public.player_identity_not_matches(
    player1_id, player2_id, evidence_signature, reviewed_at, reviewed_by
  )
  select
    left_id,
    right_id,
    md5(concat_ws('|',
      left_id::text, right_id::text,
      coalesce(left_player.screen_name, ''), coalesce(right_player.screen_name, ''),
      coalesce(nullif(btrim(left_player.discord_id), ''), ''),
      coalesce(nullif(btrim(right_player.discord_id), ''), '')
    )),
    now(),
    auth.uid()
  from unnest(v_ids) as left_id
  join unnest(v_ids) as right_id on right_id > left_id
  join public.players as left_player on left_player.id = left_id
  join public.players as right_player on right_player.id = right_id
  on conflict (player1_id, player2_id) do update
  set evidence_signature = excluded.evidence_signature,
      reviewed_at = excluded.reviewed_at,
      reviewed_by = excluded.reviewed_by;

  get diagnostics v_saved = row_count;
  return v_saved;
end;
$function$;

revoke all on function public.mark_site_players_not_match(uuid[]) from public;
revoke all on function public.mark_site_players_not_match(uuid[]) from anon;
revoke all on function public.mark_site_players_not_match(uuid[]) from authenticated;
grant execute on function public.mark_site_players_not_match(uuid[]) to authenticated;

commit;

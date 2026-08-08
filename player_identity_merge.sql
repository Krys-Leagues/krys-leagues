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
  v_affected_season_ids uuid[] := array[]::uuid[];
  v_affected_season_numbers integer[] := array[]::integer[];
  v_affected_season_count integer := 0;
begin
  if not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required';
  end if;

  if p_keep_player_id is null or p_merge_player_id is null then
    raise exception 'Both the player to keep and the player to merge are required';
  end if;

  if p_keep_player_id = p_merge_player_id then
    raise exception 'The player to keep and the player to merge must be different';
  end if;

  perform 1
  from public.players as player
  where player.id in (p_keep_player_id, p_merge_player_id)
  order by player.id
  for update;

  select player.screen_name
  into v_keep_name
  from public.players as player
  where player.id = p_keep_player_id;

  if not found then
    raise exception 'The player selected to keep does not exist';
  end if;

  select player.screen_name
  into v_merge_name
  from public.players as player
  where player.id = p_merge_player_id;

  if not found then
    raise exception 'The player selected to merge does not exist';
  end if;

  if exists (
    select 1
    from public.stroke_final_scorecard_entries as entry
    join public.stroke_final_scorecards as scorecard
      on scorecard.id = entry.scorecard_id
     and scorecard.season_id = entry.season_id
    where entry.player_id = p_merge_player_id
      and scorecard.status = 'approved'
  ) then
    raise exception 'The duplicate player appears in an approved Stroke Final Scorecard and cannot be merged';
  end if;

  if exists (
    select 1
    from public.stroke_division_roster_slots as merging_slot
    join public.stroke_division_roster_slots as kept_slot
      on kept_slot.roster_version_id = merging_slot.roster_version_id
     and kept_slot.player_id = p_keep_player_id
    where merging_slot.player_id = p_merge_player_id
  ) then
    raise exception 'Both players occupy slots in the same Stroke roster version';
  end if;

  if exists (
    select 1
    from public.schedule as merging_fixture
    where (merging_fixture.player1_id = p_merge_player_id and merging_fixture.player2_id = p_keep_player_id)
       or (merging_fixture.player2_id = p_merge_player_id and merging_fixture.player1_id = p_keep_player_id)
  ) then
    raise exception 'Merging these players would create a self-match in schedule';
  end if;

  if exists (
    select 1
    from public.schedule as merging_fixture
    join public.schedule as other_fixture
      on other_fixture.id <> merging_fixture.id
     and other_fixture.season_id = merging_fixture.season_id
     and other_fixture.division_number = merging_fixture.division_number
     and least(other_fixture.player1_id, other_fixture.player2_id) = least(
       case when merging_fixture.player1_id = p_merge_player_id then p_keep_player_id else merging_fixture.player1_id end,
       case when merging_fixture.player2_id = p_merge_player_id then p_keep_player_id else merging_fixture.player2_id end
     )
     and greatest(other_fixture.player1_id, other_fixture.player2_id) = greatest(
       case when merging_fixture.player1_id = p_merge_player_id then p_keep_player_id else merging_fixture.player1_id end,
       case when merging_fixture.player2_id = p_merge_player_id then p_keep_player_id else merging_fixture.player2_id end
     )
     and lower(btrim(other_fixture.league_type)) = 'stroke'
     and other_fixture.season_id is not null
     and other_fixture.roster_version_id is not null
     and other_fixture.division_number is not null
     and other_fixture.game_number is not null
     and other_fixture.player1_id is not null
     and other_fixture.player2_id is not null
    where (merging_fixture.player1_id = p_merge_player_id or merging_fixture.player2_id = p_merge_player_id)
      and lower(btrim(merging_fixture.league_type)) = 'stroke'
      and merging_fixture.season_id is not null
      and merging_fixture.roster_version_id is not null
      and merging_fixture.division_number is not null
      and merging_fixture.game_number is not null
  ) then
    raise exception 'Merging these players would duplicate a managed Stroke schedule pairing';
  end if;

  if exists (
    select 1
    from public.results as merging_result
    where (merging_result.player1_id = p_merge_player_id and merging_result.player2_id = p_keep_player_id)
       or (merging_result.player2_id = p_merge_player_id and merging_result.player1_id = p_keep_player_id)
  ) then
    raise exception 'Merging these players would create a self-result';
  end if;

  if exists (
    select 1
    from public.matches as merging_match
    where (merging_match.player1_id = p_merge_player_id and merging_match.player2_id = p_keep_player_id)
       or (merging_match.player2_id = p_merge_player_id and merging_match.player1_id = p_keep_player_id)
  ) then
    raise exception 'Merging these players would create a self-match in matches';
  end if;

  if exists (
    select 1
    from public.results as merging_result
    join public.results as other_result
      on other_result.id <> merging_result.id
     and other_result.league_type = merging_result.league_type
     and other_result.season_number = merging_result.season_number
     and other_result.division = merging_result.division
     and other_result.game = merging_result.game
     and other_result.player1_id = case when merging_result.player1_id = p_merge_player_id then p_keep_player_id else merging_result.player1_id end
     and other_result.player2_id = case when merging_result.player2_id = p_merge_player_id then p_keep_player_id else merging_result.player2_id end
    where merging_result.player1_id = p_merge_player_id
       or merging_result.player2_id = p_merge_player_id
  ) then
    raise exception 'Merging these players would duplicate a result';
  end if;

  if exists (
    select 1
    from public.season_standings as merging_standing
    join public.season_standings as kept_standing
      on kept_standing.player_id = p_keep_player_id
     and kept_standing.league_type = merging_standing.league_type
     and kept_standing.season_number = merging_standing.season_number
    where merging_standing.player_id = p_merge_player_id
  ) then
    raise exception 'Both players have standings for the same league and season';
  end if;

  if exists (
    select 1
    from public.stroke_final_scorecard_entries as merging_entry
    join public.stroke_final_scorecard_entries as kept_entry
      on kept_entry.scorecard_id = merging_entry.scorecard_id
     and kept_entry.player_id = p_keep_player_id
    where merging_entry.player_id = p_merge_player_id
  ) then
    raise exception 'Both players appear in the same Stroke Final Scorecard';
  end if;

  if exists (
    select 1
    from public.stroke_final_scorecard_player_decisions as merging_decision
    join public.stroke_final_scorecard_player_decisions as kept_decision
      on kept_decision.final_scorecard_id = merging_decision.final_scorecard_id
     and kept_decision.player_id = p_keep_player_id
    where merging_decision.player_id = p_merge_player_id
  ) then
    raise exception 'Both players have a transition decision for the same Stroke Final Scorecard';
  end if;

  if exists (
    select 1
    from public.player_league_memberships as merging_membership
    join public.player_league_memberships as kept_membership
      on kept_membership.player_id = p_keep_player_id
     and kept_membership.league_type = merging_membership.league_type
     and kept_membership.season_number = merging_membership.season_number
     and kept_membership.division = merging_membership.division
    where merging_membership.player_id = p_merge_player_id
  ) then
    raise exception 'Both players have the same league membership';
  end if;

  if exists (
    select 1
    from public.player_tournament_entries as merging_entry
    join public.player_tournament_entries as kept_entry
      on kept_entry.player_id = p_keep_player_id
     and kept_entry.tournament_type = merging_entry.tournament_type
     and kept_entry.bracket = merging_entry.bracket
     and kept_entry.status = merging_entry.status
    where merging_entry.player_id = p_merge_player_id
  ) then
    raise exception 'Both players have the same tournament entry';
  end if;

  select
    coalesce(array_agg(affected.season_id order by affected.season_number, affected.season_id), array[]::uuid[]),
    coalesce(array_agg(affected.season_number order by affected.season_number, affected.season_id), array[]::integer[]),
    count(*)::integer
  into v_affected_season_ids, v_affected_season_numbers, v_affected_season_count
  from (
    select distinct season.id as season_id, season.season_number
    from public.stroke_roster_versions as roster
    join public.seasons as season
      on season.id = roster.season_id
    where roster.status = 'approved'
      and lower(btrim(season.league_type)) = 'stroke'
      and (
        exists (
          select 1
          from public.stroke_division_roster_slots as slot
          where slot.roster_version_id = roster.id
            and slot.player_id = p_merge_player_id
        )
        or exists (
          select 1
          from public.schedule as fixture
          where fixture.roster_version_id = roster.id
            and fixture.season_id = season.id
            and lower(btrim(fixture.league_type)) = 'stroke'
            and (fixture.player1_id = p_merge_player_id or fixture.player2_id = p_merge_player_id)
        )
      )
  ) as affected;

  if v_affected_season_count > 0 then
    perform 1
    from public.stroke_schedule_state as state
    where state.season_id = any(v_affected_season_ids)
    order by state.season_id
    for update;

    if (select count(*) from public.stroke_schedule_state as state where state.season_id = any(v_affected_season_ids)) <> v_affected_season_count then
      raise exception 'An affected approved Stroke season has no schedule workflow state';
    end if;
  end if;

  update public.stroke_division_roster_slots as slot
  set player_id = p_keep_player_id,
      player_screen_name = v_keep_name
  where slot.player_id = p_merge_player_id;

  update public.schedule as fixture
  set player1_id = case when fixture.player1_id = p_merge_player_id then p_keep_player_id else fixture.player1_id end,
      player2_id = case when fixture.player2_id = p_merge_player_id then p_keep_player_id else fixture.player2_id end,
      player1 = case when fixture.player1_id = p_merge_player_id then v_keep_name else fixture.player1 end,
      player2 = case when fixture.player2_id = p_merge_player_id then v_keep_name else fixture.player2 end,
      player1_name = case when fixture.player1_id = p_merge_player_id then v_keep_name else fixture.player1_name end,
      player2_name = case when fixture.player2_id = p_merge_player_id then v_keep_name else fixture.player2_name end
  where fixture.player1_id = p_merge_player_id
     or fixture.player2_id = p_merge_player_id;

  update public.results as result
  set player1_id = case when result.player1_id = p_merge_player_id then p_keep_player_id else result.player1_id end,
      player2_id = case when result.player2_id = p_merge_player_id then p_keep_player_id else result.player2_id end,
      player1 = case when result.player1_id = p_merge_player_id then v_keep_name else result.player1 end,
      player2 = case when result.player2_id = p_merge_player_id then v_keep_name else result.player2 end,
      winner = case when result.winner = v_merge_name then v_keep_name else result.winner end
  where result.player1_id = p_merge_player_id
     or result.player2_id = p_merge_player_id;

  update public.season_standings as standing
  set player_id = p_keep_player_id
  where standing.player_id = p_merge_player_id;

  update public.stroke_final_scorecard_entries as entry
  set player_id = p_keep_player_id,
      player_screen_name = v_keep_name
  where entry.player_id = p_merge_player_id;

  update public.stroke_final_scorecard_player_decisions as decision
  set player_id = p_keep_player_id
  where decision.player_id = p_merge_player_id;

  update public.player_league_memberships as membership
  set player_id = p_keep_player_id
  where membership.player_id = p_merge_player_id;

  update public.matches as match_row
  set player1_id = case when match_row.player1_id = p_merge_player_id then p_keep_player_id else match_row.player1_id end,
      player2_id = case when match_row.player2_id = p_merge_player_id then p_keep_player_id else match_row.player2_id end
  where match_row.player1_id = p_merge_player_id
     or match_row.player2_id = p_merge_player_id;

  update public.player_tournament_entries as entry
  set player_id = p_keep_player_id,
      player_name = v_keep_name
  where entry.player_id = p_merge_player_id;

  update public.player_aliases as alias_row
  set player_id = p_keep_player_id
  where alias_row.player_id = p_merge_player_id;

  update public.discord_members as member
  set player_id = p_keep_player_id
  where member.player_id = p_merge_player_id;

  if v_affected_season_count > 0 then
    update public.stroke_schedule_state as state
    set change_revision = state.change_revision + 1
    where state.season_id = any(v_affected_season_ids);
  end if;

  delete from public.players as player
  where player.id = p_merge_player_id;

  if not found then
    raise exception 'The duplicate player could not be removed';
  end if;

  return query
  select
    p_keep_player_id,
    v_keep_name,
    p_merge_player_id,
    v_merge_name,
    v_affected_season_ids,
    v_affected_season_numbers,
    v_affected_season_count;
end;
$function$;

revoke all on function public.merge_site_player_identity(uuid, uuid) from public;
revoke all on function public.merge_site_player_identity(uuid, uuid) from anon;
revoke all on function public.merge_site_player_identity(uuid, uuid) from authenticated;
grant execute on function public.merge_site_player_identity(uuid, uuid) to authenticated;

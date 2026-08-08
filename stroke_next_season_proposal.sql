create or replace function public.generate_stroke_next_season_proposal(
  p_final_scorecard_id uuid,
  p_target_season_id uuid,
  p_target_division_count integer,
  p_new_player_ids uuid[] default '{}'
)
returns table(
  roster_version_id uuid,
  target_season_id uuid,
  target_division_count integer,
  division_number integer,
  slot_number integer,
  player_id uuid,
  player_screen_name text,
  movement_reason text
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_scorecard public.stroke_final_scorecards%rowtype;
  v_source_season public.seasons%rowtype;
  v_target_season public.seasons%rowtype;
  v_roster public.stroke_roster_versions%rowtype;
  v_source_division_count integer;
  v_returning_count integer;
  v_new_count integer;
  v_draft_count integer;
  v_missing_decisions integer;
  v_division integer;
  v_demand integer;
  v_target integer;
  v_player record;
  v_slot integer;
begin
  if v_user_id is null then
    raise exception 'Authentication is required to generate a Stroke next-season proposal' using errcode = '42501';
  end if;
  if p_final_scorecard_id is null or p_target_season_id is null then
    raise exception 'Final Scorecard ID and target season ID are required';
  end if;
  if p_target_division_count is null or p_target_division_count not between 1 and 20 then
    raise exception 'Target division count must be between 1 and 20';
  end if;
  p_new_player_ids := coalesce(p_new_player_ids, '{}'::uuid[]);

  select * into v_scorecard from public.stroke_final_scorecards
  where id = p_final_scorecard_id for share;
  if not found or v_scorecard.status <> 'approved' then
    raise exception 'An approved Stroke Final Scorecard is required';
  end if;

  select * into v_source_season from public.seasons where id = v_scorecard.season_id for share;
  if not found or lower(btrim(v_source_season.league_type)) is distinct from 'stroke' then
    raise exception 'The source season is not a valid Stroke season';
  end if;
  select * into v_target_season from public.seasons where id = p_target_season_id for share;
  if not found or lower(btrim(v_target_season.league_type)) is distinct from 'stroke' then
    raise exception 'The target season is not a valid Stroke season';
  end if;
  if v_target_season.season_number <> v_source_season.season_number + 1 then
    raise exception 'Target Stroke season number must equal source season number + 1';
  end if;

  select roster.division_count
  into v_source_division_count
  from public.stroke_roster_versions as roster
  where roster.id = v_scorecard.source_roster_version_id
    and roster.season_id = v_scorecard.season_id
    and roster.status = 'locked'
  for share;
  if not found then
    raise exception 'The approved Final Scorecard source roster is not locked historical data';
  end if;

  select count(*) filter (where decision.decision = 'returning')::integer
  into v_returning_count
  from public.stroke_final_scorecard_entries as entry
  left join public.stroke_final_scorecard_player_decisions as decision
    on decision.final_scorecard_id = entry.scorecard_id and decision.player_id = entry.player_id
  where entry.scorecard_id = p_final_scorecard_id;

  select count(*)::integer into v_missing_decisions
  from public.stroke_final_scorecard_entries as entry
  where entry.scorecard_id = p_final_scorecard_id and not exists (
    select 1 from public.stroke_final_scorecard_player_decisions as decision
    where decision.final_scorecard_id = entry.scorecard_id and decision.player_id = entry.player_id
  );
  if v_missing_decisions > 0 then
    raise exception 'Every Final Scorecard player requires a return decision; % missing', v_missing_decisions;
  end if;

  if cardinality(p_new_player_ids) <> (
    select count(distinct item.player_id) from unnest(p_new_player_ids) as item(player_id)
  ) then raise exception 'New-player selection contains duplicate UUIDs'; end if;
  if exists (select 1 from unnest(p_new_player_ids) as item(player_id)
    left join public.players as player on player.id = item.player_id where player.id is null) then
    raise exception 'Every selected new-player UUID must exist';
  end if;
  if exists (select 1 from unnest(p_new_player_ids) as item(player_id)
    join public.stroke_final_scorecard_entries as entry on entry.player_id = item.player_id
    where entry.scorecard_id = p_final_scorecard_id) then
    raise exception 'A Final Scorecard player cannot also be selected as a new player';
  end if;
  v_new_count := cardinality(p_new_player_ids);
  if v_returning_count + v_new_count > p_target_division_count * 4 then
    raise exception 'Returning and selected new players exceed target roster capacity';
  end if;

  select count(*)::integer into v_draft_count from public.stroke_roster_versions
  where season_id = p_target_season_id and status = 'draft';
  if v_draft_count > 1 then raise exception 'Target season has multiple draft rosters'; end if;
  if exists (select 1 from public.stroke_roster_versions where season_id = p_target_season_id
    and status in ('approved', 'locked')) then
    raise exception 'An approved or locked target roster cannot be replaced';
  end if;

  select * into v_roster from public.stroke_roster_versions
  where season_id = p_target_season_id and status = 'draft' limit 1 for update;
  if found then
    if v_roster.source_final_scorecard_id is not null
      and v_roster.source_final_scorecard_id <> p_final_scorecard_id then
      raise exception 'Target draft belongs to a different Final Scorecard transition';
    end if;
    if v_roster.source_final_scorecard_id is null and exists (
      select 1 from public.stroke_division_roster_slots as existing_slot
      where existing_slot.roster_version_id = v_roster.id
        and existing_slot.player_id is not null
    ) then raise exception 'Existing unlinked target draft is not empty and cannot be attached'; end if;
    update public.stroke_roster_versions set source_final_scorecard_id = p_final_scorecard_id,
      division_count = p_target_division_count, updated_at = now() where id = v_roster.id returning * into v_roster;
  else
    insert into public.stroke_roster_versions (season_id, division_count, status, source_final_scorecard_id)
    values (p_target_season_id, p_target_division_count, 'draft', p_final_scorecard_id)
    returning * into v_roster;
  end if;

  create temporary table if not exists pg_temp.stroke_transition_work (
    player_id uuid primary key, player_screen_name text not null, source_division integer,
    source_rank integer, completed_games integer, mandatory boolean not null default false,
    zero_game boolean not null default false, bottom_finish boolean not null default false,
    target_division integer, movement_reason text
  ) on commit drop;
  truncate pg_temp.stroke_transition_work;

  insert into pg_temp.stroke_transition_work (
    player_id, player_screen_name, source_division, source_rank, completed_games,
    mandatory, zero_game, bottom_finish
  )
  select entry.player_id, entry.player_screen_name, entry.division_number,
    entry.division_rank, entry.completed_game_count,
    ((entry.completed_game_count = 0 and entry.division_number < v_source_division_count)
      or entry.division_rank = (
        select max(all_entry.division_rank)
        from public.stroke_final_scorecard_entries as all_entry
        where all_entry.scorecard_id = entry.scorecard_id
          and all_entry.division_number = entry.division_number
      )),
    entry.completed_game_count = 0 and entry.division_number < v_source_division_count,
    entry.division_rank = (
      select max(all_entry.division_rank)
      from public.stroke_final_scorecard_entries as all_entry
      where all_entry.scorecard_id = entry.scorecard_id
        and all_entry.division_number = entry.division_number
    )
  from public.stroke_final_scorecard_entries as entry
  join public.stroke_final_scorecard_player_decisions as decision
    on decision.final_scorecard_id = entry.scorecard_id and decision.player_id = entry.player_id
  where entry.scorecard_id = p_final_scorecard_id and decision.decision = 'returning';

  if exists (select 1 from pg_temp.stroke_transition_work
    where mandatory and source_division + 1 > p_target_division_count) then
    raise exception 'A mandatory relegation destination does not exist in the target division structure';
  end if;

  update pg_temp.stroke_transition_work set target_division = source_division + 1,
    movement_reason = case when zero_game and bottom_finish then 'Relegated — Zero Games + Bottom Finish'
      when zero_game then 'Relegated — Zero Games' else 'Relegated — Bottom Finish' end
  where mandatory;

  for v_division in 1..greatest(v_source_division_count - 1, 0) loop
    if v_division > p_target_division_count then continue; end if;
    select count(*)::integer into v_demand
    from public.stroke_final_scorecard_entries as entry
    join public.stroke_final_scorecard_player_decisions as decision
      on decision.final_scorecard_id = entry.scorecard_id and decision.player_id = entry.player_id
    where entry.scorecard_id = p_final_scorecard_id and entry.division_number = v_division
      and (decision.decision = 'not_returning' or exists (
        select 1 from pg_temp.stroke_transition_work as work
        where work.player_id = entry.player_id and work.mandatory
      ));
    select greatest(
      0,
      v_demand
        + count(*) filter (
            where source_division = v_division
              and target_division = v_division - 1
          )
        - count(*) filter (
            where source_division = v_division - 1
              and target_division = v_division
          )
    )::integer
    into v_demand
    from pg_temp.stroke_transition_work;

    for v_player in select * from pg_temp.stroke_transition_work
      where source_division = v_division + 1 and not mandatory and completed_games > 0
        and target_division is null order by source_rank limit v_demand
    loop
      update pg_temp.stroke_transition_work as work set target_division = v_division,
        movement_reason = 'Promoted' where work.player_id = v_player.player_id;
    end loop;
  end loop;

  if exists (select target_division from pg_temp.stroke_transition_work where target_division is not null
    group by target_division having count(*) > 4) then
    raise exception 'Mandatory movement exceeds a target division capacity';
  end if;

  for v_player in select * from pg_temp.stroke_transition_work where target_division is null
    order by source_division, source_rank
  loop
    v_target := null;
    foreach v_division in array array[v_player.source_division, v_player.source_division + 1, v_player.source_division - 1]
    loop
      if v_division between 1 and p_target_division_count and (
        select count(*) from pg_temp.stroke_transition_work where target_division = v_division
      ) < 4 then v_target := v_division; exit; end if;
    end loop;
    if v_target is null then
      raise exception 'Returning player % has no legal target slot within one division', v_player.player_screen_name;
    end if;
    update pg_temp.stroke_transition_work as work set target_division = v_target,
      movement_reason = case when v_target = v_player.source_division then 'Stayed' else 'Placement Adjustment' end
    where work.player_id = v_player.player_id;
  end loop;

  create temporary table if not exists pg_temp.stroke_transition_new_players (
    player_id uuid primary key, player_screen_name text not null, selection_order integer not null,
    target_division integer
  ) on commit drop;
  truncate pg_temp.stroke_transition_new_players;
  insert into pg_temp.stroke_transition_new_players (player_id, player_screen_name, selection_order)
  select player.id, player.screen_name, item.ordinality::integer
  from unnest(p_new_player_ids) with ordinality as item(player_id, ordinality)
  join public.players as player on player.id = item.player_id;

  for v_player in select * from pg_temp.stroke_transition_new_players order by selection_order loop
    v_target := null;
    if p_target_division_count > v_source_division_count then
      for v_division in v_source_division_count + 1..p_target_division_count loop
        if (select count(*) from pg_temp.stroke_transition_work where target_division = v_division)
          + (select count(*) from pg_temp.stroke_transition_new_players where target_division = v_division) < 4
        then v_target := v_division; exit; end if;
      end loop;
      if v_target is null then
        for v_division in reverse v_source_division_count..1 loop
          if (select count(*) from pg_temp.stroke_transition_work where target_division = v_division)
            + (select count(*) from pg_temp.stroke_transition_new_players where target_division = v_division) < 4
          then v_target := v_division; exit; end if;
        end loop;
      end if;
    else
      for v_division in reverse p_target_division_count..1 loop
        if (select count(*) from pg_temp.stroke_transition_work where target_division = v_division)
          + (select count(*) from pg_temp.stroke_transition_new_players where target_division = v_division) < 4
        then v_target := v_division; exit; end if;
      end loop;
    end if;
    if v_target is null then raise exception 'Selected new player % cannot be placed within target capacity', v_player.player_screen_name; end if;
    update pg_temp.stroke_transition_new_players as new_player
    set target_division = v_target
    where new_player.player_id = v_player.player_id;
  end loop;

  delete from public.stroke_division_roster_slots as roster_slot
  where roster_slot.roster_version_id = v_roster.id;
  insert into public.stroke_division_roster_slots (
    roster_version_id, division_number, slot_number, player_id, player_screen_name, slot_status
  ) select v_roster.id, division.division_number, slot.slot_number, null, null, 'empty'
  from generate_series(1, p_target_division_count) as division(division_number)
  cross join generate_series(1, 4) as slot(slot_number);

  for v_player in
    select work.player_id, work.player_screen_name, work.target_division,
      work.movement_reason, work.source_rank, 0 as selection_order
    from pg_temp.stroke_transition_work as work
    union all
    select new_player.player_id, new_player.player_screen_name,
      new_player.target_division, 'New Player', 1000000, new_player.selection_order
    from pg_temp.stroke_transition_new_players as new_player
    order by target_division, source_rank, selection_order
  loop
    select min(roster_slot.slot_number) into v_slot
    from public.stroke_division_roster_slots as roster_slot
    where roster_slot.roster_version_id = v_roster.id
      and roster_slot.division_number = v_player.target_division
      and roster_slot.player_id is null;
    if v_slot is null then raise exception 'Target division % exceeds four players', v_player.target_division; end if;
    update public.stroke_division_roster_slots as roster_slot set player_id = v_player.player_id,
      player_screen_name = v_player.player_screen_name, slot_status = 'active'
    where roster_slot.roster_version_id = v_roster.id
      and roster_slot.division_number = v_player.target_division
      and roster_slot.slot_number = v_slot;
  end loop;

  return query
  select v_roster.id, p_target_season_id, p_target_division_count,
    slot.division_number, slot.slot_number, slot.player_id, slot.player_screen_name,
    coalesce(work.movement_reason, case when new_player.player_id is not null then 'New Player' end)
  from public.stroke_division_roster_slots as slot
  left join pg_temp.stroke_transition_work as work on work.player_id = slot.player_id
  left join pg_temp.stroke_transition_new_players as new_player on new_player.player_id = slot.player_id
  where slot.roster_version_id = v_roster.id
  order by slot.division_number, slot.slot_number;
end;
$function$;

revoke all on function public.generate_stroke_next_season_proposal(uuid, uuid, integer, uuid[]) from public;
revoke all on function public.generate_stroke_next_season_proposal(uuid, uuid, integer, uuid[]) from anon;
revoke all on function public.generate_stroke_next_season_proposal(uuid, uuid, integer, uuid[]) from authenticated;
grant execute on function public.generate_stroke_next_season_proposal(uuid, uuid, integer, uuid[]) to authenticated;

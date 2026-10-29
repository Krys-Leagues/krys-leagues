create or replace function public.set_match_division_roster_slots(
  p_roster_version_id uuid,
  p_division_number integer,
  p_slot1_player_id uuid,
  p_slot2_player_id uuid,
  p_slot3_player_id uuid,
  p_slot4_player_id uuid
)
returns table(
  id uuid,
  roster_version_id uuid,
  season_id uuid,
  division_number integer,
  slot_number smallint,
  player_id uuid,
  player_screen_name text,
  slot_status text
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_roster public.match_roster_versions%rowtype;

  v_season_number integer;

  v_desired_player_ids uuid[] := array[
    p_slot1_player_id,
    p_slot2_player_id,
    p_slot3_player_id,
    p_slot4_player_id
  ];

  v_nonnull_desired_count integer;
  v_distinct_desired_count integer;
  v_existing_player_count integer;

  v_target_slot_count integer;
  v_target_distinct_slot_count integer;
  v_target_min_slot smallint;
  v_target_max_slot smallint;

  v_protected_player_id uuid;
  v_protected_player_name text;

  v_roster_state_before jsonb;
  v_roster_state_after jsonb;
begin
  if not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode = '42501';
  end if;

  if auth.uid() is null then
    raise exception
      'Authentication is required to edit a Match roster'
      using errcode = '42501';
  end if;

  if p_roster_version_id is null then
    raise exception 'Roster version is required';
  end if;

  if p_division_number is null or p_division_number <= 0 then
    raise exception 'Division number must be a positive integer';
  end if;

  -- Serialize every operation affecting this roster version.

  select roster.*
  into v_roster
  from public.match_roster_versions as roster
  where roster.id = p_roster_version_id
  for update;

  if not found then
    raise exception 'Match roster version was not found';
  end if;

  if v_roster.status = 'locked' then
    raise exception
      'A locked historical Match roster cannot be changed'
      using errcode = '42501';
  end if;

  if v_roster.status = 'cancelled' then
    raise exception
      'A cancelled Match roster cannot be changed'
      using errcode = '42501';
  end if;

  if v_roster.status not in ('draft', 'approved') then
    raise exception 'This Match roster is not editable';
  end if;

  if p_division_number > v_roster.division_count then
    raise exception
      'Division % is outside this roster''s division count of %',
      p_division_number,
      v_roster.division_count;
  end if;

  select season.season_number
  into v_season_number
  from public.seasons as season
  where season.id = v_roster.season_id
    and season.league_type = 'match';

  if not found then
    raise exception
      'The roster does not reference a valid Match season';
  end if;

  -- An approved roster must already participate in the protected
  -- schedule workflow. Lock the state row so revision changes for this
  -- season are serialized.

  if v_roster.status = 'approved' then
    perform 1
    from public.match_schedule_state as schedule_state
    where schedule_state.season_id = v_roster.season_id
    for update;

    if not found then
      raise exception
        'Approved Match roster has no schedule workflow state';
    end if;
  end if;

  -- Lock every slot in this roster. Cross-division moves may affect
  -- source slots outside the requested target division.

  perform 1
  from public.match_division_roster_slots as roster_slot
  where roster_slot.roster_version_id = v_roster.id
  for update;

  -- Capture the complete logical player placement before mutation.
  -- Screen-name snapshots and slot status are intentionally excluded.

  select coalesce(
    jsonb_agg(
      jsonb_build_array(
        roster_slot.division_number,
        roster_slot.slot_number,
        roster_slot.player_id
      )
      order by
        roster_slot.division_number,
        roster_slot.slot_number
    ),
    '[]'::jsonb
  )
  into v_roster_state_before
  from public.match_division_roster_slots as roster_slot
  where roster_slot.roster_version_id = v_roster.id;

  -- Confirm that the target division has exactly slots 1 through 4.

  select
    count(*),
    count(distinct roster_slot.slot_number),
    min(roster_slot.slot_number),
    max(roster_slot.slot_number)
  into
    v_target_slot_count,
    v_target_distinct_slot_count,
    v_target_min_slot,
    v_target_max_slot
  from public.match_division_roster_slots as roster_slot
  where roster_slot.roster_version_id = v_roster.id
    and roster_slot.division_number = p_division_number;

  if v_target_slot_count <> 4
     or v_target_distinct_slot_count <> 4
     or v_target_min_slot <> 1
     or v_target_max_slot <> 4 then
    raise exception
      'The requested division must have exactly persistent slots 1 through 4';
  end if;

  -- Reject duplicate real players in the desired four-slot assignment.
  -- NULL values represent independent empty slots and are ignored.

  select
    count(desired_player_id),
    count(distinct desired_player_id)
  into
    v_nonnull_desired_count,
    v_distinct_desired_count
  from unnest(v_desired_player_ids) as desired_player(desired_player_id)
  where desired_player_id is not null;

  if v_nonnull_desired_count <> v_distinct_desired_count then
    raise exception
      'A player cannot occupy more than one slot in the same roster'
      using errcode = '23505';
  end if;

  -- Validate every incoming real-player UUID. Discord identity remains
  -- reachable through players.id and is not duplicated in roster slots.

  select count(*)
  into v_existing_player_count
  from public.players as player
  where player.id in (
    select desired_player_id
    from unnest(v_desired_player_ids)
      as desired_player(desired_player_id)
    where desired_player_id is not null
  );

  if v_existing_player_count <> v_nonnull_desired_count then
    raise exception
      'One or more selected players do not exist';
  end if;

  -- Prevent concurrent inserts or updates in results from racing with
  -- the persisted completed-game protection check. Reads remain allowed.

  lock table public.results in share mode;

  -- Find any player whose existing placement would change and who has
  -- at least one persisted completed real Match game.
  --
  -- A placement changes when:
  -- 1. a current target-division slot will receive a different UUID; or
  -- 2. a desired incoming UUID currently occupies another division.
  --
  -- Players whose UUID remains in the same slot are not blocked.

  select
    existing_slot.player_id,
    existing_slot.player_screen_name
  into
    v_protected_player_id,
    v_protected_player_name
  from public.match_division_roster_slots as existing_slot
  where existing_slot.roster_version_id = v_roster.id
    and existing_slot.player_id is not null
    and (
      (
        existing_slot.division_number = p_division_number
        and existing_slot.player_id is distinct from
          case existing_slot.slot_number
            when 1 then p_slot1_player_id
            when 2 then p_slot2_player_id
            when 3 then p_slot3_player_id
            when 4 then p_slot4_player_id
          end
      )
      or
      (
        existing_slot.division_number <> p_division_number
        and existing_slot.player_id = any(v_desired_player_ids)
      )
    )
    and exists (
      select 1
      from public.results as completed_result
      where completed_result.league_type = 'match'
        and completed_result.season_number = v_season_number
        and completed_result.player1_id is not null
        and completed_result.player2_id is not null
        and completed_result.player1_hw is not null
        and completed_result.player2_hw is not null
        and (
          completed_result.player1_id = existing_slot.player_id
          or completed_result.player2_id = existing_slot.player_id
        )
    )
  limit 1;

  if found then
    raise exception
      'Player % has completed a Match game and cannot be removed, replaced, or moved',
      coalesce(v_protected_player_name, v_protected_player_id::text)
      using errcode = '42501';
  end if;

  -- Everything below remains in this function call's transaction.
  --
  -- Clear incoming players from any source slots outside the target
  -- division. This safely supports cross-division movement.

  update public.match_division_roster_slots as source_slot
  set
    player_id = null,
    player_screen_name = null,
    slot_status = 'empty'
  where source_slot.roster_version_id = v_roster.id
    and source_slot.division_number <> p_division_number
    and source_slot.player_id = any(v_desired_player_ids);

  -- Clear all target slots before assigning final values. This permits
  -- same-division swaps without violating the existing unique
  -- player-per-roster index.

  update public.match_division_roster_slots as target_slot
  set
    player_id = null,
    player_screen_name = null,
    slot_status = 'empty'
  where target_slot.roster_version_id = v_roster.id
    and target_slot.division_number = p_division_number;

  -- Apply the complete desired target state. The existing roster-slot
  -- trigger also resolves the current exact screen-name snapshot from
  -- players.id.

  update public.match_division_roster_slots as target_slot
  set
    player_id = desired_slot.desired_player_id,
    player_screen_name = selected_player.screen_name,
    slot_status =
      case
        when desired_slot.desired_player_id is null then 'empty'
        else 'active'
      end
  from (
    values
      (1::smallint, p_slot1_player_id),
      (2::smallint, p_slot2_player_id),
      (3::smallint, p_slot3_player_id),
      (4::smallint, p_slot4_player_id)
  ) as desired_slot(slot_number, desired_player_id)
  left join public.players as selected_player
    on selected_player.id = desired_slot.desired_player_id
  where target_slot.roster_version_id = v_roster.id
    and target_slot.division_number = p_division_number
    and target_slot.slot_number = desired_slot.slot_number;

  if not found then
    raise exception
      'The target Match roster slots could not be updated';
  end if;

  -- Capture the complete logical placement after every target and
  -- cross-division mutation has completed.

  select coalesce(
    jsonb_agg(
      jsonb_build_array(
        roster_slot.division_number,
        roster_slot.slot_number,
        roster_slot.player_id
      )
      order by
        roster_slot.division_number,
        roster_slot.slot_number
    ),
    '[]'::jsonb
  )
  into v_roster_state_after
  from public.match_division_roster_slots as roster_slot
  where roster_slot.roster_version_id = v_roster.id;

  -- A single logical approved-roster change creates one new schedule
  -- revision. Existing generated/reviewed/posted values and metadata
  -- deliberately remain untouched.

  if v_roster.status = 'approved'
     and v_roster_state_before is distinct from v_roster_state_after then
    update public.match_schedule_state as schedule_state
    set change_revision = schedule_state.change_revision + 1
    where schedule_state.season_id = v_roster.season_id;

    if not found then
      raise exception
        'Approved Match roster has no schedule workflow state';
    end if;
  end if;

  -- Return the authoritative four saved target rows.

  return query
  select
    saved_slot.id,
    saved_slot.roster_version_id,
    saved_slot.season_id,
    saved_slot.division_number,
    saved_slot.slot_number,
    saved_slot.player_id,
    saved_slot.player_screen_name,
    saved_slot.slot_status
  from public.match_division_roster_slots as saved_slot
  where saved_slot.roster_version_id = v_roster.id
    and saved_slot.division_number = p_division_number
  order by saved_slot.slot_number;
end;
$function$;

revoke all
  on function public.set_match_division_roster_slots(
    uuid,
    integer,
    uuid,
    uuid,
    uuid,
    uuid
  )
  from public;

revoke all
  on function public.set_match_division_roster_slots(
    uuid,
    integer,
    uuid,
    uuid,
    uuid,
    uuid
  )
  from anon;

revoke all
  on function public.set_match_division_roster_slots(
    uuid,
    integer,
    uuid,
    uuid,
    uuid,
    uuid
  )
  from authenticated;

grant execute
  on function public.set_match_division_roster_slots(
    uuid,
    integer,
    uuid,
    uuid,
    uuid,
    uuid
  )
  to authenticated;

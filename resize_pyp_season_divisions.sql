create or replace function public.resize_pyp_season_divisions(
  p_season_id uuid,
  p_new_division_count integer
)
returns table(
  season_id uuid,
  roster_version_id uuid,
  roster_status text,
  previous_division_count integer,
  division_count integer,
  added_division_count integer,
  removed_division_count integer,
  deleted_fixture_count integer,
  schedule_changes_detected boolean,
  change_revision integer
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_roster public.pyp_roster_versions%rowtype;
  v_previous_division_count integer;
  v_added_division_count integer := 0;
  v_removed_division_count integer := 0;
  v_deleted_fixture_count integer := 0;
  v_change_revision integer := null;
begin
  if not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required';
  end if;

  if p_season_id is null then
    raise exception 'Season ID is required';
  end if;

  if p_new_division_count is null or p_new_division_count < 1 then
    raise exception 'Division count must be at least 1';
  end if;

  select roster.*
  into v_roster
  from public.pyp_roster_versions as roster
  where roster.season_id = p_season_id
    and roster.status in ('draft', 'approved')
  order by case roster.status when 'draft' then 1 else 2 end
  limit 1
  for update;

  if not found then
    if exists (
      select 1
      from public.pyp_roster_versions as locked_roster
      where locked_roster.season_id = p_season_id
        and locked_roster.status = 'locked'
    ) then
      raise exception 'A locked historical PYP roster cannot be resized'
        using errcode = '42501';
    end if;

    raise exception 'No current draft or approved PYP roster was found for this season';
  end if;

  perform 1
  from public.seasons as season
  where season.id = p_season_id
    and lower(btrim(season.league_type)) = 'pyp'
  for share;

  if not found then
    raise exception 'The requested season was not found or is not PYP';
  end if;

  if exists (
    select 1
    from public.pyp_roster_versions as locked_roster
    where locked_roster.season_id = p_season_id
      and locked_roster.status = 'locked'
  ) then
    raise exception 'A locked historical PYP roster cannot be resized'
      using errcode = '42501';
  end if;

  v_previous_division_count := v_roster.division_count;

  if v_previous_division_count is null or v_previous_division_count < 1 then
    raise exception 'The current PYP roster has an invalid division count';
  end if;

  perform 1
  from public.pyp_division_roster_slots as slot
  where slot.roster_version_id = v_roster.id
  order by slot.division_number, slot.slot_number
  for update;

  if (
    select count(*)
    from public.pyp_division_roster_slots as slot
    where slot.roster_version_id = v_roster.id
  ) <> v_previous_division_count * 4 then
    raise exception 'The current PYP roster does not contain exactly four slots per division';
  end if;

  if exists (
    select 1
    from pg_catalog.generate_series(1, v_previous_division_count) as expected(division_number)
    left join public.pyp_division_roster_slots as slot
      on slot.roster_version_id = v_roster.id
     and slot.division_number = expected.division_number
    group by expected.division_number
    having count(slot.id) <> 4
       or count(distinct slot.slot_number) <> 4
       or min(slot.slot_number) <> 1
       or max(slot.slot_number) <> 4
  ) then
    raise exception 'The current PYP roster does not contain exactly slots 1 through 4 for every division';
  end if;

  if p_new_division_count = v_previous_division_count then
    if v_roster.status = 'approved' then
      select schedule_state.change_revision
      into v_change_revision
      from public.pyp_schedule_state as schedule_state
      where schedule_state.season_id = p_season_id;
    end if;

    return query
    select
      p_season_id,
      v_roster.id,
      v_roster.status,
      v_previous_division_count,
      v_previous_division_count,
      0,
      0,
      0,
      false,
      v_change_revision;
    return;
  end if;

  if v_roster.status = 'approved' then
    select schedule_state.change_revision
    into v_change_revision
    from public.pyp_schedule_state as schedule_state
    where schedule_state.season_id = p_season_id
    for update;

    if not found then
      raise exception 'Approved PYP roster has no schedule workflow state';
    end if;
  end if;

  if p_new_division_count > v_previous_division_count then
    v_added_division_count := p_new_division_count - v_previous_division_count;

    update public.pyp_roster_versions as roster
    set division_count = p_new_division_count
    where roster.id = v_roster.id
    returning roster.* into v_roster;

    insert into public.pyp_division_roster_slots (
      roster_version_id,
      season_id,
      division_number,
      slot_number,
      player_id,
      player_screen_name,
      slot_status
    )
    select
      v_roster.id,
      p_season_id,
      division.division_number,
      slot.slot_number::smallint,
      null,
      null,
      'empty'
    from pg_catalog.generate_series(
      v_previous_division_count + 1,
      p_new_division_count
    ) as division(division_number)
    cross join pg_catalog.generate_series(1, 4) as slot(slot_number);
  else
    v_removed_division_count := v_previous_division_count - p_new_division_count;

    if exists (
      select 1
      from public.pyp_division_roster_slots as slot
      where slot.roster_version_id = v_roster.id
        and slot.division_number > p_new_division_count
        and (
          slot.player_id is not null
          or slot.player_screen_name is not null
          or slot.slot_status <> 'empty'
        )
    ) then
      raise exception 'Cannot remove PYP D% because it still contains roster players',
        (
          select min(slot.division_number)
          from public.pyp_division_roster_slots as slot
          where slot.roster_version_id = v_roster.id
            and slot.division_number > p_new_division_count
            and (
              slot.player_id is not null
              or slot.player_screen_name is not null
              or slot.slot_status <> 'empty'
            )
        );
    end if;

    lock table public.results in share mode;

    perform 1
    from public.schedule as fixture
    where lower(btrim(fixture.league_type)) = 'pyp'
      and fixture.season_id = p_season_id
      and fixture.pyp_roster_version_id = v_roster.id
      and fixture.division_number > p_new_division_count
    order by fixture.division_number, fixture.game_number, fixture.id
    for update;

    if exists (
      select 1
      from public.schedule as fixture
      join public.results as result
        on result.schedule_id = fixture.id
      where lower(btrim(fixture.league_type)) = 'pyp'
        and fixture.season_id = p_season_id
        and fixture.pyp_roster_version_id = v_roster.id
        and fixture.division_number > p_new_division_count
        and result.player1_id is not null
        and result.player2_id is not null
        and result.player1_hw is not null
        and result.player2_hw is not null
    ) then
      raise exception 'Cannot remove trailing PYP divisions because completed results exist';
    end if;

    if exists (
      select 1
      from public.schedule as fixture
      join public.results as result
        on result.schedule_id = fixture.id
      where lower(btrim(fixture.league_type)) = 'pyp'
        and fixture.season_id = p_season_id
        and fixture.pyp_roster_version_id = v_roster.id
        and fixture.division_number > p_new_division_count
    ) then
      raise exception 'Cannot remove trailing PYP divisions because result records exist';
    end if;

    delete from public.schedule as fixture
    where lower(btrim(fixture.league_type)) = 'pyp'
      and fixture.season_id = p_season_id
      and fixture.pyp_roster_version_id = v_roster.id
      and fixture.division_number > p_new_division_count;

    get diagnostics v_deleted_fixture_count = row_count;

    delete from public.pyp_division_roster_slots as slot
    where slot.roster_version_id = v_roster.id
      and slot.division_number > p_new_division_count;

    update public.pyp_roster_versions as roster
    set division_count = p_new_division_count
    where roster.id = v_roster.id
    returning roster.* into v_roster;
  end if;

  if v_roster.status = 'approved' then
    update public.pyp_schedule_state as schedule_state
    set change_revision = schedule_state.change_revision + 1
    where schedule_state.season_id = p_season_id
    returning schedule_state.change_revision into v_change_revision;

    if not found then
      raise exception 'Approved PYP roster has no schedule workflow state';
    end if;
  end if;

  return query
  select
    p_season_id,
    v_roster.id,
    v_roster.status,
    v_previous_division_count,
    v_roster.division_count,
    v_added_division_count,
    v_removed_division_count,
    v_deleted_fixture_count,
    v_roster.status = 'approved',
    v_change_revision;
end;
$function$;

revoke all on function public.resize_pyp_season_divisions(uuid, integer) from public;
revoke all on function public.resize_pyp_season_divisions(uuid, integer) from anon;
revoke all on function public.resize_pyp_season_divisions(uuid, integer) from authenticated;
grant execute on function public.resize_pyp_season_divisions(uuid, integer) to authenticated;

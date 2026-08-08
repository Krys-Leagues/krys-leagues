CREATE OR REPLACE FUNCTION public.approve_stroke_roster_version(p_roster_version_id uuid, p_approval_note text DEFAULT NULL::text)
 RETURNS TABLE(season_id uuid, roster_version_id uuid, roster_status text, division_count integer, populated_player_count integer, change_revision integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_user_id uuid;
  v_season_id uuid;
  v_division_count integer;
  v_roster_status text;
  v_locked_at timestamptz;
  v_locked_by uuid;

  v_total_slot_count integer;
  v_populated_player_count integer;
  v_distinct_player_count integer;

  v_state_inserted_count integer;
  v_change_revision integer;
  v_generated_revision integer;
  v_reviewed_revision integer;
  v_posted_revision integer;
  v_generated_at timestamptz;
  v_generated_by uuid;
  v_reviewed_at timestamptz;
  v_reviewed_by uuid;
  v_posted_at timestamptz;
  v_posted_by uuid;
begin
  -- ==========================================================
  -- Authentication
  -- ==========================================================

  v_user_id := auth.uid();

  if not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required';
  end if;

  if p_roster_version_id is null then
    raise exception
      'A roster version ID is required.';
  end if;


  -- ==========================================================
  -- Lock and load the roster version
  -- ==========================================================

  select
    rv.season_id,
    rv.division_count,
    rv.status,
    rv.locked_at,
    rv.locked_by
  into
    v_season_id,
    v_division_count,
    v_roster_status,
    v_locked_at,
    v_locked_by
  from public.stroke_roster_versions rv
  where rv.id = p_roster_version_id
  for update;

  if not found then
    raise exception
      'Stroke roster version % was not found.',
      p_roster_version_id;
  end if;


  -- ==========================================================
  -- Lock and validate the parent season
  -- ==========================================================

  perform 1
  from public.seasons s
  where s.id = v_season_id
    and lower(btrim(s.league_type)) = 'stroke'
  for update;

  if not found then
    raise exception
      'Roster version % does not belong to a valid Stroke season.',
      p_roster_version_id;
  end if;


  -- ==========================================================
  -- Validate approval state
  -- ==========================================================

  if v_roster_status <> 'draft' then
    raise exception
      'Only a draft Stroke roster can be approved. Current status: %.',
      v_roster_status;
  end if;

  if v_locked_at is not null or v_locked_by is not null then
    raise exception
      'This Stroke roster is historically locked and cannot be approved.';
  end if;

  if v_division_count is null or v_division_count <= 0 then
    raise exception
      'The Stroke roster must have a positive division count.';
  end if;


  -- ==========================================================
  -- Lock every persistent slot belonging to this roster
  -- ==========================================================

  perform 1
  from public.stroke_division_roster_slots rs
  where rs.roster_version_id = p_roster_version_id
  order by rs.division_number, rs.slot_number
  for update;


  -- ==========================================================
  -- Validate total slot and populated-player counts
  -- ==========================================================

  select
    count(*)::integer,
    count(rs.player_id)::integer,
    count(distinct rs.player_id)::integer
  into
    v_total_slot_count,
    v_populated_player_count,
    v_distinct_player_count
  from public.stroke_division_roster_slots rs
  where rs.roster_version_id = p_roster_version_id;

  if v_total_slot_count <> v_division_count * 4 then
    raise exception
      'Roster version % must contain exactly % persistent slot rows; found %.',
      p_roster_version_id,
      v_division_count * 4,
      v_total_slot_count;
  end if;


  -- ==========================================================
  -- Validate division and slot-number ranges
  -- ==========================================================

  if exists (
    select 1
    from public.stroke_division_roster_slots rs
    where rs.roster_version_id = p_roster_version_id
      and (
        rs.division_number < 1
        or rs.division_number > v_division_count
        or rs.slot_number < 1
        or rs.slot_number > 4
      )
  ) then
    raise exception
      'The roster contains an invalid division number or slot number.';
  end if;


  -- ==========================================================
  -- Require divisions 1 through division_count, each with the
  -- four distinct persistent slots 1 through 4
  -- ==========================================================

  if exists (
    select 1
    from pg_catalog.generate_series(
      1,
      v_division_count
    ) as expected(division_number)
    left join public.stroke_division_roster_slots rs
      on rs.roster_version_id = p_roster_version_id
     and rs.division_number = expected.division_number
    group by expected.division_number
    having count(rs.id) <> 4
       or count(distinct rs.slot_number) <> 4
       or min(rs.slot_number) <> 1
       or max(rs.slot_number) <> 4
  ) then
    raise exception
      'Every division from 1 through % must contain exactly slots 1 through 4.',
      v_division_count;
  end if;


  -- ==========================================================
  -- Validate that every populated UUID identifies a real player
  -- ==========================================================

  if exists (
    select 1
    from public.stroke_division_roster_slots rs
    left join public.players p
      on p.id = rs.player_id
    where rs.roster_version_id = p_roster_version_id
      and rs.player_id is not null
      and p.id is null
  ) then
    raise exception
      'The roster contains a player UUID that does not exist in public.players.';
  end if;


  -- ==========================================================
  -- No real player may occupy multiple slots in this version
  -- ==========================================================

  if v_distinct_player_count <> v_populated_player_count then
    raise exception
      'A real player cannot occupy more than one slot in the same roster version.';
  end if;

  if exists (
    select 1
    from public.stroke_division_roster_slots rs
    where rs.roster_version_id = p_roster_version_id
      and rs.player_id is not null
    group by rs.player_id
    having count(*) > 1
  ) then
    raise exception
      'A real player cannot occupy more than one slot in the same roster version.';
  end if;


  -- ==========================================================
  -- Explicitly approve the roster
  --
  -- Existing roster validation/protection triggers remain active.
  -- No slot assignments or screen-name snapshots are changed.
  -- ==========================================================

  update public.stroke_roster_versions rv
  set
    status = 'approved',
    approved_at = now(),
    approved_by = v_user_id,
    approval_note = nullif(btrim(p_approval_note), '')
  where rv.id = p_roster_version_id;


  -- ==========================================================
  -- Initialize schedule workflow state
  --
  -- The parent season row is already locked, preventing two normal
  -- approval calls for the same season from racing this operation.
  -- ==========================================================

  insert into public.stroke_schedule_state (
    season_id,
    change_revision,
    generated_revision,
    reviewed_revision,
    posted_revision,
    generated_at,
    generated_by,
    reviewed_at,
    reviewed_by,
    posted_at,
    posted_by
  )
  values (
    v_season_id,
    1,
    0,
    0,
    0,
    null,
    null,
    null,
    null,
    null,
    null
  )
  on conflict (season_id) do nothing;

  get diagnostics v_state_inserted_count = row_count;

  select
    ss.change_revision,
    ss.generated_revision,
    ss.reviewed_revision,
    ss.posted_revision,
    ss.generated_at,
    ss.generated_by,
    ss.reviewed_at,
    ss.reviewed_by,
    ss.posted_at,
    ss.posted_by
  into
    v_change_revision,
    v_generated_revision,
    v_reviewed_revision,
    v_posted_revision,
    v_generated_at,
    v_generated_by,
    v_reviewed_at,
    v_reviewed_by,
    v_posted_at,
    v_posted_by
  from public.stroke_schedule_state ss
  where ss.season_id = v_season_id
  for update;

  if not found then
    raise exception
      'Unable to initialize schedule workflow state for Stroke season %.',
      v_season_id;
  end if;

  -- If another valid state row already existed, preserve a pristine
  -- pending state. Never reset or overwrite generated/reviewed/posted
  -- history during roster approval.
  if v_state_inserted_count = 0 then
    if v_change_revision < 1 then
      raise exception
        'Existing schedule workflow state has an invalid change revision.';
    end if;

    if v_generated_revision <> 0
       or v_reviewed_revision <> 0
       or v_posted_revision <> 0
       or v_generated_at is not null
       or v_generated_by is not null
       or v_reviewed_at is not null
       or v_reviewed_by is not null
       or v_posted_at is not null
       or v_posted_by is not null then
      raise exception
        'Schedule workflow history already exists for this draft roster season; approval was not performed.';
    end if;
  end if;


  -- ==========================================================
  -- Return authoritative approval state
  -- ==========================================================

  return query
  select
    v_season_id,
    p_roster_version_id,
    'approved'::text,
    v_division_count,
    v_populated_player_count,
    v_change_revision;
end;
$function$;

revoke all on function public.approve_stroke_roster_version(uuid, text) from public;
revoke all on function public.approve_stroke_roster_version(uuid, text) from anon;
revoke all on function public.approve_stroke_roster_version(uuid, text) from authenticated;
grant execute on function public.approve_stroke_roster_version(uuid, text) to authenticated;

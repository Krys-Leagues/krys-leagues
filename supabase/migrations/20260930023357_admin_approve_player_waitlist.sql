create or replace function public.admin_approve_player_waitlist_entry(
  p_waitlist_id uuid,
  p_division text,
  p_season_number integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_waitlist public.player_waitlist%rowtype;
  v_player public.players%rowtype;
  v_player_id uuid;
  v_discord_matches uuid[];
  v_name_matches uuid[];
  v_league text;
  v_division text := nullif(btrim(p_division), '');
  v_screen_name text;
begin
  if not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode = '42501';
  end if;

  if p_waitlist_id is null then raise exception 'Wait-list entry is required'; end if;
  if v_division is null then raise exception 'Division is required'; end if;
  if p_season_number is null or p_season_number < 1 then
    raise exception 'A valid season number is required';
  end if;

  select waiting.* into v_waitlist
  from public.player_waitlist as waiting
  where waiting.id = p_waitlist_id
    and waiting.status in ('waiting', 'pending')
  for update;

  if not found then
    raise exception 'An actionable wait-list entry was not found';
  end if;

  v_league := lower(btrim(v_waitlist.league_type));
  v_screen_name := nullif(btrim(v_waitlist.screen_name), '');
  if v_screen_name is null then raise exception 'Wait-list screen name is required'; end if;

  if not (
    (v_league = 'stroke' and v_division ~ '^Stroke D[1-5]$')
    or (v_league = 'match' and v_division ~ '^Match D[1-5]$')
    or (v_league = 'pyp' and v_division ~ '^PYP D[1-5]$')
    or (v_league = 'doubles' and v_division ~ '^Doubles (Elite|D[1-5])$')
    or (v_league = 'pro' and v_division = any(array['Pro D1', 'Pro D2', 'Pro D3', 'Semi Pro D1', 'Amateur D1']))
  ) then
    raise exception 'Division is not valid for this league';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('admin-waitlist:' || p_waitlist_id::text, 0)
  );

  if v_waitlist.player_id is not null then
    v_player_id := public.resolve_canonical_player_id(v_waitlist.player_id);
  end if;

  if nullif(btrim(v_waitlist.discord_id), '') is not null then
    select array_agg(distinct matched.canonical_id order by matched.canonical_id)
    into v_discord_matches
    from (
      select public.resolve_canonical_player_id(player.id) as canonical_id
      from public.players as player
      where nullif(btrim(player.discord_id), '') = btrim(v_waitlist.discord_id)
    ) as matched
    where matched.canonical_id is not null;

    if coalesce(cardinality(v_discord_matches), 0) > 1 then
      raise exception 'This Discord identity matches multiple canonical players. Resolve it before approval.' using errcode = '21000';
    end if;
    if cardinality(v_discord_matches) = 1 then
      if v_player_id is not null and v_player_id <> v_discord_matches[1] then
        raise exception 'The wait-list player and Discord identity resolve to different canonical players.' using errcode = '21000';
      end if;
      v_player_id := v_discord_matches[1];
    end if;
  end if;

  select array_agg(distinct matched.canonical_id order by matched.canonical_id)
  into v_name_matches
  from (
    select public.resolve_canonical_player_id(player.id) as canonical_id
    from public.players as player
    where lower(btrim(player.screen_name)) = lower(v_screen_name)
  ) as matched
  where matched.canonical_id is not null;

  if coalesce(cardinality(v_name_matches), 0) > 1 then
    raise exception 'That screen name matches multiple canonical players. Resolve it before approval.' using errcode = '21000';
  end if;
  if cardinality(v_name_matches) = 1 then
    if v_player_id is not null and v_player_id <> v_name_matches[1] then
      raise exception 'The wait-list name and Discord identity resolve to different canonical players.' using errcode = '21000';
    end if;
    v_player_id := v_name_matches[1];
  end if;

  if v_player_id is null then
    insert into public.players(
      screen_name,
      discord_id,
      discord_name,
      discord_username,
      discord_avatar,
      division,
      status,
      active
    ) values (
      v_screen_name,
      nullif(btrim(v_waitlist.discord_id), ''),
      nullif(btrim(v_waitlist.discord_username), ''),
      nullif(btrim(v_waitlist.discord_username), ''),
      nullif(btrim(v_waitlist.discord_avatar), ''),
      v_division,
      'active',
      true
    )
    returning * into v_player;
    v_player_id := v_player.id;
  else
    select player.* into v_player
    from public.players as player
    where player.id = v_player_id
    for update;

    if not found then raise exception 'Canonical player could not be resolved'; end if;
    if lower(coalesce(v_player.status, 'active')) = 'memorial' then
      raise exception 'Memorial players require separate administrator intervention' using errcode = '42501';
    end if;
    if nullif(btrim(v_player.discord_id), '') is not null
       and nullif(btrim(v_waitlist.discord_id), '') is not null
       and btrim(v_player.discord_id) <> btrim(v_waitlist.discord_id) then
      raise exception 'This canonical player is linked to a different Discord identity' using errcode = '23505';
    end if;

    update public.players
    set discord_id = coalesce(nullif(btrim(discord_id), ''), nullif(btrim(v_waitlist.discord_id), '')),
        discord_name = coalesce(nullif(btrim(discord_name), ''), nullif(btrim(v_waitlist.discord_username), '')),
        discord_username = coalesce(nullif(btrim(discord_username), ''), nullif(btrim(v_waitlist.discord_username), '')),
        discord_avatar = coalesce(nullif(btrim(discord_avatar), ''), nullif(btrim(v_waitlist.discord_avatar), '')),
        division = v_division,
        status = 'active',
        active = true
    where id = v_player_id
    returning * into v_player;
  end if;

  if nullif(btrim(v_waitlist.discord_id), '') is not null then
    if exists (
      select 1 from public.discord_members as member
      where member.discord_id = btrim(v_waitlist.discord_id)
        and member.player_id is not null
        and public.resolve_canonical_player_id(member.player_id) is distinct from v_player_id
    ) then
      raise exception 'This Discord identity is linked to a different canonical player' using errcode = '23505';
    end if;

    update public.discord_members
    set player_id = v_player_id,
        discord_name = coalesce(nullif(btrim(discord_name), ''), v_player.discord_name, v_player.screen_name),
        walkabout_name = v_player.screen_name,
        updated_at = now()
    where discord_id = btrim(v_waitlist.discord_id);

    if not found then
      insert into public.discord_members(discord_id, discord_name, walkabout_name, player_id)
      values (
        btrim(v_waitlist.discord_id),
        coalesce(nullif(btrim(v_waitlist.discord_username), ''), v_player.screen_name),
        v_player.screen_name,
        v_player_id
      );
    end if;
  end if;

  insert into public.player_league_memberships(player_id, league_type, season_number, division)
  values (v_player_id, v_league, p_season_number, v_division)
  on conflict (player_id, league_type, season_number, division) do nothing;

  update public.player_waitlist
  set player_id = v_player_id,
      preferred_division = v_division,
      status = 'approved'
  where id = v_waitlist.id;

  return jsonb_build_object(
    'waitlist_id', v_waitlist.id,
    'player_id', v_player_id,
    'screen_name', v_player.screen_name,
    'league_type', v_league,
    'season_number', p_season_number,
    'division', v_division,
    'status', 'approved'
  );
end;
$$;

create or replace function public.admin_remove_player_waitlist_entry(p_waitlist_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.player_waitlist%rowtype;
begin
  if not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode = '42501';
  end if;

  update public.player_waitlist
  set status = 'removed'
  where id = p_waitlist_id
    and status in ('waiting', 'pending')
  returning * into v_entry;

  if not found then
    raise exception 'An actionable wait-list entry was not found';
  end if;

  return jsonb_build_object('waitlist_id', v_entry.id, 'status', 'removed');
end;
$$;

revoke all on function public.admin_approve_player_waitlist_entry(uuid, text, integer) from public, anon;
revoke all on function public.admin_remove_player_waitlist_entry(uuid) from public, anon;
grant execute on function public.admin_approve_player_waitlist_entry(uuid, text, integer) to authenticated, service_role;
grant execute on function public.admin_remove_player_waitlist_entry(uuid) to authenticated, service_role;

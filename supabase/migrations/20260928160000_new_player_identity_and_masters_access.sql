-- Protected canonical player creation and transactional Discord participation.
-- No browser role receives direct INSERT access to public.players.

create or replace function public.admin_create_player(p_screen_name text)
returns table(id uuid, screen_name text, status text, active boolean)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_name text := nullif(btrim(p_screen_name), '');
  v_player public.players%rowtype;
begin
  if not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode = '42501';
  end if;
  if v_name is null then
    raise exception 'Screen name is required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('admin-create-player:' || lower(v_name), 0)
  );

  if exists (
    select 1 from public.players as player
    where lower(btrim(player.screen_name)) = lower(v_name)
  ) then
    raise exception 'A player with that screen name already exists' using errcode = '23505';
  end if;

  insert into public.players(screen_name, status, active)
  values (v_name, 'active', true)
  returning players.* into v_player;

  return query select v_player.id, v_player.screen_name, v_player.status, v_player.active;
end;
$function$;

revoke all on function public.admin_create_player(text) from public, anon, authenticated;
grant execute on function public.admin_create_player(text) to authenticated;

create or replace function public.ensure_current_discord_player_for_participation(
  p_screen_name text default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_discord_ids text[];
  v_discord_id text;
  v_discord_name text;
  v_discord_username text;
  v_discord_avatar text;
  v_requested_name text := nullif(btrim(p_screen_name), '');
  v_canonical_ids uuid[];
  v_name_ids uuid[];
  v_player_id uuid;
  v_player public.players%rowtype;
  v_member public.discord_members%rowtype;
begin
  if auth.uid() is null then
    raise exception 'You must sign in with Discord.' using errcode = '42501';
  end if;

  select array_agg(identity_row.discord_id order by identity_row.discord_id)
  into v_discord_ids
  from (
    select distinct nullif(btrim(coalesce(
      identity.identity_data ->> 'provider_id',
      identity.identity_data ->> 'id',
      identity.identity_data ->> 'sub'
    )), '') as discord_id
    from auth.identities as identity
    where identity.user_id = auth.uid() and identity.provider = 'discord'
  ) as identity_row
  where identity_row.discord_id is not null;

  if coalesce(cardinality(v_discord_ids), 0) <> 1 then
    raise exception 'A single Discord identity is required.' using errcode = '42501';
  end if;
  v_discord_id := v_discord_ids[1];

  select
    coalesce(nullif(btrim(identity.identity_data ->> 'global_name'), ''),
             nullif(btrim(identity.identity_data ->> 'username'), ''),
             v_discord_id),
    nullif(btrim(identity.identity_data ->> 'username'), ''),
    nullif(btrim(identity.identity_data ->> 'avatar'), '')
  into v_discord_name, v_discord_username, v_discord_avatar
  from auth.identities as identity
  where identity.user_id = auth.uid() and identity.provider = 'discord'
  order by identity.created_at desc
  limit 1;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('participation-discord:' || v_discord_id, 0)
  );

  select array_agg(matches.canonical_id order by matches.canonical_id)
  into v_canonical_ids
  from (
    select distinct public.resolve_canonical_player_id(player.id) as canonical_id
    from public.players as player
    where nullif(btrim(player.discord_id), '') = v_discord_id
  ) as matches;

  if coalesce(cardinality(v_canonical_ids), 0) > 1 then
    raise exception 'This Discord identity matches multiple canonical players. Contact an administrator.' using errcode = '21000';
  end if;

  if coalesce(cardinality(v_canonical_ids), 0) = 1 then
    v_player_id := v_canonical_ids[1];
  elsif v_requested_name is not null then
    select array_agg(matches.canonical_id order by matches.canonical_id)
    into v_name_ids
    from (
      select distinct public.resolve_canonical_player_id(player.id) as canonical_id
      from public.players as player
      where lower(btrim(player.screen_name)) = lower(v_requested_name)
    ) as matches;

    if coalesce(cardinality(v_name_ids), 0) > 1 then
      raise exception 'That screen name matches multiple canonical players. Contact an administrator.' using errcode = '21000';
    end if;
    if coalesce(cardinality(v_name_ids), 0) = 1 then
      v_player_id := v_name_ids[1];
    end if;
  end if;

  if v_player_id is null then
    if v_requested_name is null then
      raise exception 'Enter your Krys Leagues screen name to continue.' using errcode = '22023';
    end if;
    if exists (
      select 1 from public.players as player
      where lower(btrim(player.screen_name)) = lower(v_requested_name)
    ) then
      raise exception 'That screen name is already associated with another identity. Contact an administrator.' using errcode = '23505';
    end if;
    insert into public.players(screen_name, discord_id, discord_name, discord_username, discord_avatar, status, active)
    values (v_requested_name, v_discord_id, v_discord_name, v_discord_username, v_discord_avatar, 'active', true)
    returning players.* into v_player;
    v_player_id := v_player.id;
  else
    select player.* into v_player
    from public.players as player
    where player.id = v_player_id
    for update;
    if not found then raise exception 'Canonical player could not be resolved.'; end if;
    if lower(coalesce(v_player.status, 'active')) = 'memorial' then
      raise exception 'This player is not eligible to participate.' using errcode = '42501';
    end if;
    if v_player.discord_id is not null and btrim(v_player.discord_id) <> v_discord_id then
      raise exception 'This canonical player is linked to a different Discord identity.' using errcode = '23505';
    end if;
    update public.players
    set discord_id = v_discord_id,
        discord_name = coalesce(v_player.discord_name, v_discord_name),
        discord_username = coalesce(v_player.discord_username, v_discord_username),
        discord_avatar = coalesce(v_player.discord_avatar, v_discord_avatar),
        status = 'active',
        active = true
    where id = v_player_id;
  end if;

  select member.* into v_member
  from public.discord_members as member
  where member.discord_id = v_discord_id
  for update;
  if found then
    if v_member.player_id is not null
       and public.resolve_canonical_player_id(v_member.player_id) is distinct from v_player_id then
      raise exception 'This Discord identity is linked to another canonical player.' using errcode = '23505';
    end if;
    update public.discord_members
    set player_id = v_player_id,
        discord_name = v_discord_name,
        walkabout_name = (select screen_name from public.players where id = v_player_id),
        updated_at = now()
    where id = v_member.id;
  else
    insert into public.discord_members(discord_id, discord_name, walkabout_name, player_id)
    values (v_discord_id, v_discord_name, (select screen_name from public.players where id = v_player_id), v_player_id);
  end if;

  return v_player_id;
end;
$function$;

revoke all on function public.ensure_current_discord_player_for_participation(text) from public, anon, authenticated;

create or replace function public.register_current_discord_player(
  p_screen_name text,
  p_league_type text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_player_id uuid;
  v_discord_id text;
  v_entry public.player_waitlist%rowtype;
begin
  v_player_id := public.ensure_current_discord_player_for_participation(p_screen_name);
  select player.discord_id into v_discord_id from public.players as player where player.id = v_player_id;
  if exists (
    select 1 from public.player_waitlist as waiting
    where waiting.player_id = v_player_id
      and waiting.league_type = btrim(p_league_type)
      and waiting.status in ('waiting', 'pending')
  ) then
    raise exception 'This player is already registered for this league.' using errcode = '23505';
  end if;
  insert into public.player_waitlist(player_id, screen_name, league_type, discord_id, status, notes)
  values (v_player_id, (select screen_name from public.players where id = v_player_id), btrim(p_league_type), v_discord_id, 'waiting', nullif(btrim(p_notes), ''))
  returning * into v_entry;
  return jsonb_build_object('player_id', v_player_id, 'waitlist_id', v_entry.id, 'status', v_entry.status);
end;
$function$;

revoke all on function public.register_current_discord_player(text, text, text) from public, anon, authenticated;
grant execute on function public.register_current_discord_player(text, text, text) to authenticated;

create or replace function public.join_major_with_new_discord_player(
  p_major_event_id uuid,
  p_time_slot_ids uuid[],
  p_screen_name text default null,
  p_join_waitlist boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_player_id uuid;
  v_entry public.major_entries%rowtype;
begin
  v_player_id := public.ensure_current_discord_player_for_participation(p_screen_name);
  if p_join_waitlist then
    return public.join_major_waitlist_with_slots(p_major_event_id, p_time_slot_ids);
  end if;
  select public.signup_for_major_with_slots(p_major_event_id, p_time_slot_ids)
  into v_entry;
  return to_jsonb(v_entry);
end;
$function$;

revoke all on function public.join_major_with_new_discord_player(uuid, uuid[], text, boolean) from public, anon, authenticated;
grant execute on function public.join_major_with_new_discord_player(uuid, uuid[], text, boolean) to authenticated;

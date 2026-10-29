create or replace function public.set_site_player_discord_identity(
  p_player_id uuid,
  p_discord_id text,
  p_discord_name text
)
returns table(
  player_id uuid,
  discord_id text,
  discord_name text,
  discord_member_linked boolean
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_player public.players%rowtype;
  v_discord_id text := nullif(btrim(p_discord_id), '');
  v_discord_name text := nullif(btrim(p_discord_name), '');
  v_member_count integer := 0;
  v_member_linked boolean := false;
begin
  if not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode = '42501';
  end if;

  if p_player_id is null then
    raise exception 'Player ID is required';
  end if;

  if v_discord_id is not null and v_discord_id !~ '^[0-9]+$' then
    raise exception 'Discord user ID must contain digits only';
  end if;

  if v_discord_id is null and v_discord_name is not null then
    raise exception 'A Discord display name cannot be saved without a Discord user ID';
  end if;

  -- Serialize every supported canonical Discord mutation even before the
  -- live audit establishes whether a unique Discord-ID index can be added.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('site-player-discord-identity', 0)
  );

  select player.*
  into v_player
  from public.players as player
  where player.id = p_player_id
  for update;

  if not found then
    raise exception 'Canonical player was not found';
  end if;

  if v_player.discord_id is not null
     and v_discord_id is not null
     and btrim(v_player.discord_id) <> v_discord_id then
    raise exception 'Player already has a different Discord identity; unlink it explicitly before assigning another';
  end if;

  if v_discord_id is not null and exists (
    select 1
    from public.players as other_player
    where other_player.id <> p_player_id
      and nullif(btrim(other_player.discord_id), '') = v_discord_id
  ) then
    raise exception 'This Discord user ID is already linked to another canonical player' using errcode = '23505';
  end if;

  if v_discord_id is not null and exists (
    select 1
    from public.discord_members as member
    where member.player_id = p_player_id
      and nullif(btrim(member.discord_id), '') is distinct from v_discord_id
  ) then
    raise exception 'This canonical player is linked to a conflicting Discord member';
  end if;

  if v_discord_id is not null then
    select count(*)::integer
    into v_member_count
    from public.discord_members as member
    where nullif(btrim(member.discord_id), '') = v_discord_id;

    if v_member_count > 1 then
      raise exception 'Multiple Discord member rows use this Discord user ID; resolve the duplicate before linking';
    end if;

    if exists (
      select 1
      from public.discord_members as member
      where nullif(btrim(member.discord_id), '') = v_discord_id
        and member.player_id is not null
        and member.player_id <> p_player_id
    ) then
      raise exception 'This Discord member is already linked to another canonical player';
    end if;

    update public.discord_members as member
    set player_id = p_player_id,
        walkabout_name = v_player.screen_name
    where nullif(btrim(member.discord_id), '') = v_discord_id;

    v_member_linked := found;
  else
    update public.discord_members as member
    set player_id = null,
        walkabout_name = null
    where member.player_id = p_player_id;
  end if;

  update public.players as player
  set discord_id = v_discord_id,
      discord_name = v_discord_name
  where player.id = p_player_id
  returning player.* into v_player;

  return query
  select v_player.id, v_player.discord_id, v_player.discord_name, v_member_linked;
end;
$function$;

revoke all on function public.set_site_player_discord_identity(uuid, text, text) from public;
revoke all on function public.set_site_player_discord_identity(uuid, text, text) from anon;
revoke all on function public.set_site_player_discord_identity(uuid, text, text) from authenticated;
grant execute on function public.set_site_player_discord_identity(uuid, text, text) to authenticated;

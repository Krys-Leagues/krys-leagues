create or replace function public.admin_add_player_league_membership(
  p_player_id uuid,
  p_league_type text,
  p_season_number integer,
  p_division text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player public.players%rowtype;
  v_player_id uuid;
  v_membership_id uuid;
  v_league text := lower(nullif(btrim(p_league_type), ''));
  v_division text := nullif(btrim(p_division), '');
begin
  if not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode = '42501';
  end if;

  if p_player_id is null then raise exception 'Canonical player is required'; end if;
  if v_league is null or v_league <> all(array['stroke', 'match', 'pyp', 'doubles', 'pro', 'skins', 'kwt', 'solo']) then
    raise exception 'League type is not supported';
  end if;
  if p_season_number is null or p_season_number < 1 then
    raise exception 'A valid season number is required';
  end if;
  if v_division is null then raise exception 'Division is required'; end if;

  v_player_id := public.resolve_canonical_player_id(p_player_id);
  if v_player_id is null then raise exception 'Canonical player could not be resolved'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'admin-league-membership:' || v_player_id::text || ':' || v_league || ':' || p_season_number::text || ':' || lower(v_division),
      0
    )
  );

  select player.* into v_player
  from public.players as player
  where player.id = v_player_id
  for update;

  if not found then raise exception 'Canonical player could not be resolved'; end if;
  if lower(coalesce(v_player.status, 'active')) = 'memorial' then
    raise exception 'Memorial players require separate administrator intervention' using errcode = '42501';
  end if;
  if lower(coalesce(v_player.status, 'active')) not in ('active', 'inactive', 'archived') then
    raise exception 'This canonical player is not eligible for league participation' using errcode = '42501';
  end if;

  insert into public.player_league_memberships(player_id, league_type, season_number, division)
  values (v_player_id, v_league, p_season_number, v_division)
  on conflict (player_id, league_type, season_number, division) do nothing
  returning id into v_membership_id;

  if v_membership_id is null then
    raise exception '% is already registered for % Season % %', v_player.screen_name, v_league, p_season_number, v_division using errcode = '23505';
  end if;

  if lower(coalesce(v_player.status, 'active')) in ('inactive', 'archived') or not coalesce(v_player.active, false) then
    update public.players
    set status = 'active', active = true
    where id = v_player_id;
  end if;

  return jsonb_build_object(
    'membership_id', v_membership_id,
    'player_id', v_player_id,
    'screen_name', v_player.screen_name,
    'league_type', v_league,
    'season_number', p_season_number,
    'division', v_division,
    'status', 'registered'
  );
end;
$$;

create or replace function public.admin_add_player_tournament_entry(
  p_player_id uuid,
  p_tournament_type text,
  p_bracket text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player public.players%rowtype;
  v_player_id uuid;
  v_entry_id uuid;
  v_tournament text := nullif(btrim(p_tournament_type), '');
  v_bracket text := nullif(btrim(p_bracket), '');
begin
  if not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode = '42501';
  end if;

  if p_player_id is null then raise exception 'Canonical player is required'; end if;
  if v_tournament is null then raise exception 'Tournament type is required'; end if;

  v_player_id := public.resolve_canonical_player_id(p_player_id);
  if v_player_id is null then raise exception 'Canonical player could not be resolved'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'admin-tournament-entry:' || v_player_id::text || ':' || lower(v_tournament) || ':' || lower(coalesce(v_bracket, '')),
      0
    )
  );

  select player.* into v_player
  from public.players as player
  where player.id = v_player_id
  for update;

  if not found then raise exception 'Canonical player could not be resolved'; end if;
  if lower(coalesce(v_player.status, 'active')) = 'memorial' then
    raise exception 'Memorial players require separate administrator intervention' using errcode = '42501';
  end if;
  if lower(coalesce(v_player.status, 'active')) not in ('active', 'inactive', 'archived') then
    raise exception 'This canonical player is not eligible for tournament participation' using errcode = '42501';
  end if;

  insert into public.player_tournament_entries(
    player_id,
    player_name,
    tournament_type,
    bracket,
    status
  ) values (
    v_player_id,
    v_player.screen_name,
    v_tournament,
    v_bracket,
    'registered'
  )
  on conflict (player_id, tournament_type, bracket, status) do nothing
  returning id into v_entry_id;

  if v_entry_id is null then
    raise exception '% is already registered for % %', v_player.screen_name, v_tournament, coalesce(v_bracket, '') using errcode = '23505';
  end if;

  if lower(coalesce(v_player.status, 'active')) in ('inactive', 'archived') or not coalesce(v_player.active, false) then
    update public.players
    set status = 'active', active = true
    where id = v_player_id;
  end if;

  return jsonb_build_object(
    'entry_id', v_entry_id,
    'player_id', v_player_id,
    'screen_name', v_player.screen_name,
    'tournament_type', v_tournament,
    'bracket', v_bracket,
    'status', 'registered'
  );
end;
$$;

revoke all on function public.admin_add_player_league_membership(uuid, text, integer, text) from public, anon;
revoke all on function public.admin_add_player_tournament_entry(uuid, text, text) from public, anon;
grant execute on function public.admin_add_player_league_membership(uuid, text, integer, text) to authenticated, service_role;
grant execute on function public.admin_add_player_tournament_entry(uuid, text, text) to authenticated, service_role;

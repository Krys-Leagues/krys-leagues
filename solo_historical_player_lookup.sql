begin;

create or replace function public.search_solo_historical_global_players(
  p_season_id uuid,
  p_search text
) returns table(id uuid, screen_name text, active boolean, status text)
language sql stable security definer set search_path to '' as $function$
  select player.id, player.screen_name, player.active, player.status::text
  from public.players as player
  where public.can_current_user_admin_solo()
    and exists (
      select 1 from public.seasons as season
      where season.id = p_season_id and lower(btrim(season.league_type)) = 'solo'
    )
    and nullif(btrim(p_search), '') is not null
    and public.resolve_canonical_player_id(player.id) = player.id
    and player.screen_name ilike '%' || btrim(p_search) || '%'
    and not exists (
      select 1 from public.solo_player_pool as pool
      where pool.season_id = p_season_id and pool.player_id = player.id
    )
  order by lower(player.screen_name), player.id
  limit 20;
$function$;

create or replace function public.find_solo_historical_player_by_discord_id(
  p_season_id uuid,
  p_discord_id text
) returns table(id uuid, screen_name text, active boolean, status text, discord_id text, already_in_pool boolean)
language sql stable security definer set search_path to '' as $function$
  select canonical_player.id,
         canonical_player.screen_name,
         canonical_player.active,
         canonical_player.status::text,
         btrim(discord_identity.discord_id),
         exists (
           select 1 from public.solo_player_pool as pool
           where pool.season_id = p_season_id and pool.player_id = canonical_player.id
         )
  from public.players as discord_identity
  join public.players as canonical_player
    on canonical_player.id = public.resolve_canonical_player_id(discord_identity.id)
  where public.can_current_user_admin_solo()
    and exists (
      select 1 from public.seasons as season
      where season.id = p_season_id and lower(btrim(season.league_type)) = 'solo'
    )
    and nullif(btrim(p_discord_id), '') ~ '^[0-9]{17,20}$'
    and nullif(btrim(discord_identity.discord_id), '') = btrim(p_discord_id)
    and public.resolve_canonical_player_id(canonical_player.id) = canonical_player.id
  order by canonical_player.id, discord_identity.id
  limit 1;
$function$;

create or replace function public.add_existing_player_to_solo_historical_pool(
  p_season_id uuid,
  p_player_id uuid
) returns table(id uuid, screen_name text)
language plpgsql security definer set search_path to '' as $function$
declare
  v_canonical_player_id uuid := public.resolve_canonical_player_id(p_player_id);
begin
  if auth.uid() is null or not public.can_current_user_admin_solo() then
    raise exception 'Solo administrator authorization is required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.seasons as season
    where season.id = p_season_id and lower(btrim(season.league_type)) = 'solo'
  ) then
    raise exception 'Managed Solo season was not found';
  end if;
  if not exists (select 1 from public.players as player where player.id = v_canonical_player_id) then
    raise exception 'Canonical Global Player was not found';
  end if;

  insert into public.solo_player_pool(season_id, player_id, added_by)
  values(p_season_id, v_canonical_player_id, auth.uid())
  on conflict do nothing;

  return query
  select player.id, player.screen_name
  from public.players as player
  where player.id = v_canonical_player_id;
end;
$function$;

revoke all on function public.search_solo_historical_global_players(uuid,text) from public, anon, authenticated;
revoke all on function public.find_solo_historical_player_by_discord_id(uuid,text) from public, anon, authenticated;
revoke all on function public.add_existing_player_to_solo_historical_pool(uuid,uuid) from public, anon, authenticated;
grant execute on function public.search_solo_historical_global_players(uuid,text) to authenticated;
grant execute on function public.find_solo_historical_player_by_discord_id(uuid,text) to authenticated;
grant execute on function public.add_existing_player_to_solo_historical_pool(uuid,uuid) to authenticated;

commit;

begin;

create or replace function public.find_solo_player_by_discord_id(
  p_season_id uuid,
  p_discord_id text
) returns table(
  id uuid,
  screen_name text,
  discord_id text,
  already_in_pool boolean
)
language sql
stable
security definer
set search_path to ''
as $function$
  select
    canonical_player.id,
    canonical_player.screen_name,
    btrim(discord_identity.discord_id),
    exists (
      select 1
      from public.solo_player_pool as pool
      where pool.season_id = p_season_id
        and pool.player_id = canonical_player.id
    )
  from public.players as discord_identity
  join public.players as canonical_player
    on canonical_player.id = public.resolve_canonical_player_id(discord_identity.id)
  where public.can_current_user_admin_solo()
    and exists (
      select 1
      from public.seasons as season
      where season.id = p_season_id
        and lower(btrim(season.league_type)) = 'solo'
    )
    and nullif(btrim(p_discord_id), '') ~ '^[0-9]{17,20}$'
    and nullif(btrim(discord_identity.discord_id), '') = btrim(p_discord_id)
    and canonical_player.active is true
    and coalesce(canonical_player.status::text, 'active') = 'active'
    and public.resolve_canonical_player_id(canonical_player.id) = canonical_player.id
  order by canonical_player.id, discord_identity.id
  limit 1;
$function$;

revoke all on function public.find_solo_player_by_discord_id(uuid,text)
from public, anon, authenticated;
grant execute on function public.find_solo_player_by_discord_id(uuid,text)
to authenticated;

commit;

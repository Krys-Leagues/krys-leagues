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
    player.id,
    player.screen_name,
    btrim(player.discord_id),
    exists (
      select 1
      from public.solo_player_pool as pool
      where pool.season_id = p_season_id
        and pool.player_id = player.id
    )
  from public.players as player
  where public.can_current_user_admin_solo()
    and exists (
      select 1
      from public.seasons as season
      where season.id = p_season_id
        and lower(btrim(season.league_type)) = 'solo'
    )
    and nullif(btrim(p_discord_id), '') ~ '^[0-9]{17,20}$'
    and nullif(btrim(player.discord_id), '') = btrim(p_discord_id)
    and player.active is true
    and coalesce(player.status::text, 'active') = 'active'
    and public.resolve_canonical_player_id(player.id) = player.id
  limit 1;
$function$;

revoke all on function public.find_solo_player_by_discord_id(uuid,text)
from public, anon, authenticated;
grant execute on function public.find_solo_player_by_discord_id(uuid,text)
to authenticated;

commit;

begin;

create or replace function public.search_solo_existing_global_players(
  p_season_id uuid,
  p_search text
) returns table(id uuid, screen_name text)
language sql
stable
security definer
set search_path to ''
as $function$
  select player.id, player.screen_name
  from public.players as player
  where public.can_current_user_admin_solo()
    and exists (
      select 1
      from public.seasons as season
      where season.id = p_season_id
        and lower(btrim(season.league_type)) = 'solo'
    )
    and nullif(btrim(p_search), '') is not null
    and player.active is true
    and coalesce(player.status::text, 'active') = 'active'
    and public.resolve_canonical_player_id(player.id) = player.id
    and player.screen_name ilike '%' || btrim(p_search) || '%'
    and not exists (
      select 1
      from public.solo_player_pool as pool
      where pool.season_id = p_season_id
        and pool.player_id = player.id
    )
  order by lower(player.screen_name), player.id
  limit 20;
$function$;

revoke all on function public.search_solo_existing_global_players(uuid,text)
from public, anon, authenticated;
grant execute on function public.search_solo_existing_global_players(uuid,text)
to authenticated;

commit;

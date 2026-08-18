begin;

create or replace function public.set_site_player_profile_recognition(
  p_player_id uuid,
  p_is_server_booster boolean,
  p_has_krys_server_tag boolean,
  p_profile_badges text[]
)
returns table(
  player_id uuid,
  is_server_booster boolean,
  has_krys_server_tag boolean,
  profile_badges text[]
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_badges text[];
begin
  if not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required';
  end if;

  if p_player_id is null then
    raise exception 'Player ID is required';
  end if;

  if p_is_server_booster is null or p_has_krys_server_tag is null then
    raise exception 'Recognition toggle values are required';
  end if;

  select coalesce(array_agg(distinct badge order by badge), array[]::text[])
  into v_badges
  from unnest(coalesce(p_profile_badges, array[]::text[])) as badge;

  if exists (
    select 1
    from unnest(v_badges) as badge
    where badge is null
       or badge not in ('Owner', 'Co-Head Admin', 'Tournament Admin')
  ) then
    raise exception 'One or more profile recognition badges are not allowed';
  end if;

  perform 1
  from public.players as player
  where player.id = p_player_id
  for update;

  if not found then
    raise exception 'Player UUID is invalid';
  end if;

  if public.resolve_canonical_player_id(p_player_id) is distinct from p_player_id then
    raise exception 'Recognition changes must target the canonical player UUID';
  end if;

  update public.players as player
  set
    is_server_booster = p_is_server_booster,
    has_krys_server_tag = p_has_krys_server_tag,
    profile_badges = v_badges
  where player.id = p_player_id;

  return query
  select
    player.id,
    player.is_server_booster,
    player.has_krys_server_tag,
    player.profile_badges
  from public.players as player
  where player.id = p_player_id;
end;
$function$;

revoke all on function public.set_site_player_profile_recognition(uuid, boolean, boolean, text[]) from public;
revoke all on function public.set_site_player_profile_recognition(uuid, boolean, boolean, text[]) from anon;
revoke all on function public.set_site_player_profile_recognition(uuid, boolean, boolean, text[]) from authenticated;
grant execute on function public.set_site_player_profile_recognition(uuid, boolean, boolean, text[]) to authenticated;

commit;

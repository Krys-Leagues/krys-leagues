create or replace function public.admin_update_player_status(
  p_player_id uuid,
  p_status text
)
returns table (
  id uuid,
  screen_name text,
  discord_id text,
  status text,
  active boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status text := lower(btrim(coalesce(p_status, '')));
begin
  if not public.is_current_user_site_admin() then
    raise exception 'Site administrator authorization is required'
      using errcode = '42501';
  end if;

  if v_status not in ('active', 'inactive', 'archived', 'memorial') then
    raise exception 'Unsupported player status: %', p_status
      using errcode = '22023';
  end if;

  if public.resolve_canonical_player_id(p_player_id) is distinct from p_player_id then
    raise exception 'Player status updates require a canonical player id'
      using errcode = '22023';
  end if;

  return query
    update public.players
       set status = v_status,
           active = (v_status = 'active')
     where public.players.id = p_player_id
     returning public.players.id,
               public.players.screen_name,
               public.players.discord_id,
               public.players.status,
               public.players.active;

  if not found then
    raise exception 'Canonical player not found'
      using errcode = '22023';
  end if;
end;
$$;

revoke execute on function public.admin_update_player_status(uuid, text) from public, anon;
grant execute on function public.admin_update_player_status(uuid, text) to authenticated;

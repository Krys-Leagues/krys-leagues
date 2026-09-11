begin;

-- Staging-only function fix. Production is intentionally untouched.
-- The function's RETURNS TABLE exposes an output variable named player_id.
-- Referencing ON CONFLICT (player_id) therefore collides with that variable;
-- target the existing primary-key constraint instead. Authorization, signature,
-- return shape, and grants remain unchanged.

create or replace function public.add_site_access_tester(p_player_id uuid)
returns table(player_id uuid, screen_name text, added_at timestamptz)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_saved public.site_access_testers%rowtype;
begin
  if not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required.' using errcode = '42501';
  end if;

  if p_player_id is null or public.resolve_canonical_player_id(p_player_id) is distinct from p_player_id then
    raise exception 'A current canonical player ID is required.' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.players as player
    where player.id = p_player_id
      and player.active is true
      and lower(coalesce(player.status::text, 'active')) not in ('inactive', 'retired', 'merged', 'archived')
  ) then
    raise exception 'Tester must be an active current player.' using errcode = '22023';
  end if;

  insert into public.site_access_testers(player_id, added_by)
  values (p_player_id, auth.uid())
  on conflict on constraint site_access_testers_pkey
  do update set player_id = excluded.player_id
  returning site_access_testers.* into v_saved;

  return query
  select v_saved.player_id, player.screen_name, v_saved.added_at
  from public.players as player where player.id = v_saved.player_id;
end;
$function$;

commit;

begin;

create table if not exists public.site_access_testers (
  player_id uuid primary key references public.players(id) on delete restrict,
  added_at timestamptz not null default now(),
  added_by uuid references auth.users(id) on delete set null
);

alter table public.site_access_testers enable row level security;
revoke all on table public.site_access_testers from public, anon, authenticated;

create or replace function public.get_current_site_access()
returns table(
  authenticated boolean,
  canonical_player_id uuid,
  approved_tester boolean,
  site_admin boolean
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_player_id uuid;
  v_site_admin boolean := false;
  v_current boolean := false;
begin
  if auth.uid() is null then
    return query select false, null::uuid, false, false;
    return;
  end if;

  v_site_admin := public.is_current_user_site_admin();
  v_player_id := public.current_user_canonical_player_id();

  if v_player_id is not null then
    select exists (
      select 1
      from public.players as player
      where player.id = v_player_id
        and public.resolve_canonical_player_id(player.id) = player.id
        and player.active is true
        and lower(coalesce(player.status::text, 'active')) not in ('inactive', 'retired', 'merged', 'archived')
    ) into v_current;
  end if;

  return query
  select
    true,
    case when v_current then v_player_id else null::uuid end,
    v_current and exists (
      select 1 from public.site_access_testers as tester where tester.player_id = v_player_id
    ),
    v_site_admin;
end;
$function$;

create or replace function public.list_site_access_testers()
returns table(player_id uuid, screen_name text, added_at timestamptz)
language sql
stable
security definer
set search_path to ''
as $function$
  select tester.player_id, player.screen_name, tester.added_at
  from public.site_access_testers as tester
  join public.players as player on player.id = tester.player_id
  where public.is_current_user_site_admin()
  order by player.screen_name, tester.player_id;
$function$;

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
  on conflict (player_id) do update set player_id = excluded.player_id
  returning * into v_saved;

  return query
  select v_saved.player_id, player.screen_name, v_saved.added_at
  from public.players as player where player.id = v_saved.player_id;
end;
$function$;

create or replace function public.remove_site_access_tester(p_player_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required.' using errcode = '42501';
  end if;

  delete from public.site_access_testers as tester where tester.player_id = p_player_id;
end;
$function$;

revoke all on function public.get_current_site_access() from public, anon, authenticated;
revoke all on function public.list_site_access_testers() from public, anon, authenticated;
revoke all on function public.add_site_access_tester(uuid) from public, anon, authenticated;
revoke all on function public.remove_site_access_tester(uuid) from public, anon, authenticated;

grant execute on function public.get_current_site_access() to anon, authenticated;
grant execute on function public.list_site_access_testers() to authenticated;
grant execute on function public.add_site_access_tester(uuid) to authenticated;
grant execute on function public.remove_site_access_tester(uuid) to authenticated;

commit;

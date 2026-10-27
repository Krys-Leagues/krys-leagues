begin;

create table if not exists public.solo_admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  player_id uuid not null unique references public.players(id) on delete restrict,
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users(id) on delete set null
);

alter table public.solo_admin_users enable row level security;
revoke all on table public.solo_admin_users from public, anon, authenticated;

create table if not exists public.solo_player_pool (
  season_id uuid not null references public.seasons(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete restrict,
  added_at timestamptz not null default now(),
  added_by uuid references auth.users(id) on delete restrict,
  primary key (season_id, player_id)
);

-- Existing managed roster members are already established Solo participants.
insert into public.solo_player_pool(season_id, player_id)
select distinct entry.season_id, entry.player_id
from public.solo_roster_entries as entry
on conflict do nothing;

alter table public.solo_player_pool enable row level security;
drop policy if exists "Authenticated users can read Solo player pool" on public.solo_player_pool;
create policy "Authenticated users can read Solo player pool"
  on public.solo_player_pool for select to authenticated using (true);
grant select on public.solo_player_pool to authenticated;
revoke insert, update, delete on public.solo_player_pool from public, anon, authenticated;

create or replace function public.is_current_user_solo_admin()
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select auth.uid() is not null
    and exists (
      select 1 from public.solo_admin_users as solo_admin
      where solo_admin.user_id = auth.uid()
    );
$function$;

create or replace function public.can_current_user_admin_solo()
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select auth.uid() is not null
    and (public.is_current_user_site_admin() or public.is_current_user_solo_admin());
$function$;

revoke all on function public.is_current_user_solo_admin() from public, anon, authenticated;
revoke all on function public.can_current_user_admin_solo() from public, anon, authenticated;
grant execute on function public.is_current_user_solo_admin() to authenticated;
grant execute on function public.can_current_user_admin_solo() to authenticated;

-- Preserve the deployed Solo logic byte-for-byte except for its authorization predicate.
-- This deliberately does not touch any non-Solo RPC.
do $migration$
declare
  function_definition text;
  changed_definition text;
begin
  for function_definition in
    select pg_get_functiondef(procedure.oid)
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in (
        'save_solo_roster',
        'approve_solo_roster_version',
        'update_solo_week',
        'save_solo_score_attempt',
        'delete_solo_score_attempt',
        'close_solo_week',
        'reopen_solo_week'
      )
  loop
    changed_definition := replace(
      function_definition,
      'public.is_current_user_site_admin()',
      'public.can_current_user_admin_solo()'
    );
    if changed_definition = function_definition then
      raise exception 'Expected Solo authorization predicate was not found';
    end if;
    execute changed_definition;
  end loop;
end;
$migration$;

create or replace function public.create_solo_season_with_roster(
  p_season_number integer, p_start_date date, p_end_date date
) returns table(season_id uuid, roster_version_id uuid)
language plpgsql security definer set search_path to '' as $function$
declare v_season_id uuid; v_roster_id uuid;
begin
  if auth.uid() is null or not public.can_current_user_admin_solo() then raise exception 'Solo administrator authorization is required' using errcode='42501'; end if;
  if p_season_number is null or p_season_number <= 0 then raise exception 'Season number must be greater than zero'; end if;
  if p_start_date is not null and p_end_date is not null and p_end_date < p_start_date then raise exception 'End date cannot be before start date'; end if;
  if exists(select 1 from public.seasons where lower(btrim(league_type))='solo' and season_number=p_season_number) then raise exception 'Solo Season % already exists', p_season_number using errcode='23505'; end if;
  insert into public.seasons(league_type, season_number, start_date, due_date, end_date, is_active, is_locked)
  values('solo', p_season_number, p_start_date, p_end_date, p_end_date, false, false) returning id into v_season_id;
  insert into public.solo_roster_versions(season_id, version_number, status) values(v_season_id, 1, 'draft') returning id into v_roster_id;
  insert into public.solo_weeks(season_id, week_number, status)
  select v_season_id, week_number, 'open' from generate_series(1,4) as week_number;
  return query select v_season_id, v_roster_id;
end;
$function$;

create or replace function public.update_solo_season_dates(
  p_season_id uuid, p_start_date date, p_end_date date
) returns public.seasons
language plpgsql security definer set search_path to '' as $function$
declare v_season public.seasons%rowtype;
begin
  if auth.uid() is null or not public.can_current_user_admin_solo() then raise exception 'Solo administrator authorization is required' using errcode='42501'; end if;
  if p_start_date is not null and p_end_date is not null and p_end_date < p_start_date then raise exception 'End date cannot be before start date'; end if;
  update public.seasons
  set start_date = p_start_date, due_date = p_end_date, end_date = p_end_date
  where id = p_season_id and lower(btrim(league_type)) = 'solo'
  returning * into v_season;
  if not found then raise exception 'Managed Solo season was not found'; end if;
  return v_season;
end;
$function$;

create or replace function public.add_existing_player_to_solo_pool(
  p_season_id uuid, p_player_id uuid
) returns table(id uuid, screen_name text)
language plpgsql security definer set search_path to '' as $function$
begin
  if auth.uid() is null or not public.can_current_user_admin_solo() then raise exception 'Solo administrator authorization is required' using errcode='42501'; end if;
  if not exists(select 1 from public.seasons where seasons.id = p_season_id and lower(btrim(league_type)) = 'solo') then raise exception 'Managed Solo season was not found'; end if;
  if not exists(select 1 from public.players where players.id = p_player_id and active) then raise exception 'Active Global Player was not found'; end if;
  insert into public.solo_player_pool(season_id, player_id, added_by)
  values(p_season_id, p_player_id, auth.uid()) on conflict do nothing;
  return query select player.id, player.screen_name from public.players as player where player.id = p_player_id;
end;
$function$;

create or replace function public.create_solo_canonical_player(
  p_season_id uuid, p_screen_name text, p_discord_id text
) returns table(id uuid, screen_name text)
language plpgsql security definer set search_path to '' as $function$
declare
  v_screen_name text := nullif(btrim(p_screen_name), '');
  v_discord_id text := nullif(btrim(p_discord_id), '');
  v_player_id uuid;
begin
  if auth.uid() is null or not public.can_current_user_admin_solo() then raise exception 'Solo administrator authorization is required' using errcode='42501'; end if;
  if not exists(select 1 from public.seasons where seasons.id = p_season_id and lower(btrim(league_type)) = 'solo') then raise exception 'Managed Solo season was not found'; end if;
  if v_screen_name is null then raise exception 'Screen name is required'; end if;
  if v_discord_id is null or v_discord_id !~ '^[0-9]{17,20}$' then raise exception 'A valid numeric Discord ID is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('canonical-discord:' || v_discord_id, 0));
  if exists(select 1 from public.players as player where nullif(btrim(player.discord_id), '') = v_discord_id) then
    raise exception 'Discord ID already belongs to another player' using errcode='23505';
  end if;
  if exists(select 1 from public.players as player where lower(btrim(player.screen_name)) = lower(v_screen_name)) then
    raise exception 'A player with that screen name already exists' using errcode='23505';
  end if;
  insert into public.players(screen_name, discord_id, active, status)
  values(v_screen_name, v_discord_id, true, 'active') returning players.id into v_player_id;
  insert into public.solo_player_pool(season_id, player_id, added_by)
  values(p_season_id, v_player_id, auth.uid());
  return query select v_player_id, v_screen_name;
end;
$function$;

revoke all on function public.create_solo_season_with_roster(integer,date,date) from public, anon, authenticated;
revoke all on function public.update_solo_season_dates(uuid,date,date) from public, anon, authenticated;
revoke all on function public.add_existing_player_to_solo_pool(uuid,uuid) from public, anon, authenticated;
revoke all on function public.create_solo_canonical_player(uuid,text,text) from public, anon, authenticated;
grant execute on function public.create_solo_season_with_roster(integer,date,date) to authenticated;
grant execute on function public.update_solo_season_dates(uuid,date,date) to authenticated;
grant execute on function public.add_existing_player_to_solo_pool(uuid,uuid) to authenticated;
grant execute on function public.create_solo_canonical_player(uuid,text,text) to authenticated;

commit;

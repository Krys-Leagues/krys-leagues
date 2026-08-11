-- Install after site_admin_authorization.sql.
-- This migration is intentionally rule-agnostic. It does not define scoring,
-- qualification, seeding, brackets, advancement, field size, or tie breakers.

create extension if not exists pgcrypto;

create table if not exists public.major_events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug = lower(slug) and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (btrim(name) <> ''),
  year integer,
  status text not null default 'draft' check (status in ('draft', 'registration', 'scheduled', 'live', 'complete', 'cancelled')),
  signup_open boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  is_public boolean not null default false,
  description text,
  stream_url text,
  stream_platform text,
  stream_label text,
  stream_scheduled_at timestamptz,
  stream_is_live boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint major_events_date_order check (ends_at is null or starts_at is null or ends_at >= starts_at),
  constraint major_events_stream_url check (stream_url is null or stream_url ~ '^https://')
);

create table if not exists public.major_entries (
  id uuid primary key default gen_random_uuid(),
  major_event_id uuid not null references public.major_events(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete restrict,
  player_screen_name_snapshot text not null check (btrim(player_screen_name_snapshot) <> ''),
  status text not null default 'registered' check (status in ('registered', 'confirmed', 'waitlisted', 'withdrawn', 'declined')),
  registered_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (major_event_id, player_id)
);

create index if not exists major_entries_event_status_idx
  on public.major_entries (major_event_id, status, registered_at);

alter table public.major_events enable row level security;
alter table public.major_entries enable row level security;

revoke all on table public.major_events from public, anon, authenticated;
revoke all on table public.major_entries from public, anon, authenticated;
grant select on table public.major_events to anon, authenticated;
grant select on table public.major_entries to anon, authenticated;

drop policy if exists "Public can read visible Majors" on public.major_events;
create policy "Public can read visible Majors"
on public.major_events for select
to anon, authenticated
using (is_public);

drop policy if exists "Admins can read all Majors" on public.major_events;
create policy "Admins can read all Majors"
on public.major_events for select
to authenticated
using (public.is_current_user_site_admin());

drop policy if exists "Public can read visible Major entrants" on public.major_entries;
create policy "Public can read visible Major entrants"
on public.major_entries for select
to anon, authenticated
using (
  status not in ('withdrawn', 'declined')
  and exists (
    select 1 from public.major_events event
    where event.id = major_entries.major_event_id and event.is_public
  )
);

drop policy if exists "Admins can read all Major entrants" on public.major_entries;
create policy "Admins can read all Major entrants"
on public.major_entries for select
to authenticated
using (public.is_current_user_site_admin());

create or replace function public.touch_major_updated_at()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

drop trigger if exists major_events_touch_updated_at on public.major_events;
create trigger major_events_touch_updated_at
before update on public.major_events
for each row execute function public.touch_major_updated_at();

drop trigger if exists major_entries_touch_updated_at on public.major_entries;
create trigger major_entries_touch_updated_at
before update on public.major_entries
for each row execute function public.touch_major_updated_at();

create or replace function public.save_major_event(
  p_id uuid,
  p_slug text,
  p_name text,
  p_year integer,
  p_status text,
  p_signup_open boolean,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_is_public boolean,
  p_description text,
  p_stream_url text,
  p_stream_platform text,
  p_stream_label text,
  p_stream_scheduled_at timestamptz,
  p_stream_is_live boolean
)
returns public.major_events
language plpgsql
security definer
set search_path to ''
as $function$
declare
  saved public.major_events;
begin
  if not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode = '42501';
  end if;

  if p_id is null then
    insert into public.major_events (
      slug, name, year, status, signup_open, starts_at, ends_at, is_public,
      description, stream_url, stream_platform, stream_label,
      stream_scheduled_at, stream_is_live
    ) values (
      lower(btrim(p_slug)), btrim(p_name), p_year, p_status, p_signup_open,
      p_starts_at, p_ends_at, p_is_public, nullif(btrim(p_description), ''),
      nullif(btrim(p_stream_url), ''), nullif(btrim(p_stream_platform), ''),
      nullif(btrim(p_stream_label), ''), p_stream_scheduled_at, p_stream_is_live
    ) returning * into saved;
  else
    update public.major_events set
      slug = lower(btrim(p_slug)), name = btrim(p_name), year = p_year,
      status = p_status, signup_open = p_signup_open, starts_at = p_starts_at,
      ends_at = p_ends_at, is_public = p_is_public,
      description = nullif(btrim(p_description), ''),
      stream_url = nullif(btrim(p_stream_url), ''),
      stream_platform = nullif(btrim(p_stream_platform), ''),
      stream_label = nullif(btrim(p_stream_label), ''),
      stream_scheduled_at = p_stream_scheduled_at,
      stream_is_live = p_stream_is_live
    where id = p_id
    returning * into saved;

    if saved.id is null then raise exception 'Major event not found'; end if;
  end if;

  return saved;
end;
$function$;

create or replace function public.signup_for_major(p_major_event_id uuid)
returns public.major_entries
language plpgsql
security definer
set search_path to ''
as $function$
declare
  provider_id text;
  matched_count bigint;
  matched_player_id uuid;
  matched_player_screen_name text;
  saved public.major_entries;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.major_events event
    where event.id = p_major_event_id and event.is_public and event.signup_open
  ) then
    raise exception 'Signup is not open for this Major';
  end if;

  if coalesce(auth.jwt() -> 'app_metadata' ->> 'provider', '') <> 'discord'
    and not (coalesce(auth.jwt() -> 'app_metadata' -> 'providers', '[]'::jsonb) ? 'discord')
  then
    raise exception 'Discord authentication is required' using errcode = '42501';
  end if;

  provider_id := coalesce(
    nullif(btrim(auth.jwt() -> 'user_metadata' ->> 'provider_id'), ''),
    nullif(btrim(auth.jwt() -> 'user_metadata' ->> 'sub'), '')
  );
  if provider_id is null then
    raise exception 'Discord identity could not be verified' using errcode = '42501';
  end if;

  select count(*)
  into matched_count
  from public.players player
  where player.discord_id = provider_id;

  if matched_count = 0 then
    raise exception 'No Krys Leagues player is linked to this Discord account' using errcode = '42501';
  elsif matched_count > 1 then
    raise exception 'This Discord account is linked to multiple players; an administrator must resolve it' using errcode = '21000';
  end if;

  select player.id, player.screen_name
  into strict matched_player_id, matched_player_screen_name
  from public.players player
  where player.discord_id = provider_id;

  insert into public.major_entries (major_event_id, player_id, player_screen_name_snapshot)
  values (p_major_event_id, matched_player_id, matched_player_screen_name)
  on conflict (major_event_id, player_id) do nothing
  returning * into saved;

  if saved.id is null then
    raise exception 'This player is already registered for this Major' using errcode = '23505';
  end if;

  return saved;
end;
$function$;

create or replace function public.set_major_entry_status(p_entry_id uuid, p_status text)
returns public.major_entries
language plpgsql
security definer
set search_path to ''
as $function$
declare saved public.major_entries;
begin
  if not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode = '42501';
  end if;
  update public.major_entries set status = p_status where id = p_entry_id returning * into saved;
  if saved.id is null then raise exception 'Major entry not found'; end if;
  return saved;
end;
$function$;

create or replace function public.admin_register_major_player(p_major_event_id uuid, p_player_id uuid)
returns public.major_entries
language plpgsql
security definer
set search_path to ''
as $function$
declare saved public.major_entries;
begin
  if not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode = '42501';
  end if;
  insert into public.major_entries (major_event_id, player_id, player_screen_name_snapshot)
  select p_major_event_id, player.id, player.screen_name
  from public.players player where player.id = p_player_id
  on conflict (major_event_id, player_id) do nothing
  returning * into saved;

  if saved.id is null then
    if not exists (select 1 from public.players player where player.id = p_player_id) then
      raise exception 'Player not found';
    end if;
    raise exception 'This player is already registered for this Major' using errcode = '23505';
  end if;

  return saved;
end;
$function$;

revoke all on function public.save_major_event(uuid,text,text,integer,text,boolean,timestamptz,timestamptz,boolean,text,text,text,text,timestamptz,boolean) from public, anon, authenticated;
revoke all on function public.signup_for_major(uuid) from public, anon, authenticated;
revoke all on function public.set_major_entry_status(uuid,text) from public, anon, authenticated;
revoke all on function public.admin_register_major_player(uuid,uuid) from public, anon, authenticated;

grant execute on function public.save_major_event(uuid,text,text,integer,text,boolean,timestamptz,timestamptz,boolean,text,text,text,text,timestamptz,boolean) to authenticated;
grant execute on function public.signup_for_major(uuid) to authenticated;
grant execute on function public.set_major_entry_status(uuid,text) to authenticated;
grant execute on function public.admin_register_major_player(uuid,uuid) to authenticated;

-- Four private draft slots. Admins must replace placeholder names and configure
-- dates/rules before publishing; no competition facts are assumed here.
insert into public.major_events (slug, name)
values ('major-1', 'Major 1'), ('major-2', 'Major 2'), ('major-3', 'Major 3'), ('major-4', 'Major 4')
on conflict (slug) do nothing;

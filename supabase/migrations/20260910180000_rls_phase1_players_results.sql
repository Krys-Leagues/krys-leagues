-- Krys Leagues RLS Phase 1 (staging first)
--
-- This migration is intentionally limited to the schema and RPC surface
-- needed to validate public.players and public.results. It contains no data.
-- Do not apply to production until the staging report is approved.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.players (
  id uuid primary key default extensions.gen_random_uuid(),
  screen_name text not null,
  active boolean not null default true,
  status text not null default 'active',
  league_type text null,
  division text null,
  discord_id text null,
  discord_name text null,
  discord_username text null,
  discord_avatar text null,
  avatar_path text null,
  is_server_booster boolean not null default false,
  has_krys_server_tag boolean not null default false,
  profile_badges text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.results (
  id uuid primary key default extensions.gen_random_uuid(),
  schedule_id uuid null,
  league_type text not null,
  division text null,
  season_number integer null,
  game text null,
  course text null,
  player1 text null,
  player2 text null,
  player1_id uuid null,
  player2_id uuid null,
  result_type text null,
  player1_score integer null,
  player2_score integer null,
  player1_hw integer null,
  player2_hw integer null,
  player1_points integer null,
  player2_points integer null,
  player1_easy_score integer null,
  player1_hard_score integer null,
  player2_easy_score integer null,
  player2_hard_score integer null,
  winner text null,
  is_draw boolean null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.seasons (
  id uuid primary key default extensions.gen_random_uuid(),
  league_type text not null,
  season_number integer not null,
  division text null,
  start_date date null,
  due_date date null,
  end_date date null,
  game1_course text null,
  game2_course text null,
  game3_course text null,
  is_active boolean not null default false,
  is_locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (league_type, season_number, division)
);

create table if not exists public.schedule (
  id uuid primary key default extensions.gen_random_uuid(),
  season_id uuid null references public.seasons(id) on delete restrict,
  league_type text not null,
  season_number integer null,
  division text null,
  division_number integer null,
  game text null,
  game_number integer null,
  course text null,
  player1 text null,
  player2 text null,
  player1_name text null,
  player2_name text null,
  player1_id uuid null references public.players(id) on delete restrict,
  player2_id uuid null references public.players(id) on delete restrict,
  roster_version_id uuid null,
  match_roster_version_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.season_standings (
  id uuid primary key default extensions.gen_random_uuid(),
  player_id uuid null references public.players(id) on delete restrict,
  league_type text not null,
  season_number integer not null,
  division text null,
  points integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  ties integer not null default 0,
  strokes integer not null default 0,
  rank integer null,
  updated_at timestamptz not null default now(),
  unique (player_id, league_type, season_number)
);

create table if not exists public.player_league_memberships (
  id uuid primary key default extensions.gen_random_uuid(),
  player_id uuid null references public.players(id) on delete restrict,
  league_type text not null,
  season_number integer not null,
  division text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.player_tournament_entries (
  id uuid primary key default extensions.gen_random_uuid(),
  player_id uuid null references public.players(id) on delete restrict,
  player_name text null,
  tournament_type text not null,
  bracket text null,
  status text null,
  created_at timestamptz not null default now()
);

create table if not exists public.player_identity_links (
  historical_player_id uuid primary key,
  canonical_player_id uuid not null references public.players(id) on delete restrict
);

create table if not exists public.site_admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Supporting tables for the existing protected Match/Stroke result RPCs.
create table if not exists public.match_roster_versions (
  id uuid primary key default extensions.gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete restrict,
  division_count integer not null,
  status text not null default 'draft',
  created_at timestamptz not null default now()
);

create table if not exists public.match_division_roster_slots (
  id uuid primary key default extensions.gen_random_uuid(),
  roster_version_id uuid not null references public.match_roster_versions(id) on delete restrict,
  season_id uuid not null references public.seasons(id) on delete restrict,
  division_number integer not null,
  slot_number integer not null,
  player_id uuid null references public.players(id) on delete restrict,
  player_screen_name text null,
  slot_status text not null default 'empty',
  created_at timestamptz not null default now()
);

create table if not exists public.match_schedule_state (
  season_id uuid primary key references public.seasons(id) on delete restrict,
  change_revision integer not null default 0,
  generated_revision integer not null default 0,
  reviewed_revision integer not null default 0,
  posted_revision integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.match_final_scorecards (
  id uuid primary key default extensions.gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete restrict,
  status text not null default 'draft',
  created_at timestamptz not null default now()
);

create table if not exists public.stroke_roster_versions (
  id uuid primary key default extensions.gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete restrict,
  division_count integer not null,
  status text not null default 'draft',
  locked_at timestamptz null,
  locked_by uuid null,
  created_at timestamptz not null default now()
);

create table if not exists public.stroke_division_roster_slots (
  id uuid primary key default extensions.gen_random_uuid(),
  roster_version_id uuid not null references public.stroke_roster_versions(id) on delete restrict,
  season_id uuid not null references public.seasons(id) on delete restrict,
  division_number integer not null,
  slot_number integer not null,
  player_id uuid null references public.players(id) on delete restrict,
  player_screen_name text null,
  slot_status text not null default 'empty',
  created_at timestamptz not null default now()
);

create table if not exists public.stroke_schedule_state (
  season_id uuid primary key references public.seasons(id) on delete restrict,
  change_revision integer not null default 0,
  generated_revision integer not null default 0,
  reviewed_revision integer not null default 0,
  posted_revision integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stroke_final_scorecards (
  id uuid primary key default extensions.gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete restrict,
  status text not null default 'draft',
  created_at timestamptz not null default now()
);

create or replace function public.touch_rls_phase1_updated_at()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists players_touch_updated_at on public.players;
create trigger players_touch_updated_at before update on public.players
for each row execute function public.touch_rls_phase1_updated_at();

drop trigger if exists results_touch_updated_at on public.results;
create trigger results_touch_updated_at before update on public.results
for each row execute function public.touch_rls_phase1_updated_at();

create or replace function public.is_current_user_site_admin()
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select auth.uid() is not null
    and exists (
      select 1 from public.site_admin_users as site_admin
      where site_admin.user_id = auth.uid()
    );
$$;

revoke all on function public.is_current_user_site_admin() from public, anon, authenticated;
grant execute on function public.is_current_user_site_admin() to authenticated;

-- Public player directory read path used by the current /players page.
create or replace function public.get_public_player_canonical_identity(p_player_id uuid)
returns table(canonical_player_id uuid, identity_player_ids uuid[])
language sql
stable
security definer
set search_path to ''
as $$
  select player.id, array[player.id]::uuid[]
  from public.players as player
  where player.id = p_player_id;
$$;

revoke all on function public.get_public_player_canonical_identity(uuid) from public, anon, authenticated;
grant execute on function public.get_public_player_canonical_identity(uuid) to anon, authenticated;

create or replace function public.admin_create_player(
  p_screen_name text,
  p_active boolean default true,
  p_status text default 'active',
  p_league_type text default null,
  p_division text default null,
  p_discord_id text default null,
  p_discord_username text default null,
  p_discord_avatar text default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare v_id uuid;
begin
  if not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode = '42501';
  end if;
  if p_screen_name is null or btrim(p_screen_name) = '' then
    raise exception 'Player name is required';
  end if;
  insert into public.players (screen_name, active, status, league_type, division, discord_id, discord_username, discord_avatar)
  values (btrim(p_screen_name), coalesce(p_active, true), coalesce(nullif(btrim(p_status), ''), 'active'), p_league_type, p_division, p_discord_id, p_discord_username, p_discord_avatar)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.admin_create_players(p_players jsonb)
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare v_row jsonb; v_count integer := 0; v_name text;
begin
  if not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_players) <> 'array' then raise exception 'Player batch must be a JSON array'; end if;
  for v_row in select value from jsonb_array_elements(p_players)
  loop
    v_name := btrim(coalesce(v_row->>'screen_name', ''));
    if v_name <> '' then
      insert into public.players (screen_name, active, status)
      values (v_name, coalesce((v_row->>'active')::boolean, true), coalesce(nullif(v_row->>'status', ''), 'active'));
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

create or replace function public.admin_update_player_status(
  p_player_id uuid,
  p_status text,
  p_active boolean
)
returns boolean
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode = '42501';
  end if;
  update public.players set status = p_status, active = p_active where id = p_player_id;
  return found;
end;
$$;

create or replace function public.admin_insert_result(
  p_league_type text,
  p_division text default null,
  p_season_number integer default null,
  p_game text default null,
  p_course text default null,
  p_player1 text default null,
  p_player2 text default null,
  p_player1_id uuid default null,
  p_player2_id uuid default null,
  p_result_type text default 'league_result',
  p_player1_score integer default null,
  p_player2_score integer default null,
  p_player1_hw integer default null,
  p_player2_hw integer default null,
  p_player1_points integer default null,
  p_player2_points integer default null,
  p_player1_easy_score integer default null,
  p_player1_hard_score integer default null,
  p_player2_easy_score integer default null,
  p_player2_hard_score integer default null,
  p_winner text default null,
  p_is_draw boolean default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare v_id uuid;
begin
  if not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode = '42501';
  end if;
  if p_league_type is null or btrim(p_league_type) = '' then raise exception 'League type is required'; end if;
  insert into public.results (
    league_type, division, season_number, game, course, player1, player2, player1_id, player2_id,
    result_type, player1_score, player2_score, player1_hw, player2_hw, player1_points, player2_points,
    player1_easy_score, player1_hard_score, player2_easy_score, player2_hard_score, winner, is_draw
  ) values (
    btrim(p_league_type), p_division, p_season_number, p_game, p_course, p_player1, p_player2, p_player1_id, p_player2_id,
    coalesce(p_result_type, 'league_result'), p_player1_score, p_player2_score, p_player1_hw, p_player2_hw, p_player1_points, p_player2_points,
    p_player1_easy_score, p_player1_hard_score, p_player2_easy_score, p_player2_hard_score, p_winner, p_is_draw
  ) returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.admin_create_player(text, boolean, text, text, text, text, text, text) from public, anon;
revoke all on function public.admin_create_players(jsonb) from public, anon;
revoke all on function public.admin_update_player_status(uuid, text, boolean) from public, anon;
revoke all on function public.admin_insert_result(text, text, integer, text, text, text, text, uuid, uuid, text, integer, integer, integer, integer, integer, integer, integer, integer, integer, integer, text, boolean) from public, anon;
grant execute on function public.admin_create_player(text, boolean, text, text, text, text, text, text) to authenticated;
grant execute on function public.admin_create_players(jsonb) to authenticated;
grant execute on function public.admin_update_player_status(uuid, text, boolean) to authenticated;
grant execute on function public.admin_insert_result(text, text, integer, text, text, text, text, uuid, uuid, text, integer, integer, integer, integer, integer, integer, integer, integer, integer, integer, text, boolean) to authenticated;

-- Phase 1 target: public reads remain available; direct browser writes do not.
alter table public.players enable row level security;
alter table public.results enable row level security;

revoke all on table public.players, public.results from public, anon, authenticated;
grant select on table public.players, public.results to anon, authenticated;
grant all on table public.players, public.results to service_role;

drop policy if exists players_public_read on public.players;
create policy players_public_read on public.players for select to anon, authenticated using (true);

drop policy if exists results_public_read on public.results;
create policy results_public_read on public.results for select to anon, authenticated using (true);

grant select on table public.seasons, public.schedule, public.season_standings to anon, authenticated;
grant select on table public.player_league_memberships, public.player_tournament_entries, public.player_identity_links to authenticated;
grant select on table public.match_roster_versions, public.match_division_roster_slots, public.match_schedule_state, public.match_final_scorecards to authenticated;
grant select on table public.stroke_roster_versions, public.stroke_division_roster_slots, public.stroke_schedule_state, public.stroke_final_scorecards to authenticated;

revoke all on table public.site_admin_users from public, anon, authenticated;

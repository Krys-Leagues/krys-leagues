-- Disposable PostgreSQL 17.11 contract fixture. Never run against Production.
create extension if not exists pgcrypto;
create schema if not exists auth;
do $$ begin
  create role anon;
  create role authenticated;
  create role service_role;
exception when duplicate_object then null;
end $$;
create table auth.users (id uuid primary key);
create table auth.identities (user_id uuid not null, provider text not null, identity_data jsonb not null);
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create table public.players (id uuid primary key, screen_name text not null, discord_id text, active boolean not null default true, status text);
create or replace function public.resolve_canonical_player_id(p_id uuid) returns uuid language sql stable as $$ select id from public.players where id = p_id and active $$;
create or replace function public.is_current_user_site_admin() returns boolean language sql stable as $$ select true $$;

create table public.tournaments (
  id uuid primary key default gen_random_uuid(), template_id uuid, name text not null, slug text not null unique,
  status text not null, bracket_size integer not null, registration_capacity integer not null, rules jsonb not null,
  schedule_preset text not null, schedule_timezone text not null, start_at timestamptz, overall_deadline_at timestamptz,
  created_by uuid not null
);
create table public.tournament_registrations (
  id uuid primary key default gen_random_uuid(), tournament_id uuid not null references public.tournaments(id), player_id uuid not null references public.players(id),
  status text not null default 'confirmed', seed integer, player_timezone text, timezone_confirmed_at timestamptz, registered_at timestamptz not null default now(), unique(tournament_id, player_id), unique(tournament_id, seed)
);
create table public.tournament_rounds (id uuid primary key default gen_random_uuid(), tournament_id uuid references public.tournaments(id), round_number integer, name text, is_final boolean, course_config jsonb, scoring_rules jsonb, tiebreaker_rules jsonb);
create table public.tournament_matches (id uuid primary key default gen_random_uuid(), tournament_id uuid references public.tournaments(id), round_number integer, match_number integer, stable_key text, slot_a jsonb, slot_b jsonb, player_a_id uuid, player_b_id uuid);
create table public.tournament_audit_log (id uuid primary key default gen_random_uuid(), tournament_id uuid, action text, details jsonb, actor_id uuid);

create or replace function public.register_for_tournament(p_tournament_id uuid, p_player_timezone text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_t public.tournaments%rowtype; v_discord text; v_player uuid; v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication is required'; end if;
  select identity_data ->> 'provider_id' into v_discord from auth.identities where user_id = auth.uid() and provider = 'discord' limit 1;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = btrim(p_player_timezone)) then raise exception 'A valid IANA player time zone is required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('tournament-registration:' || p_tournament_id::text, 0));
  select * into v_t from public.tournaments where id = p_tournament_id for update;
  if v_t.status <> 'registration_open' then raise exception 'Registration is not open'; end if;
  select public.resolve_canonical_player_id(id) into v_player from public.players where discord_id = v_discord and active;
  if v_player is null then raise exception 'No canonical player'; end if;
  if exists (select 1 from public.tournament_registrations where tournament_id = p_tournament_id and player_id = v_player and status = 'confirmed') then raise exception 'This player is already registered'; end if;
  if (select count(*) from public.tournament_registrations where tournament_id = p_tournament_id and status = 'confirmed') >= v_t.registration_capacity then raise exception 'This tournament is full'; end if;
  insert into public.tournament_registrations(tournament_id, player_id, player_timezone, timezone_confirmed_at) values(p_tournament_id, v_player, btrim(p_player_timezone), now()) returning id into v_id;
  return jsonb_build_object('registration_id', v_id, 'player_id', v_player, 'status', 'confirmed');
end $$;

insert into auth.users select gen_random_uuid() from generate_series(1, 33);
insert into public.players(id, screen_name, discord_id) select gen_random_uuid(), 'Player ' || n, 'discord-' || n from generate_series(1, 32) as n;
insert into auth.identities(user_id, provider, identity_data) select u.id, 'discord', jsonb_build_object('provider_id', p.discord_id) from (select id, row_number() over () as n from auth.users) u join (select discord_id, row_number() over () as n from public.players) p using (n);
select set_config('request.jwt.claim.sub', (select id::text from auth.users limit 1), false);

\ir ../../supabase/proposals/20261025_lynne_self_registration_and_bracket_seeding.proposed.sql

do $$
declare v_t uuid; v_t64 uuid; v_order jsonb; v_count integer;
begin
  select public.admin_create_tournament('5, 4, 3, 2, 1', 'five-four-three-two-one-test', null, 32, 'registration_open', '{}', '[{"name":"R1"},{"name":"R2"},{"name":"R3"},{"name":"R4"},{"name":"Final"}]', '[]', 'NORMAL', 'America/New_York', now(), now() + interval '7 days') into v_t;
  if (select count(*) from public.tournament_matches where tournament_id = v_t) <> 0 then raise exception 'Empty public-registration setup must not create bracket matches'; end if;
  for v_count in 1..32 loop
    perform set_config('request.jwt.claim.sub', (select u.id::text from auth.users u join auth.identities i on i.user_id = u.id where i.identity_data ->> 'provider_id' = 'discord-' || v_count), true);
    perform public.register_for_tournament(v_t, 'America/New_York');
  end loop;
  if (select count(*) from public.tournament_registrations where tournament_id = v_t and status = 'confirmed') <> 32 then raise exception 'Expected 32 confirmed registrations'; end if;
  begin
    perform public.register_for_tournament(v_t, 'America/New_York');
    raise exception 'Duplicate registration was accepted';
  exception when others then null;
  end;
  update public.tournaments set status = 'registration_closed' where id = v_t;
  select jsonb_agg(player_id order by registered_at, id) into v_order from public.tournament_registrations where tournament_id = v_t and status = 'confirmed';
  perform public.admin_seed_tournament(v_t, v_order);
  if (select count(*) from public.tournament_matches where tournament_id = v_t) <> 31 then raise exception 'Expected 31 seeded matches'; end if;
  select public.admin_create_tournament('64-player-test', 'sixty-four-test', null, 64, 'draft', '{}', '[{"name":"R1"},{"name":"R2"},{"name":"R3"},{"name":"R4"},{"name":"R5"},{"name":"Final"}]', '[]', 'NORMAL', 'America/New_York', now(), now() + interval '7 days') into v_t64;
  if (select count(*) from public.tournament_rounds where tournament_id = v_t64) <> 6 then raise exception 'Expected 6 rounds for a 64-player setup'; end if;
  begin
    perform public.admin_create_tournament('bad', 'bad-count', null, 32, 'draft', '{}', '[{"name":"R1"}]', '[{"player_id":"00000000-0000-0000-0000-000000000000"}]', 'NORMAL', 'America/New_York', now(), now() + interval '7 days');
    raise exception 'Invalid entrant count was accepted';
  exception when others then null;
  end;
end $$;

select 'PASS self-registration' as result,
       (select count(*) from public.tournament_registrations) as confirmed_registrations,
       (select count(*) from public.tournament_matches where tournament_id = (select id from public.tournaments where slug = 'five-four-three-two-one-test')) as seeded_matches,
       (select count(*) from public.tournament_rounds where tournament_id = (select id from public.tournaments where slug = 'sixty-four-test')) as sixty_four_rounds;

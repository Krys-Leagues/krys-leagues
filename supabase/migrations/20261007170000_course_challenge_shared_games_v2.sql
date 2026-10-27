-- Course Challenge Games v2 shared state.
-- A game has one selected course+difficulty code. Match's Easy->Hard->Easy
-- sequence is deliberately not represented here. SQLite is only a bot cache.

create table public.course_challenge_game_catalog (
  course_code text primary key,
  course_slug text not null,
  display_name text not null,
  difficulty text not null check (difficulty in ('Easy', 'Hard')),
  active boolean not null default true,
  display_order integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (course_slug, difficulty)
);

insert into public.course_challenge_game_catalog(course_code, course_slug, display_name, difficulty, display_order)
values
  ('TTE', 'tourist-trap', 'Tourist Trap', 'Easy', 1),
  ('TTH', 'tourist-trap', 'Tourist Trap', 'Hard', 2),
  ('CBE', 'cherry-blossom', 'Cherry Blossom', 'Easy', 3),
  ('CBH', 'cherry-blossom', 'Cherry Blossom', 'Hard', 4),
  ('AWE', '80-days-around-the-world', '80 Days Around the World', 'Easy', 5),
  ('AWH', '80-days-around-the-world', '80 Days Around the World', 'Hard', 6);

create table public.course_challenge_shared_games (
  game_id uuid primary key default gen_random_uuid(), revision bigint not null default 1 check (revision > 0),
  course_code text not null references public.course_challenge_game_catalog(course_code), course_slug text not null,
  difficulty text not null check (difficulty in ('Easy', 'Hard')), course_name_snapshot text not null,
  status text not null default 'forming' check (status in ('forming', 'started', 'game_ended', 'completed', 'voided')),
  created_by_player_id uuid not null references public.players(id) on delete restrict, created_by_discord_user_id text,
  source text not null check (source in ('website', 'discord')), lobby_minutes smallint not null check (lobby_minutes in (5, 10)),
  max_players smallint not null check (max_players between 2 and 4), created_at timestamptz not null default now(),
  lobby_expires_at timestamptz not null, started_at timestamptz, game_ended_at timestamptz, post_game_expires_at timestamptz,
  completed_at timestamptz, voided_at timestamptz, room_name text, discord_channel_id text, discord_thread_id text,
  discord_lobby_message_id text, updated_at timestamptz not null default now()
);

create table public.course_challenge_shared_game_participants (
  game_id uuid not null references public.course_challenge_shared_games(game_id) on delete cascade,
  player_id uuid not null references public.players(id) on delete restrict, discord_user_id text,
  screen_name_snapshot text not null, platform text not null check (platform in ('website', 'discord', 'both')),
  joined_at timestamptz not null default now(), left_at timestamptz, requirement_snapshot jsonb not null default '{}'::jsonb,
  score_disposition text check (score_disposition in ('pending', 'used_cc_score', 'no_cc_score')),
  primary key (game_id, player_id), unique (game_id, discord_user_id)
);

create table public.course_challenge_shared_game_player_locks (
  player_id uuid primary key references public.players(id) on delete restrict,
  game_id uuid not null references public.course_challenge_shared_games(game_id) on delete cascade, claimed_at timestamptz not null default now()
);
create table public.course_challenge_shared_game_void_votes (
  game_id uuid not null references public.course_challenge_shared_games(game_id) on delete cascade,
  player_id uuid not null references public.players(id) on delete restrict, voted_at timestamptz not null default now(), primary key (game_id, player_id)
);
create table public.course_challenge_shared_game_scorecards (
  scorecard_id uuid primary key default gen_random_uuid(), game_id uuid not null references public.course_challenge_shared_games(game_id) on delete cascade,
  player_id uuid not null references public.players(id) on delete restrict, attachment_ref text not null, file_name text, content_type text,
  submitted_at timestamptz not null default now(), unique (game_id, player_id, attachment_ref)
);
create table public.course_challenge_shared_game_deliveries (
  delivery_key text primary key, game_id uuid not null references public.course_challenge_shared_games(game_id) on delete cascade,
  player_id uuid not null references public.players(id) on delete restrict, scorecard_id uuid references public.course_challenge_shared_game_scorecards(scorecard_id),
  disposition text not null check (disposition in ('used_cc_score', 'no_cc_score')), status text not null default 'pending' check (status in ('pending', 'delivered', 'expired')),
  created_at timestamptz not null default now(), delivered_at timestamptz
);
create table public.course_challenge_shared_game_events (
  game_id uuid not null references public.course_challenge_shared_games(game_id) on delete cascade, event_key text not null, event_type text not null,
  actor_player_id uuid references public.players(id) on delete set null, metadata jsonb not null default '{}'::jsonb, occurred_at timestamptz not null default now(),
  primary key (game_id, event_key)
);
create table public.course_challenge_shared_game_rooms (
  room_name text primary key, game_id uuid not null unique references public.course_challenge_shared_games(game_id) on delete cascade, claimed_at timestamptz not null default now()
);
create index course_challenge_shared_games_active_idx on public.course_challenge_shared_games(status, lobby_expires_at);
create index course_challenge_shared_game_participants_player_idx on public.course_challenge_shared_game_participants(player_id, joined_at desc);
create index course_challenge_shared_game_events_time_idx on public.course_challenge_shared_game_events(game_id, occurred_at, event_key);

do $$ declare t text; begin
  foreach t in array array['course_challenge_game_catalog','course_challenge_shared_games','course_challenge_shared_game_participants','course_challenge_shared_game_player_locks','course_challenge_shared_game_void_votes','course_challenge_shared_game_scorecards','course_challenge_shared_game_deliveries','course_challenge_shared_game_events','course_challenge_shared_game_rooms'] loop
    execute format('alter table public.%I enable row level security', t); execute format('alter table public.%I force row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t); execute format('grant select on table public.%I to service_role', t);
  end loop;
end $$;

create or replace function public.resolve_course_challenge_discord_player(p_discord_user_id text)
returns table(player_id uuid, screen_name text) language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  select public.resolve_canonical_player_id(p.id) into v_id from public.players p
  where nullif(btrim(p.discord_id), '') = nullif(btrim(p_discord_user_id), '')
     or exists (select 1 from public.discord_members m where m.player_id = p.id and btrim(m.discord_id) = btrim(p_discord_user_id))
  group by public.resolve_canonical_player_id(p.id) having count(distinct public.resolve_canonical_player_id(p.id)) = 1;
  if v_id is null then raise exception using errcode = '22023', message = 'Discord identity does not resolve to exactly one canonical player.'; end if;
  return query select p.id, coalesce(nullif(btrim(p.screen_name), ''), p.id::text) from public.players p where p.id = v_id;
end $$;

create or replace function public.course_challenge_shared_game_create_for_player(p_player_id uuid, p_discord_user_id text, p_course_code text, p_lobby_minutes integer, p_max_players integer, p_source text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_game_id uuid := gen_random_uuid(); v_catalog public.course_challenge_game_catalog%rowtype; v_name text; v_expiry timestamptz;
begin
  select * into v_catalog from public.course_challenge_game_catalog where course_code = upper(btrim(p_course_code)) and active for share;
  if not found then raise exception using errcode = '22023', message = 'That Course Challenge course+difficulty is not eligible.'; end if;
  if p_lobby_minutes not in (5, 10) or p_max_players not between 2 and 4 then raise exception using errcode = '22023', message = 'Invalid lobby settings.'; end if;
  if exists (select 1 from public.course_challenge_shared_game_player_locks where player_id = p_player_id) then raise exception using errcode = '23505', message = 'Player is already in an active Course Challenge game.'; end if;
  select coalesce(nullif(btrim(screen_name), ''), p_player_id::text) into v_name from public.players where id = p_player_id;
  if v_name is null then raise exception using errcode = '22023', message = 'Canonical player was not found.'; end if;
  v_expiry := now() + make_interval(mins => p_lobby_minutes);
  insert into public.course_challenge_shared_games(game_id, course_code, course_slug, difficulty, course_name_snapshot, created_by_player_id, created_by_discord_user_id, source, lobby_minutes, max_players, lobby_expires_at)
  values (v_game_id, v_catalog.course_code, v_catalog.course_slug, v_catalog.difficulty, v_catalog.display_name, p_player_id, nullif(btrim(p_discord_user_id), ''), p_source, p_lobby_minutes, p_max_players, v_expiry);
  insert into public.course_challenge_shared_game_participants(game_id, player_id, discord_user_id, screen_name_snapshot, platform)
  values (v_game_id, p_player_id, nullif(btrim(p_discord_user_id), ''), v_name, case when p_discord_user_id is null then 'website' else 'discord' end);
  insert into public.course_challenge_shared_game_player_locks(player_id, game_id) values (p_player_id, v_game_id);
  insert into public.course_challenge_shared_game_events(game_id, event_key, event_type, actor_player_id, metadata)
  values (v_game_id, 'created:' || p_player_id::text, 'created', p_player_id, jsonb_build_object('courseCode', v_catalog.course_code, 'source', p_source));
  return jsonb_build_object('gameId', v_game_id, 'playerId', p_player_id, 'courseCode', v_catalog.course_code, 'difficulty', v_catalog.difficulty, 'courseName', v_catalog.display_name, 'lobbyExpiresAt', v_expiry);
end $$;
create or replace function public.course_challenge_shared_game_create(p_course_code text, p_lobby_minutes integer, p_max_players integer, p_source text default 'website') returns jsonb language plpgsql security definer set search_path = '' as $$ begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'Authenticated player required.'; end if;
  return public.course_challenge_shared_game_create_for_player(public.current_user_canonical_player_id(), null, p_course_code, p_lobby_minutes, p_max_players, p_source);
end $$;
create or replace function public.course_challenge_shared_game_create_discord(p_discord_user_id text, p_course_code text, p_lobby_minutes integer, p_max_players integer) returns jsonb language plpgsql security definer set search_path = '' as $$ declare v_player uuid; begin
  select player_id into v_player from public.resolve_course_challenge_discord_player(p_discord_user_id); return public.course_challenge_shared_game_create_for_player(v_player, p_discord_user_id, p_course_code, p_lobby_minutes, p_max_players, 'discord'); end $$;

create or replace function public.course_challenge_shared_game_join_for_player(p_game_id uuid, p_player_id uuid, p_discord_user_id text, p_source text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_game public.course_challenge_shared_games%rowtype; v_count integer; v_name text;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_game_id::text, 0)); select * into v_game from public.course_challenge_shared_games where game_id = p_game_id for update;
  if not found or v_game.status <> 'forming' or v_game.lobby_expires_at <= now() then raise exception using errcode = '22023', message = 'This game is no longer accepting players.'; end if;
  if exists (select 1 from public.course_challenge_shared_game_player_locks where player_id = p_player_id) then raise exception using errcode = '23505', message = 'Player is already in an active Course Challenge game.'; end if;
  select count(*) into v_count from public.course_challenge_shared_game_participants where game_id = p_game_id and left_at is null; if v_count >= v_game.max_players then raise exception using errcode = '22023', message = 'This game is full.'; end if;
  select coalesce(nullif(btrim(screen_name), ''), p_player_id::text) into v_name from public.players where id = p_player_id;
  insert into public.course_challenge_shared_game_participants(game_id, player_id, discord_user_id, screen_name_snapshot, platform) values (p_game_id, p_player_id, nullif(btrim(p_discord_user_id), ''), v_name, p_source);
  insert into public.course_challenge_shared_game_player_locks(player_id, game_id) values (p_player_id, p_game_id);
  insert into public.course_challenge_shared_game_events(game_id, event_key, event_type, actor_player_id) values (p_game_id, 'joined:' || p_player_id::text, 'joined', p_player_id) on conflict do nothing;
  return jsonb_build_object('gameId', p_game_id, 'playerId', p_player_id);
end $$;
create or replace function public.course_challenge_shared_game_join(p_game_id uuid) returns jsonb language plpgsql security definer set search_path = '' as $$ begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'Authenticated player required.'; end if; return public.course_challenge_shared_game_join_for_player(p_game_id, public.current_user_canonical_player_id(), null, 'website'); end $$;
create or replace function public.course_challenge_shared_game_join_discord(p_game_id uuid, p_discord_user_id text) returns jsonb language plpgsql security definer set search_path = '' as $$ declare v_player uuid; begin
  select player_id into v_player from public.resolve_course_challenge_discord_player(p_discord_user_id); return public.course_challenge_shared_game_join_for_player(p_game_id, v_player, p_discord_user_id, 'discord'); end $$;

create or replace function public.course_challenge_shared_game_leave_for_player(p_game_id uuid, p_player_id uuid) returns jsonb language plpgsql security definer set search_path = '' as $$ begin
  update public.course_challenge_shared_game_participants set left_at = coalesce(left_at, now()) where game_id = p_game_id and player_id = p_player_id and left_at is null;
  delete from public.course_challenge_shared_game_player_locks where player_id = p_player_id and game_id = p_game_id;
  insert into public.course_challenge_shared_game_events(game_id, event_key, event_type, actor_player_id) values (p_game_id, 'left:' || p_player_id::text, 'left', p_player_id) on conflict do nothing; return jsonb_build_object('ok', true, 'gameId', p_game_id); end $$;
create or replace function public.course_challenge_shared_game_leave(p_game_id uuid) returns jsonb language plpgsql security definer set search_path = '' as $$ begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'Authenticated player required.'; end if; return public.course_challenge_shared_game_leave_for_player(p_game_id, public.current_user_canonical_player_id()); end $$;
create or replace function public.course_challenge_shared_game_leave_discord(p_game_id uuid, p_discord_user_id text) returns jsonb language plpgsql security definer set search_path = '' as $$ declare v_player uuid; begin
  select player_id into v_player from public.resolve_course_challenge_discord_player(p_discord_user_id); return public.course_challenge_shared_game_leave_for_player(p_game_id, v_player); end $$;

create or replace function public.course_challenge_shared_game_void_vote_for_player(p_game_id uuid, p_player_id uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_participants integer; v_votes integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_game_id::text, 0));
  if not exists (select 1 from public.course_challenge_shared_game_participants where game_id = p_game_id and player_id = p_player_id and left_at is null) then raise exception using errcode = '42501', message = 'Only active participants may vote to void a game.'; end if;
  select count(*) into v_participants from public.course_challenge_shared_game_participants where game_id = p_game_id and left_at is null; if v_participants <> 2 then raise exception using errcode = '22023', message = 'Exactly two distinct active participants are required to void a game.'; end if;
  insert into public.course_challenge_shared_game_void_votes(game_id, player_id) values (p_game_id, p_player_id) on conflict do nothing; select count(*) into v_votes from public.course_challenge_shared_game_void_votes where game_id = p_game_id;
  if v_votes >= 2 then update public.course_challenge_shared_games set status = 'voided', voided_at = coalesce(voided_at, now()), revision = revision + 1, updated_at = now() where game_id = p_game_id and status in ('forming', 'started', 'game_ended'); delete from public.course_challenge_shared_game_player_locks where game_id = p_game_id; delete from public.course_challenge_shared_game_rooms where game_id = p_game_id; end if;
  insert into public.course_challenge_shared_game_events(game_id, event_key, event_type, actor_player_id) values (p_game_id, 'void-vote:' || p_player_id::text, 'void_vote', p_player_id) on conflict do nothing; return jsonb_build_object('ok', true, 'votes', v_votes, 'voided', v_votes >= 2);
end $$;
create or replace function public.course_challenge_shared_game_void_vote(p_game_id uuid) returns jsonb language plpgsql security definer set search_path = '' as $$ begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'Authenticated player required.'; end if; return public.course_challenge_shared_game_void_vote_for_player(p_game_id, public.current_user_canonical_player_id()); end $$;
create or replace function public.course_challenge_shared_game_void_vote_discord(p_game_id uuid, p_discord_user_id text) returns jsonb language plpgsql security definer set search_path = '' as $$ declare v_player uuid; begin
  select player_id into v_player from public.resolve_course_challenge_discord_player(p_discord_user_id); return public.course_challenge_shared_game_void_vote_for_player(p_game_id, v_player); end $$;

create or replace function public.course_challenge_shared_game_no_score_for_player(p_game_id uuid, p_player_id uuid) returns jsonb language plpgsql security definer set search_path = '' as $$ begin
  if not exists (select 1 from public.course_challenge_shared_game_participants where game_id = p_game_id and player_id = p_player_id and left_at is null) then raise exception using errcode = '42501', message = 'Only active participants may record no score.'; end if;
  update public.course_challenge_shared_game_participants set score_disposition = 'no_cc_score' where game_id = p_game_id and player_id = p_player_id;
  insert into public.course_challenge_shared_game_deliveries(delivery_key, game_id, player_id, disposition) values ('no-score:' || p_game_id::text || ':' || p_player_id::text, p_game_id, p_player_id, 'no_cc_score') on conflict do nothing;
  insert into public.course_challenge_shared_game_events(game_id, event_key, event_type, actor_player_id) values (p_game_id, 'no-score:' || p_player_id::text, 'no_cc_score', p_player_id) on conflict do nothing;
  return jsonb_build_object('ok', true, 'recorded', true); end $$;
create or replace function public.course_challenge_shared_game_no_score(p_game_id uuid) returns jsonb language plpgsql security definer set search_path = '' as $$ begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'Authenticated player required.'; end if; return public.course_challenge_shared_game_no_score_for_player(p_game_id, public.current_user_canonical_player_id()); end $$;
create or replace function public.course_challenge_shared_game_no_score_discord(p_game_id uuid, p_discord_user_id text) returns jsonb language plpgsql security definer set search_path = '' as $$ declare v_player uuid; begin
  select player_id into v_player from public.resolve_course_challenge_discord_player(p_discord_user_id); return public.course_challenge_shared_game_no_score_for_player(p_game_id, v_player); end $$;

create or replace function public.course_challenge_shared_game_start(p_game_id uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_count integer; v_status text;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_game_id::text, 0)); select status into v_status from public.course_challenge_shared_games where game_id = p_game_id for update;
  select count(*) into v_count from public.course_challenge_shared_game_participants where game_id = p_game_id and left_at is null; if v_count < 2 or v_count > 4 then raise exception using errcode = '22023', message = 'A Course Challenge game starts with 2 to 4 players.'; end if;
  update public.course_challenge_shared_games set status = 'started', started_at = coalesce(started_at, now()), revision = revision + 1, updated_at = now() where game_id = p_game_id and status = 'forming' and (lobby_expires_at <= now() or v_count >= max_players);
  return jsonb_build_object('ok', true, 'gameId', p_game_id, 'status', 'started'); end $$;
create or replace function public.course_challenge_shared_game_ended(p_game_id uuid) returns jsonb language plpgsql security definer set search_path = '' as $$ begin
  update public.course_challenge_shared_games set status = 'game_ended', game_ended_at = coalesce(game_ended_at, now()), post_game_expires_at = coalesce(post_game_expires_at, now() + interval '60 minutes'), revision = revision + 1, updated_at = now() where game_id = p_game_id and status = 'started'; return jsonb_build_object('ok', true, 'gameId', p_game_id, 'status', 'game_ended'); end $$;
create or replace function public.course_challenge_shared_game_archive(p_game_id uuid) returns jsonb language plpgsql security definer set search_path = '' as $$ begin
  update public.course_challenge_shared_games set status = 'completed', completed_at = coalesce(completed_at, now()), revision = revision + 1, updated_at = now() where game_id = p_game_id and status = 'game_ended' and post_game_expires_at <= now();
  delete from public.course_challenge_shared_game_player_locks where game_id = p_game_id; delete from public.course_challenge_shared_game_rooms where game_id = p_game_id;
  insert into public.course_challenge_shared_game_events(game_id, event_key, event_type) values (p_game_id, 'archived', 'archived') on conflict do nothing;
  return jsonb_build_object('ok', true, 'gameId', p_game_id, 'status', 'completed'); end $$;
create or replace function public.course_challenge_shared_game_set_discord_refs(p_game_id uuid, p_channel_id text, p_thread_id text, p_message_id text, p_room_name text) returns jsonb language plpgsql security definer set search_path = '' as $$ begin
  if p_room_name is not null then insert into public.course_challenge_shared_game_rooms(room_name, game_id) values (p_room_name, p_game_id) on conflict (room_name) do update set game_id = excluded.game_id; end if;
  update public.course_challenge_shared_games set discord_channel_id = p_channel_id, discord_thread_id = p_thread_id, discord_lobby_message_id = p_message_id, room_name = p_room_name, revision = revision + 1, updated_at = now() where game_id = p_game_id; return jsonb_build_object('ok', true, 'gameId', p_game_id); end $$;
create or replace function public.course_challenge_shared_game_add_scorecard(p_game_id uuid, p_player_id uuid, p_attachment_ref text, p_file_name text, p_content_type text) returns jsonb language plpgsql security definer set search_path = '' as $$ declare v_id uuid; begin
  insert into public.course_challenge_shared_game_scorecards(game_id, player_id, attachment_ref, file_name, content_type) values (p_game_id, p_player_id, p_attachment_ref, p_file_name, p_content_type) on conflict (game_id, player_id, attachment_ref) do update set file_name = excluded.file_name returning scorecard_id into v_id; return jsonb_build_object('ok', true, 'scorecardId', v_id); end $$;
create or replace function public.course_challenge_shared_game_use_score(p_game_id uuid, p_player_id uuid, p_scorecard_id uuid) returns jsonb language plpgsql security definer set search_path = '' as $$ begin
  if not exists (select 1 from public.course_challenge_shared_game_scorecards where scorecard_id = p_scorecard_id and game_id = p_game_id and player_id = p_player_id) then raise exception using errcode = '22023', message = 'A submitted scorecard is required before USE CC SCORE.'; end if;
  update public.course_challenge_shared_game_participants set score_disposition = 'used_cc_score' where game_id = p_game_id and player_id = p_player_id;
  insert into public.course_challenge_shared_game_deliveries(delivery_key, game_id, player_id, scorecard_id, disposition) values ('use-score:' || p_game_id::text || ':' || p_player_id::text, p_game_id, p_player_id, p_scorecard_id, 'used_cc_score') on conflict do nothing;
  insert into public.course_challenge_shared_game_events(game_id, event_key, event_type, actor_player_id) values (p_game_id, 'use-score:' || p_player_id::text, 'used_cc_score', p_player_id) on conflict do nothing;
  return jsonb_build_object('ok', true, 'recorded', true); end $$;
create or replace function public.course_challenge_shared_game_add_scorecard_discord(p_game_id uuid, p_discord_user_id text, p_attachment_ref text, p_file_name text, p_content_type text) returns jsonb language plpgsql security definer set search_path = '' as $$ declare v_player uuid; begin
  select player_id into v_player from public.resolve_course_challenge_discord_player(p_discord_user_id); return public.course_challenge_shared_game_add_scorecard(p_game_id, v_player, p_attachment_ref, p_file_name, p_content_type); end $$;
create or replace function public.course_challenge_shared_game_use_score_discord(p_game_id uuid, p_discord_user_id text, p_scorecard_id uuid default null) returns jsonb language plpgsql security definer set search_path = '' as $$ declare v_player uuid; v_scorecard uuid; begin
  select player_id into v_player from public.resolve_course_challenge_discord_player(p_discord_user_id);
  if p_scorecard_id is null then select scorecard_id into v_scorecard from public.course_challenge_shared_game_scorecards where game_id = p_game_id and player_id = v_player order by submitted_at desc, scorecard_id desc limit 1; else v_scorecard := p_scorecard_id; end if;
  return public.course_challenge_shared_game_use_score(p_game_id, v_player, v_scorecard); end $$;

do $$ declare f record; begin for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'course_challenge_shared_game_%' loop execute format('revoke all on function %s from public, anon, authenticated', f.signature); end loop; end $$;
revoke all on function public.resolve_course_challenge_discord_player(text) from public, anon, authenticated;
grant execute on function public.course_challenge_shared_game_create(text, integer, integer, text) to authenticated;
grant execute on function public.course_challenge_shared_game_join(uuid) to authenticated;
grant execute on function public.course_challenge_shared_game_leave(uuid) to authenticated;
grant execute on function public.course_challenge_shared_game_void_vote(uuid) to authenticated;
grant execute on function public.course_challenge_shared_game_no_score(uuid) to authenticated;
grant execute on function public.course_challenge_shared_game_create_discord(text, text, integer, integer) to service_role;
grant execute on function public.course_challenge_shared_game_join_discord(uuid, text) to service_role;
grant execute on function public.course_challenge_shared_game_leave_discord(uuid, text) to service_role;
grant execute on function public.course_challenge_shared_game_void_vote_discord(uuid, text) to service_role;
grant execute on function public.course_challenge_shared_game_no_score_discord(uuid, text) to service_role;
grant execute on function public.course_challenge_shared_game_start(uuid) to service_role;
grant execute on function public.course_challenge_shared_game_ended(uuid) to service_role;
grant execute on function public.course_challenge_shared_game_archive(uuid) to service_role;
grant execute on function public.course_challenge_shared_game_set_discord_refs(uuid, text, text, text, text) to service_role;
grant execute on function public.course_challenge_shared_game_add_scorecard(uuid, uuid, text, text, text) to service_role;
grant execute on function public.course_challenge_shared_game_use_score(uuid, uuid, uuid) to service_role;
grant execute on function public.course_challenge_shared_game_add_scorecard_discord(uuid, text, text, text, text) to service_role;
grant execute on function public.course_challenge_shared_game_use_score_discord(uuid, text, uuid) to service_role;
grant execute on function public.resolve_course_challenge_discord_player(text) to service_role;

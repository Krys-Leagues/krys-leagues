create table if not exists public.course_challenge_discord_games (
  game_id uuid primary key,
  revision bigint not null check (revision > 0),
  book_key text not null check (book_key in ('tourist-trap', 'cherry-blossom')),
  original_creator_discord_user_id text not null,
  current_owner_discord_user_id text not null,
  max_players smallint not null check (max_players between 2 and 4),
  status text not null check (status in ('open', 'started', 'completed', 'cancelled', 'voided')),
  created_at timestamptz not null,
  lobby_deadline timestamptz not null,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  voided_at timestamptz,
  end_reason text,
  room_name text,
  discord_channel_id text,
  discord_thread_id text,
  discord_lobby_message_id text,
  last_synced_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.course_challenge_discord_game_participants (
  game_id uuid not null references public.course_challenge_discord_games(game_id) on delete cascade,
  discord_user_id text not null,
  display_name text not null,
  first_joined_at timestamptz not null,
  latest_joined_at timestamptz not null,
  left_at timestamptz,
  original_creator boolean not null default false,
  owner_at_start boolean not null default false,
  present_at_start boolean not null default false,
  played boolean not null default false,
  left_before_start boolean not null default false,
  left_after_start boolean not null default false,
  confirmed_scorecard boolean not null default false,
  confirmed_at timestamptz,
  primary key (game_id, discord_user_id)
);

create table if not exists public.course_challenge_discord_game_scorecards (
  game_id uuid not null references public.course_challenge_discord_games(game_id) on delete cascade,
  scorecard_id uuid not null,
  uploaded_by_discord_user_id text not null,
  attachment_reference text not null,
  attachment_filename text not null,
  attachment_content_type text,
  submitted_at timestamptz not null,
  primary key (game_id, scorecard_id)
);

create table if not exists public.course_challenge_discord_game_confirmations (
  game_id uuid not null,
  discord_user_id text not null,
  display_name text not null,
  scorecard_id uuid not null,
  confirmed_at timestamptz not null,
  entered_review_queue boolean not null default false,
  primary key (game_id, discord_user_id),
  foreign key (game_id, scorecard_id)
    references public.course_challenge_discord_game_scorecards(game_id, scorecard_id)
    on delete cascade
);

create table if not exists public.course_challenge_discord_game_events (
  game_id uuid not null references public.course_challenge_discord_games(game_id) on delete cascade,
  event_key text not null,
  event_type text not null,
  actor_discord_user_id text,
  subject_discord_user_id text,
  display_name text,
  occurred_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  primary key (game_id, event_key)
);

create index if not exists course_challenge_discord_games_created_idx
  on public.course_challenge_discord_games (created_at desc);
create index if not exists course_challenge_discord_games_status_idx
  on public.course_challenge_discord_games (status, created_at desc);
create index if not exists course_challenge_discord_game_events_time_idx
  on public.course_challenge_discord_game_events (game_id, occurred_at, event_key);

alter table public.course_challenge_discord_games enable row level security;
alter table public.course_challenge_discord_game_participants enable row level security;
alter table public.course_challenge_discord_game_scorecards enable row level security;
alter table public.course_challenge_discord_game_confirmations enable row level security;
alter table public.course_challenge_discord_game_events enable row level security;
alter table public.course_challenge_discord_games force row level security;
alter table public.course_challenge_discord_game_participants force row level security;
alter table public.course_challenge_discord_game_scorecards force row level security;
alter table public.course_challenge_discord_game_confirmations force row level security;
alter table public.course_challenge_discord_game_events force row level security;

revoke all on table public.course_challenge_discord_games from public, anon, authenticated;
revoke all on table public.course_challenge_discord_game_participants from public, anon, authenticated;
revoke all on table public.course_challenge_discord_game_scorecards from public, anon, authenticated;
revoke all on table public.course_challenge_discord_game_confirmations from public, anon, authenticated;
revoke all on table public.course_challenge_discord_game_events from public, anon, authenticated;

grant select on table public.course_challenge_discord_games to service_role;
grant select on table public.course_challenge_discord_game_participants to service_role;
grant select on table public.course_challenge_discord_game_scorecards to service_role;
grant select on table public.course_challenge_discord_game_confirmations to service_role;
grant select on table public.course_challenge_discord_game_events to service_role;

create or replace function public.sync_course_challenge_discord_game(p_snapshot jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game jsonb := p_snapshot -> 'game';
  v_game_id uuid;
  v_revision bigint;
  v_existing_revision bigint;
begin
  if jsonb_typeof(p_snapshot) <> 'object'
     or coalesce((p_snapshot ->> 'schemaVersion')::integer, 0) <> 1
     or jsonb_typeof(v_game) <> 'object'
     or jsonb_typeof(coalesce(p_snapshot -> 'participants', '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_snapshot -> 'scorecards', '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_snapshot -> 'confirmations', '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_snapshot -> 'events', '[]'::jsonb)) <> 'array'
  then
    raise exception using errcode = '22023', message = 'Invalid Course Challenge game snapshot.';
  end if;

  v_game_id := (v_game ->> 'id')::uuid;
  v_revision := (v_game ->> 'revision')::bigint;
  if v_revision < 1 then
    raise exception using errcode = '22023', message = 'Invalid Course Challenge game revision.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_game_id::text, 0));
  select revision into v_existing_revision
  from public.course_challenge_discord_games
  where game_id = v_game_id;

  if v_existing_revision is not null and v_existing_revision > v_revision then
    return jsonb_build_object(
      'ok', true,
      'ignored', true,
      'revision', v_existing_revision
    );
  end if;

  insert into public.course_challenge_discord_games (
    game_id, revision, book_key, original_creator_discord_user_id,
    current_owner_discord_user_id, max_players, status, created_at,
    lobby_deadline, started_at, completed_at, cancelled_at, voided_at,
    end_reason, room_name, discord_channel_id, discord_thread_id,
    discord_lobby_message_id, last_synced_at, updated_at
  ) values (
    v_game_id,
    v_revision,
    v_game ->> 'bookKey',
    v_game ->> 'originalCreatorUserId',
    v_game ->> 'currentOwnerUserId',
    (v_game ->> 'maxPlayers')::smallint,
    v_game ->> 'status',
    (v_game ->> 'createdAt')::timestamptz,
    (v_game ->> 'lobbyDeadline')::timestamptz,
    nullif(v_game ->> 'startedAt', '')::timestamptz,
    nullif(v_game ->> 'completedAt', '')::timestamptz,
    nullif(v_game ->> 'cancelledAt', '')::timestamptz,
    nullif(v_game ->> 'voidedAt', '')::timestamptz,
    nullif(v_game ->> 'endReason', ''),
    nullif(v_game ->> 'roomName', ''),
    nullif(v_game ->> 'discordChannelId', ''),
    nullif(v_game ->> 'discordThreadId', ''),
    nullif(v_game ->> 'discordLobbyMessageId', ''),
    now(),
    now()
  )
  on conflict (game_id) do update set
    revision = excluded.revision,
    book_key = excluded.book_key,
    original_creator_discord_user_id = excluded.original_creator_discord_user_id,
    current_owner_discord_user_id = excluded.current_owner_discord_user_id,
    max_players = excluded.max_players,
    status = excluded.status,
    created_at = excluded.created_at,
    lobby_deadline = excluded.lobby_deadline,
    started_at = excluded.started_at,
    completed_at = excluded.completed_at,
    cancelled_at = excluded.cancelled_at,
    voided_at = excluded.voided_at,
    end_reason = excluded.end_reason,
    room_name = excluded.room_name,
    discord_channel_id = excluded.discord_channel_id,
    discord_thread_id = excluded.discord_thread_id,
    discord_lobby_message_id = excluded.discord_lobby_message_id,
    last_synced_at = excluded.last_synced_at,
    updated_at = excluded.updated_at;

  delete from public.course_challenge_discord_game_confirmations where game_id = v_game_id;
  delete from public.course_challenge_discord_game_scorecards where game_id = v_game_id;
  delete from public.course_challenge_discord_game_participants where game_id = v_game_id;
  delete from public.course_challenge_discord_game_events where game_id = v_game_id;

  insert into public.course_challenge_discord_game_participants (
    game_id, discord_user_id, display_name, first_joined_at, latest_joined_at,
    left_at, original_creator, owner_at_start, present_at_start, played,
    left_before_start, left_after_start, confirmed_scorecard, confirmed_at
  )
  select
    v_game_id,
    item ->> 'discordUserId',
    item ->> 'displayName',
    (item ->> 'firstJoinedAt')::timestamptz,
    (item ->> 'latestJoinedAt')::timestamptz,
    nullif(item ->> 'leftAt', '')::timestamptz,
    coalesce((item ->> 'originalCreator')::boolean, false),
    coalesce((item ->> 'ownerAtStart')::boolean, false),
    coalesce((item ->> 'presentAtStart')::boolean, false),
    coalesce((item ->> 'played')::boolean, false),
    coalesce((item ->> 'leftBeforeStart')::boolean, false),
    coalesce((item ->> 'leftAfterStart')::boolean, false),
    coalesce((item ->> 'confirmedScorecard')::boolean, false),
    nullif(item ->> 'confirmedAt', '')::timestamptz
  from jsonb_array_elements(coalesce(p_snapshot -> 'participants', '[]'::jsonb)) item;

  insert into public.course_challenge_discord_game_scorecards (
    game_id, scorecard_id, uploaded_by_discord_user_id, attachment_reference,
    attachment_filename, attachment_content_type, submitted_at
  )
  select
    v_game_id,
    (item ->> 'id')::uuid,
    item ->> 'uploadedByUserId',
    item ->> 'attachmentReference',
    item ->> 'attachmentFilename',
    nullif(item ->> 'attachmentContentType', ''),
    (item ->> 'submittedAt')::timestamptz
  from jsonb_array_elements(coalesce(p_snapshot -> 'scorecards', '[]'::jsonb)) item;

  insert into public.course_challenge_discord_game_confirmations (
    game_id, discord_user_id, display_name, scorecard_id, confirmed_at,
    entered_review_queue
  )
  select
    v_game_id,
    item ->> 'discordUserId',
    item ->> 'displayName',
    (item ->> 'scorecardId')::uuid,
    (item ->> 'confirmedAt')::timestamptz,
    coalesce((item ->> 'enteredReviewQueue')::boolean, false)
  from jsonb_array_elements(coalesce(p_snapshot -> 'confirmations', '[]'::jsonb)) item;

  insert into public.course_challenge_discord_game_events (
    game_id, event_key, event_type, actor_discord_user_id,
    subject_discord_user_id, display_name, occurred_at, metadata
  )
  select
    v_game_id,
    item ->> 'key',
    item ->> 'type',
    nullif(item ->> 'actorUserId', ''),
    nullif(item ->> 'subjectUserId', ''),
    nullif(item ->> 'displayName', ''),
    (item ->> 'occurredAt')::timestamptz,
    coalesce(item -> 'metadata', '{}'::jsonb)
  from jsonb_array_elements(coalesce(p_snapshot -> 'events', '[]'::jsonb)) item;

  return jsonb_build_object('ok', true, 'revision', v_revision);
end;
$$;

revoke all on function public.sync_course_challenge_discord_game(jsonb)
  from public, anon, authenticated;
grant execute on function public.sync_course_challenge_discord_game(jsonb)
  to service_role;

-- Extend the existing Course Challenge Games V2 shared state for restart recovery.
-- This migration intentionally does not create a parallel course_challenge_games
-- schema. The 20261007170000 shared tables remain the single canonical store.

begin;

alter table public.course_challenge_shared_games
  add column if not exists confirmation_deadline timestamptz,
  add column if not exists post_game_started_at timestamptz,
  add column if not exists discord_guild_id text,
  add column if not exists discord_start_message_id text,
  add column if not exists discord_confirmation_message_id text;

alter table public.course_challenge_shared_game_participants
  add column if not exists participant_status text not null default 'active',
  add column if not exists original_creator boolean not null default false,
  add column if not exists played boolean not null default false,
  add column if not exists confirmed_scorecard boolean not null default false,
  add column if not exists confirmed_at timestamptz,
  add column if not exists score_decided_at timestamptz;

do $$ begin
  alter table public.course_challenge_shared_game_participants
    add constraint course_challenge_shared_game_participant_status_check
    check (participant_status in ('active', 'left', 'withdrawn'));
exception when duplicate_object then null;
end $$;

create or replace function public.course_challenge_shared_game_stamp_score_decision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.score_disposition is distinct from old.score_disposition then
    new.score_decided_at := case
      when new.score_disposition in ('used_cc_score', 'no_cc_score') then coalesce(new.score_decided_at, now())
      else null
    end;
  end if;
  return new;
end;
$$;

do $$ begin
  if not exists (
    select 1 from pg_catalog.pg_trigger
    where tgname = 'course_challenge_shared_game_score_decision_timestamp'
      and tgrelid = 'public.course_challenge_shared_game_participants'::regclass
  ) then
    create trigger course_challenge_shared_game_score_decision_timestamp
      before insert or update of score_disposition on public.course_challenge_shared_game_participants
      for each row execute function public.course_challenge_shared_game_stamp_score_decision();
  end if;
end $$;

alter table public.course_challenge_shared_game_deliveries
  add column if not exists discord_user_id text,
  add column if not exists display_name text,
  add column if not exists attempts integer not null default 0,
  add column if not exists last_error text,
  add column if not exists production_submission_id text;

create table if not exists public.course_challenge_shared_game_confirmations (
  confirmation_id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.course_challenge_shared_games(game_id) on delete cascade,
  player_id uuid not null references public.players(id) on delete restrict,
  discord_user_id text,
  display_name text not null,
  scorecard_id uuid not null references public.course_challenge_shared_game_scorecards(scorecard_id) on delete cascade,
  confirmed_at timestamptz not null default now(),
  entered_review_queue boolean not null default false,
  unique (game_id, player_id, scorecard_id)
);

create index if not exists course_challenge_shared_game_confirmations_game_idx
  on public.course_challenge_shared_game_confirmations(game_id, confirmed_at);

alter table public.course_challenge_shared_game_confirmations enable row level security;
alter table public.course_challenge_shared_game_confirmations force row level security;
revoke all on table public.course_challenge_shared_game_confirmations from public, anon, authenticated;
grant select, insert, update on table public.course_challenge_shared_game_confirmations to service_role;

create or replace function public.sync_course_challenge_canonical_game(p_snapshot jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game jsonb := coalesce(p_snapshot->'game', '{}'::jsonb);
  v_game_id uuid := nullif(v_game->>'id', '')::uuid;
  v_revision bigint := greatest(1, coalesce((v_game->>'revision')::bigint, 1));
  v_status text := v_game->>'status';
  v_shared_status text;
  v_existing_revision bigint;
  v_item jsonb;
  v_player_id uuid;
  v_scorecard_id uuid;
begin
  if v_game_id is null then raise exception using errcode = '22023', message = 'Canonical Course Challenge game ID is required.'; end if;
  if v_status not in ('forming', 'started', 'post_game', 'voided', 'completed') then
    raise exception using errcode = '22023', message = 'Unsupported canonical Course Challenge game state.';
  end if;
  v_shared_status := case when v_status = 'post_game' then 'game_ended' else v_status end;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_game_id::text, 0));
  select revision into v_existing_revision
    from public.course_challenge_shared_games
    where game_id = v_game_id
    for update;
  if v_existing_revision is null then
    raise exception using errcode = 'P0002', message = 'Canonical shared Course Challenge game was not found.';
  end if;
  if v_existing_revision > v_revision then
    return jsonb_build_object('ok', true, 'stale', true, 'gameId', v_game_id, 'revision', v_existing_revision);
  end if;

  update public.course_challenge_shared_games
     set revision = v_revision,
         status = v_shared_status,
         confirmation_deadline = nullif(v_game->>'confirmationDeadline', '')::timestamptz,
         post_game_started_at = coalesce(nullif(v_game->>'postGameStartedAt', '')::timestamptz, nullif(v_game->>'gameEndedAt', '')::timestamptz),
         started_at = coalesce(started_at, nullif(v_game->>'startedAt', '')::timestamptz),
         game_ended_at = coalesce(game_ended_at, nullif(v_game->>'gameEndedAt', '')::timestamptz),
         post_game_expires_at = coalesce(post_game_expires_at, nullif(v_game->>'postGameExpiresAt', '')::timestamptz),
         completed_at = coalesce(completed_at, nullif(v_game->>'completedAt', '')::timestamptz),
         voided_at = coalesce(voided_at, nullif(v_game->>'voidedAt', '')::timestamptz),
         room_name = coalesce(nullif(v_game->>'roomName', ''), room_name),
         discord_guild_id = coalesce(nullif(v_game->>'discordGuildId', ''), discord_guild_id),
         discord_channel_id = coalesce(nullif(v_game->>'discordChannelId', ''), discord_channel_id),
         discord_thread_id = coalesce(nullif(v_game->>'discordThreadId', ''), discord_thread_id),
         discord_lobby_message_id = coalesce(nullif(v_game->>'discordLobbyMessageId', ''), discord_lobby_message_id),
         discord_start_message_id = coalesce(nullif(v_game->>'discordStartMessageId', ''), discord_start_message_id),
         discord_confirmation_message_id = coalesce(nullif(v_game->>'discordConfirmationMessageId', ''), discord_confirmation_message_id),
         updated_at = now()
   where game_id = v_game_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_snapshot->'participants', '[]'::jsonb)) loop
    v_player_id := nullif(v_item->>'playerId', '')::uuid;
    if v_player_id is null then continue; end if;
    insert into public.course_challenge_shared_game_participants(
      game_id, player_id, discord_user_id, screen_name_snapshot, platform, joined_at, left_at,
      participant_status, original_creator, played, confirmed_scorecard, confirmed_at
    ) values (
      v_game_id, v_player_id, nullif(v_item->>'discordUserId', ''),
      coalesce(nullif(v_item->>'screenName', ''), nullif(v_item->>'displayName', ''), v_player_id::text),
      case when v_item->>'participationSource' in ('discord', 'both') then v_item->>'participationSource' else 'website' end,
      coalesce(nullif(v_item->>'joinedAt', '')::timestamptz, now()),
      nullif(v_item->>'leftAt', '')::timestamptz,
      case when nullif(v_item->>'leftAt', '') is null then 'active' else 'left' end,
      coalesce((v_item->>'originalCreator')::boolean, false), coalesce((v_item->>'played')::boolean, false),
      coalesce((v_item->>'confirmedScorecard')::boolean, false), nullif(v_item->>'confirmedAt', '')::timestamptz
    ) on conflict (game_id, player_id) do update set
      discord_user_id = coalesce(excluded.discord_user_id, public.course_challenge_shared_game_participants.discord_user_id),
      screen_name_snapshot = excluded.screen_name_snapshot,
      platform = excluded.platform,
      joined_at = least(public.course_challenge_shared_game_participants.joined_at, excluded.joined_at),
      left_at = excluded.left_at,
      participant_status = excluded.participant_status,
      original_creator = excluded.original_creator,
      played = excluded.played,
      confirmed_scorecard = excluded.confirmed_scorecard,
      confirmed_at = excluded.confirmed_at;
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p_snapshot->'scorecards', '[]'::jsonb)) loop
    v_scorecard_id := nullif(v_item->>'id', '')::uuid;
    v_player_id := nullif(v_item->>'uploaderPlayerId', '')::uuid;
    if v_scorecard_id is null or v_player_id is null then continue; end if;
    insert into public.course_challenge_shared_game_scorecards(scorecard_id, game_id, player_id, attachment_ref, file_name, content_type, submitted_at)
    values (v_scorecard_id, v_game_id, v_player_id, coalesce(v_item->>'attachmentReference', ''), nullif(v_item->>'attachmentFilename', ''), nullif(v_item->>'attachmentContentType', ''), coalesce(nullif(v_item->>'submittedAt', '')::timestamptz, now()))
    on conflict (scorecard_id) do update set attachment_ref = excluded.attachment_ref, file_name = excluded.file_name, content_type = excluded.content_type;
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p_snapshot->'confirmations', '[]'::jsonb)) loop
    v_player_id := nullif(v_item->>'playerId', '')::uuid;
    v_scorecard_id := nullif(v_item->>'scorecardId', '')::uuid;
    if v_player_id is null or v_scorecard_id is null then continue; end if;
    insert into public.course_challenge_shared_game_confirmations(game_id, player_id, discord_user_id, display_name, scorecard_id, confirmed_at, entered_review_queue)
    values (v_game_id, v_player_id, nullif(v_item->>'discordUserId', ''), coalesce(nullif(v_item->>'displayName', ''), v_player_id::text), v_scorecard_id, coalesce(nullif(v_item->>'confirmedAt', '')::timestamptz, now()), coalesce((v_item->>'enteredReviewQueue')::boolean, false))
    on conflict (game_id, player_id, scorecard_id) do update set entered_review_queue = excluded.entered_review_queue;
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p_snapshot->'voidVotes', '[]'::jsonb)) loop
    v_player_id := nullif(v_item->>'voterPlayerId', '')::uuid;
    if v_player_id is null then continue; end if;
    insert into public.course_challenge_shared_game_void_votes(game_id, player_id, voted_at)
    values (v_game_id, v_player_id, coalesce(nullif(v_item->>'votedAt', '')::timestamptz, now())) on conflict do nothing;
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p_snapshot->'playerDecisions', '[]'::jsonb)) loop
    v_player_id := nullif(v_item->>'playerId', '')::uuid;
    if v_player_id is null then continue; end if;
    update public.course_challenge_shared_game_participants
       set score_disposition = nullif(v_item->>'decision', 'pending'), score_decided_at = nullif(v_item->>'decidedAt', '')::timestamptz
     where game_id = v_game_id and player_id = v_player_id;
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p_snapshot->'deliveries', '[]'::jsonb)) loop
    v_player_id := nullif(v_item->>'playerId', '')::uuid;
    if v_player_id is null then continue; end if;
    insert into public.course_challenge_shared_game_deliveries(delivery_key, game_id, player_id, scorecard_id, disposition, status, discord_user_id, display_name, attempts, last_error, production_submission_id, delivered_at)
    values (coalesce(nullif(v_item->>'deliveryKey', ''), 'delivery:' || v_game_id::text || ':' || v_player_id::text), v_game_id, v_player_id, nullif(v_item->>'scorecardId', '')::uuid, case when v_item->>'decision' = 'no_cc_score' then 'no_cc_score' else 'used_cc_score' end, case when v_item->>'deliveryStatus' = 'succeeded' then 'delivered' when v_item->>'deliveryStatus' = 'expired' then 'expired' else 'pending' end, nullif(v_item->>'discordUserId', ''), nullif(v_item->>'displayName', ''), coalesce((v_item->>'attempts')::integer, 0), nullif(v_item->>'lastError', ''), nullif(v_item->>'productionSubmissionId', ''), nullif(v_item->>'deliveredAt', '')::timestamptz)
    on conflict (delivery_key) do update set status = excluded.status, attempts = greatest(public.course_challenge_shared_game_deliveries.attempts, excluded.attempts), last_error = excluded.last_error, production_submission_id = coalesce(excluded.production_submission_id, public.course_challenge_shared_game_deliveries.production_submission_id), delivered_at = coalesce(excluded.delivered_at, public.course_challenge_shared_game_deliveries.delivered_at);
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p_snapshot->'events', '[]'::jsonb)) loop
    insert into public.course_challenge_shared_game_events(game_id, event_key, event_type, metadata, occurred_at)
    values (v_game_id, coalesce(nullif(v_item->>'key', ''), 'recovered:' || md5(v_item::text)), coalesce(nullif(v_item->>'type', ''), 'recovered'), coalesce(v_item->'metadata', '{}'::jsonb), coalesce(nullif(v_item->>'occurredAt', '')::timestamptz, now())) on conflict do nothing;
  end loop;

  return jsonb_build_object('ok', true, 'gameId', v_game_id, 'revision', v_revision);
end;
$$;

revoke all on function public.sync_course_challenge_canonical_game(jsonb) from public, anon, authenticated;
grant execute on function public.sync_course_challenge_canonical_game(jsonb) to service_role;

commit;

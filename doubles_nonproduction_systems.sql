begin;

create table if not exists public.doubles_arrangements (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null unique references public.doubles_managed_fixtures(id) on delete restrict,
  state text not null default 'NOT ARRANGED' check (state in ('NOT ARRANGED','PROPOSED','COUNTERED','ACCEPTED')),
  proposed_at timestamptz,
  accepted_at timestamptz,
  accepted_for timestamptz,
  last_actor_player_id uuid references public.players(id) on delete restrict,
  created_at timestamptz not null default now()
);
create table if not exists public.doubles_arrangement_proposals (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references public.doubles_managed_fixtures(id) on delete restrict,
  proposed_for timestamptz not null,
  proposed_by uuid not null references public.players(id) on delete restrict,
  state text not null check (state in ('PROPOSED','COUNTERED','ACCEPTED','OBSOLETE')),
  created_at timestamptz not null default now()
);
create table if not exists public.doubles_fixture_chat (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references public.doubles_managed_fixtures(id) on delete restrict,
  player_id uuid not null references public.players(id) on delete restrict,
  body text not null check (length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create table if not exists public.doubles_arrangement_reminders (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references public.doubles_managed_fixtures(id) on delete restrict,
  recipient_player_id uuid not null references public.players(id) on delete restrict,
  reminder_key text not null,
  eligible_at timestamptz not null,
  claimed_at timestamptz,
  unique (fixture_id, recipient_player_id, reminder_key)
);

create table if not exists public.doubles_board_mappings (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete restrict,
  division text not null,
  channel_id text,
  message_id text,
  sync_state text not null default 'PENDING' check (sync_state in ('PENDING','SYNCED','RETRYABLE','FAILED','EXHAUSTED','NOT_FOUND','HISTORICAL')),
  last_synced_at timestamptz,
  last_error text,
  unique (season_id, division)
);
create table if not exists public.doubles_board_outbox (
  id uuid primary key default gen_random_uuid(),
  mapping_id uuid not null references public.doubles_board_mappings(id) on delete cascade,
  idempotency_key text not null unique,
  available_at timestamptz not null default now(),
  attempts integer not null default 0,
  claimed_at timestamptz,
  claimed_by text,
  status text not null default 'PENDING' check (status in ('PENDING','CLAIMED','DONE','RETRYABLE','EXHAUSTED','NOT_FOUND')),
  last_error text
);

create table if not exists public.doubles_final_snapshots (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete restrict,
  division text not null,
  payload jsonb not null,
  finalized_at timestamptz not null default now(),
  finalized_by uuid not null references auth.users(id) on delete restrict,
  unique (season_id, division)
);
create table if not exists public.doubles_season_lifecycle (
  season_id uuid primary key references public.seasons(id) on delete restrict,
  state text not null default 'LIVE' check (state in ('LIVE','FINALIZING','HISTORICAL')),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table if not exists public.league_discord_role_sync_outbox (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete restrict,
  league_key text not null,
  desired_state text not null check (desired_state in ('GRANTED','REVOKED')),
  identity_state text not null check (identity_state in ('RESOLVED','UNRESOLVED')),
  idempotency_key text not null unique,
  status text not null default 'PENDING' check (status in ('PENDING','CLAIMED','DONE','RETRYABLE','EXHAUSTED')),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now()
);

alter table public.doubles_arrangements enable row level security;
alter table public.doubles_arrangement_proposals enable row level security;
alter table public.doubles_fixture_chat enable row level security;
alter table public.doubles_arrangement_reminders enable row level security;
alter table public.doubles_board_mappings enable row level security;
alter table public.doubles_board_outbox enable row level security;
alter table public.doubles_final_snapshots enable row level security;
alter table public.doubles_season_lifecycle enable row level security;
alter table public.league_discord_role_sync_outbox enable row level security;
revoke all on table public.doubles_arrangements, public.doubles_arrangement_proposals, public.doubles_fixture_chat, public.doubles_arrangement_reminders, public.doubles_board_mappings, public.doubles_board_outbox, public.doubles_final_snapshots, public.doubles_season_lifecycle, public.league_discord_role_sync_outbox from public, anon, authenticated;

commit;

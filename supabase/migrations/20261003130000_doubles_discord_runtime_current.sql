begin;

create table if not exists public.doubles_discord_division_mappings (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete restrict,
  division text not null,
  arrange_channel_id text,
  arrange_message_id text,
  board_channel_id text,
  board_message_id text,
  board_state text not null default 'PENDING' check (board_state in ('PENDING','SYNCED','RETRYABLE','EXHAUSTED','NOT_FOUND','HISTORICAL','TEST')),
  test_mode boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season_id, division)
);

create table if not exists public.doubles_discord_fixture_mappings (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null unique references public.doubles_managed_fixtures(id) on delete restrict,
  thread_id text,
  thread_channel_id text,
  starter_message_id text,
  match_image_message_id text,
  submit_component_message_id text,
  thread_state text not null default 'PENDING' check (thread_state in ('PENDING','MATCH_SET','ACTIVE','SCORECARD_SUBMITTED','RESULT_VERIFIED','COMPLETED','ARCHIVED','FAILED','TEST')),
  test_mode boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.doubles_discord_test_artifacts (
  id uuid primary key default gen_random_uuid(),
  artifact_type text not null check (artifact_type in ('ARRANGE','BOARD','THREAD','MESSAGE')),
  channel_id text not null,
  thread_id text,
  message_id text,
  ownership_key text not null unique,
  created_at timestamptz not null default now(),
  cleaned_at timestamptz
);

create table if not exists public.doubles_discord_event_outbox (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('ARRANGE_UPDATED','MATCH_SET','BOARD_REFRESH','SCORECARD_UPDATED','RESULT_COMPLETED')),
  season_id uuid not null references public.seasons(id) on delete restrict,
  division text not null,
  fixture_id uuid references public.doubles_managed_fixtures(id) on delete restrict,
  channel_id text not null,
  payload jsonb not null default '{}'::jsonb,
  idempotency_key text not null unique,
  status text not null default 'PENDING' check (status in ('PENDING','CLAIMED','DONE','RETRYABLE','EXHAUSTED','NOT_FOUND')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  claimed_at timestamptz,
  claimed_by text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.doubles_discord_division_mappings enable row level security;
alter table public.doubles_discord_fixture_mappings enable row level security;
alter table public.doubles_discord_test_artifacts enable row level security;
alter table public.doubles_discord_event_outbox enable row level security;

revoke all on table public.doubles_discord_division_mappings, public.doubles_discord_fixture_mappings,
  public.doubles_discord_test_artifacts, public.doubles_discord_event_outbox from anon, authenticated;

commit;

begin;

-- Local-only additive persistence for the next-season Doubles Discord runtime.
-- This migration is intentionally not applied by this task.
create table if not exists public.doubles_discord_division_mappings (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete restrict,
  division text not null,
  arrange_channel_id text,
  arrange_message_id text,
  board_channel_id text,
  board_message_id text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','HISTORICAL','FAILED','TEST')),
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
  state text not null default 'PENDING' check (state in ('PENDING','MATCH_SET','COMPLETED','ARCHIVED','FAILED','TEST')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.doubles_discord_test_artifacts (
  id uuid primary key default gen_random_uuid(),
  artifact_kind text not null check (artifact_kind in ('ARRANGE','BOARD','THREAD','MESSAGE')),
  channel_id text not null,
  message_id text,
  thread_id text,
  test_key text not null unique,
  created_at timestamptz not null default now()
);

alter table public.doubles_discord_division_mappings enable row level security;
alter table public.doubles_discord_fixture_mappings enable row level security;
alter table public.doubles_discord_test_artifacts enable row level security;
revoke all on table public.doubles_discord_division_mappings, public.doubles_discord_fixture_mappings, public.doubles_discord_test_artifacts from public, anon, authenticated;

commit;

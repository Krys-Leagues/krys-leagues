begin;

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

alter table public.doubles_discord_event_outbox enable row level security;
revoke all on table public.doubles_discord_event_outbox from public, anon, authenticated;

commit;

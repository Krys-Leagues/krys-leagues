-- PROPOSED ONLY. This is not an applied Supabase migration.
--
-- Scope: the minimum schema objects referenced by doubles_completion_runtime.sql.
-- It intentionally does not create a season, enroll teams, create fixtures, or
-- alter legacy Doubles schedule/results/history.
--
-- Required review before application:
--   * confirm the live managed-season column/status contract;
--   * confirm the board worker's publication contract;
--   * run the read-only preflight in
--     docs/doubles-completion-preflight-readonly.sql;
--   * review the security-definer functions separately.

begin;

create table if not exists public.doubles_season_member_replacements (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete restrict,
  season_team_id uuid not null references public.doubles_managed_season_teams(id) on delete restrict,
  old_player_id uuid not null references public.players(id) on delete restrict,
  replacement_player_id uuid not null references public.players(id) on delete restrict,
  reason text not null check (length(btrim(reason)) > 0),
  effective_at timestamptz not null default now(),
  changed_by uuid not null references auth.users(id) on delete restrict,
  check (old_player_id <> replacement_player_id)
);

create index if not exists doubles_member_replacements_season_idx
  on public.doubles_season_member_replacements(season_id, season_team_id, effective_at);

create table if not exists public.doubles_season_lifecycle (
  season_id uuid primary key references public.seasons(id) on delete restrict,
  state text not null default 'LIVE'
    check (state in ('LIVE','FINALIZING','HISTORICAL')),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table if not exists public.doubles_final_snapshots (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete restrict,
  division text not null check (length(btrim(division)) > 0),
  payload jsonb not null,
  finalized_at timestamptz not null default now(),
  finalized_by uuid not null references auth.users(id) on delete restrict,
  unique (season_id, division)
);

create table if not exists public.doubles_board_mappings (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete restrict,
  division text not null check (length(btrim(division)) > 0),
  channel_id text,
  message_id text,
  sync_state text not null default 'PENDING'
    check (sync_state in ('PENDING','SYNCED','RETRYABLE','FAILED','EXHAUSTED','NOT_FOUND','HISTORICAL')),
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
  status text not null default 'PENDING'
    check (status in ('PENDING','CLAIMED','DONE','RETRYABLE','EXHAUSTED','NOT_FOUND')),
  last_error text
);

alter table public.doubles_season_member_replacements enable row level security;
alter table public.doubles_season_lifecycle enable row level security;
alter table public.doubles_final_snapshots enable row level security;
alter table public.doubles_board_mappings enable row level security;
alter table public.doubles_board_outbox enable row level security;

revoke all on table
  public.doubles_season_member_replacements,
  public.doubles_season_lifecycle,
  public.doubles_final_snapshots,
  public.doubles_board_mappings,
  public.doubles_board_outbox
from public, anon, authenticated;

commit;

begin;

-- Local-only private two-course review state.  Storage paths are server-only
-- metadata and are never selected by public/player readers.
create table if not exists public.doubles_scorecard_components (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references public.doubles_managed_fixtures(id) on delete restrict,
  component_key text not null check (component_key in ('course1','course2')),
  course text not null,
  uploader_player_id uuid not null references public.players(id) on delete restrict,
  evidence_storage_path text not null,
  original_filename text not null,
  content_type text not null,
  status text not null default 'RESERVED' check (status in ('RESERVED','RECEIVED','IN_REVIEW','VERIFIED','REJECTED')),
  card_date_text text,
  home_strokes jsonb,
  away_strokes jsonb,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fixture_id, component_key)
);

create table if not exists public.doubles_scorecard_commits (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null unique references public.doubles_managed_fixtures(id) on delete restrict,
  idempotency_key text not null unique,
  status text not null default 'PENDING' check (status in ('PENDING','COMMITTED','FAILED')),
  result_id uuid,
  error_message text,
  created_at timestamptz not null default now(),
  committed_at timestamptz
);

alter table public.doubles_scorecard_components enable row level security;
alter table public.doubles_scorecard_commits enable row level security;
revoke all on table public.doubles_scorecard_components, public.doubles_scorecard_commits from public, anon, authenticated;

commit;

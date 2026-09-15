-- Prepared only. Do not run against Production without Krys review.
-- Forward-only WHS core storage. Existing handicap_* tables are frozen legacy
-- snapshots and are intentionally not rewritten or backfilled by this change.

create table if not exists public.handicap_qualifying_rounds (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id),
  source_type text not null check (source_type in ('KWT', 'LEAGUE', 'ALL_TIME')),
  source_record_id text not null,
  played_at timestamptz not null,
  course_key text not null,
  course_name text not null,
  difficulty text not null check (difficulty in ('easy', 'hard')),
  adjusted_gross_score numeric not null,
  course_rating numeric not null,
  slope_rating numeric not null,
  pcc_adjustment numeric not null default 0,
  score_differential numeric not null,
  qualifying_status text not null default 'QUALIFYING' check (qualifying_status in ('QUALIFYING', 'EXCLUDED')),
  exclusion_reason text,
  created_at timestamptz not null default now(),
  unique (source_type, source_record_id)
);

create table if not exists public.handicap_index_snapshots (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id),
  calculated_at timestamptz not null default now(),
  handicap_index numeric,
  rounds_count integer not null,
  selected_round_ids uuid[] not null default '{}',
  fewer_than_20_adjustment numeric not null default 0,
  calculation_status text not null check (calculation_status in ('NO_INDEX', 'PROVISIONAL', 'ACTIVE'))
);

create table if not exists public.handicap_course_ratings (
  id uuid primary key default gen_random_uuid(),
  course_key text not null,
  course_name text not null,
  difficulty text not null check (difficulty in ('easy', 'hard')),
  course_rating numeric not null,
  slope_rating numeric not null,
  source text not null,
  source_reference text,
  verified_at timestamptz,
  unique (course_key, difficulty)
);

alter table public.handicap_qualifying_rounds enable row level security;
alter table public.handicap_index_snapshots enable row level security;
alter table public.handicap_course_ratings enable row level security;
revoke all on public.handicap_qualifying_rounds from anon, authenticated;
revoke all on public.handicap_index_snapshots from anon, authenticated;
revoke all on public.handicap_course_ratings from anon, authenticated;
grant all on public.handicap_qualifying_rounds to service_role;
grant all on public.handicap_index_snapshots to service_role;
grant all on public.handicap_course_ratings to service_role;

comment on table public.handicap_qualifying_rounds is 'Forward-only WHS round facts; All-Time rows require the application boundary 2026-09-15T00:00:00Z.';
comment on table public.handicap_index_snapshots is 'Immutable calculated Handicap Index snapshots; no manual total editor.';
comment on table public.handicap_course_ratings is 'Authoritative ratings only; do not seed guessed mini-golf values.';

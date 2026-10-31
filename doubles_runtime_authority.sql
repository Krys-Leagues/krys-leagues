begin;

-- Shared player availability is intentionally league-neutral.  Doubles only
-- consumes it; it does not create a competing per-league availability model.
create table if not exists public.player_master_availability (
  player_id uuid primary key references public.players(id) on delete cascade,
  timezone text not null,
  windows jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(windows) = 'array')
);

alter table public.player_master_availability enable row level security;
revoke all on table public.player_master_availability from public, anon, authenticated;
grant all on table public.player_master_availability to service_role;

create index if not exists player_master_availability_updated_idx
  on public.player_master_availability(updated_at desc);

commit;

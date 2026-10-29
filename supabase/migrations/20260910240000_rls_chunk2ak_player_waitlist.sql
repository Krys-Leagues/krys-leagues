-- Chunk 2AK: keep waitlist registration and review behind server paths.

revoke all on table public.player_waitlist
  from public, anon, authenticated;

grant all on table public.player_waitlist
  to service_role;

alter table public.player_waitlist enable row level security;

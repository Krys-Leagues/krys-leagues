-- Chunk 2AJ: keep the legacy player tracker behind the protected admin route.

revoke all on table public.player_tracker
  from public, anon, authenticated;

grant all on table public.player_tracker
  to service_role;

alter table public.player_tracker enable row level security;

-- Chunk 2AF: deny direct client access to unused legacy support tables.

revoke all on table public.player_leagues, public.fixtures
  from public, anon, authenticated;

grant all on table public.player_leagues, public.fixtures
  to service_role;

alter table public.player_leagues enable row level security;
alter table public.fixtures enable row level security;

-- Chunk 2AI: keep legacy Doubles team configuration behind the admin server path.

revoke all on table public.doubles_teams
  from public, anon, authenticated;

grant all on table public.doubles_teams
  to service_role;

alter table public.doubles_teams enable row level security;

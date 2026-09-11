-- Staging-only security chunk 2S: Historical Pro core data.
-- Public player history remains served by the existing protected reader RPC.
-- Import and review mutations remain owned by protected SECURITY DEFINER RPCs.

begin;

alter table public.historical_pro_imports enable row level security;
alter table public.historical_pro_player_games enable row level security;

revoke all on table public.historical_pro_imports from public, anon, authenticated;
revoke all on table public.historical_pro_player_games from public, anon, authenticated;

grant all on table public.historical_pro_imports to service_role;
grant all on table public.historical_pro_player_games to service_role;

commit;

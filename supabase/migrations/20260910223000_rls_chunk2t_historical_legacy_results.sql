-- Staging-only security chunk 2T: legacy historical result storage.
-- No public reader or direct application caller exists; protected admin
-- deletion-preview code remains the only database workflow dependency.

begin;

alter table public.historical_league_results enable row level security;

revoke all on table public.historical_league_results from public, anon, authenticated;
grant all on table public.historical_league_results to service_role;

commit;

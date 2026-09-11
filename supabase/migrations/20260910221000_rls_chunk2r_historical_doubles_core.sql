-- Staging-only security chunk 2R: Historical Doubles base data.
-- No direct application reader uses these tables; public standings/results
-- remain served by the existing public views and protected import RPCs own
-- mutations.

begin;

alter table public.historical_doubles_imports enable row level security;
alter table public.historical_doubles_standings_imports enable row level security;
alter table public.doubles_historical_games enable row level security;
alter table public.doubles_historical_standings enable row level security;

revoke all on table public.historical_doubles_imports from public, anon, authenticated;
revoke all on table public.historical_doubles_standings_imports from public, anon, authenticated;
revoke all on table public.doubles_historical_games from public, anon, authenticated;
revoke all on table public.doubles_historical_standings from public, anon, authenticated;

grant all on table public.historical_doubles_imports to service_role;
grant all on table public.historical_doubles_standings_imports to service_role;
grant all on table public.doubles_historical_games to service_role;
grant all on table public.doubles_historical_standings to service_role;

commit;

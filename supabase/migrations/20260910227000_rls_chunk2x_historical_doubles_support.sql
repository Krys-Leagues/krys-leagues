-- Staging-only security chunk 2X: Historical Doubles support tables.
-- Public historical readers use bounded RPCs; import and identity workflows
-- use protected SECURITY DEFINER functions.

begin;

alter table public.doubles_global_teams enable row level security;
alter table public.doubles_season_teams enable row level security;

revoke all on table public.doubles_global_teams from public, anon, authenticated;
revoke all on table public.doubles_season_teams from public, anon, authenticated;

grant all on table public.doubles_global_teams to service_role;
grant all on table public.doubles_season_teams to service_role;

commit;

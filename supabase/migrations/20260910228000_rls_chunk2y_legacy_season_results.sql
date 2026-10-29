-- Staging-only security chunk 2Y: unused legacy season results.

begin;

alter table public.season_results enable row level security;

revoke all on table public.season_results from public, anon, authenticated;
grant all on table public.season_results to service_role;

commit;

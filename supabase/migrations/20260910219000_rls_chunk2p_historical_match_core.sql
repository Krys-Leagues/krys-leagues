-- Staging-only security chunk 2P: Historical Match public/admin data.
-- Public readers remain RPC-backed. Direct admin review reads are limited to
-- imports and standings; course appearances remain internal to the RPC paths.

begin;

alter table public.historical_match_imports enable row level security;
alter table public.historical_match_standings enable row level security;
alter table public.historical_match_course_appearances enable row level security;

revoke all on table public.historical_match_imports from public, anon, authenticated;
revoke all on table public.historical_match_standings from public, anon, authenticated;
revoke all on table public.historical_match_course_appearances from public, anon, authenticated;

grant all on table public.historical_match_imports to service_role;
grant all on table public.historical_match_standings to service_role;
grant all on table public.historical_match_course_appearances to service_role;

grant select on table public.historical_match_imports to authenticated;
grant select on table public.historical_match_standings to authenticated;

create policy chunk2p_site_admin_read_historical_match_imports
  on public.historical_match_imports
  for select
  to authenticated
  using ((select public.is_current_user_site_admin()));

create policy chunk2p_site_admin_read_historical_match_standings
  on public.historical_match_standings
  for select
  to authenticated
  using ((select public.is_current_user_site_admin()));

commit;

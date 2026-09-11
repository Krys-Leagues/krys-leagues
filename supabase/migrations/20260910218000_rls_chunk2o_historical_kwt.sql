-- Staging-only security chunk 2O: Historical KWT import/scorecard data.
-- Public KWT readers remain RPC-backed; admin recovery/preflight reads use
-- authenticated site-admin sessions.

begin;

alter table public.historical_kwt_imports enable row level security;
alter table public.historical_kwt_scorecards enable row level security;

revoke all on table public.historical_kwt_imports from public, anon, authenticated;
revoke all on table public.historical_kwt_scorecards from public, anon, authenticated;

grant all on table public.historical_kwt_imports to service_role;
grant all on table public.historical_kwt_scorecards to service_role;

grant select on table public.historical_kwt_imports to authenticated;
grant select on table public.historical_kwt_scorecards to authenticated;

create policy chunk2o_site_admin_read_historical_kwt_imports
  on public.historical_kwt_imports
  for select
  to authenticated
  using ((select public.is_current_user_site_admin()));

create policy chunk2o_site_admin_read_historical_kwt_scorecards
  on public.historical_kwt_scorecards
  for select
  to authenticated
  using ((select public.is_current_user_site_admin()));

commit;

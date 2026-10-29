-- Staging-only security chunk 2N: Historical PYP import/observation data.
-- Public readers remain RPC-backed; the admin preflight route reads
-- observations directly through an authenticated site-admin session.

begin;

alter table public.historical_pyp_imports enable row level security;
alter table public.historical_pyp_observations enable row level security;

revoke all on table public.historical_pyp_imports from public, anon, authenticated;
revoke all on table public.historical_pyp_observations from public, anon, authenticated;

grant all on table public.historical_pyp_imports to service_role;
grant all on table public.historical_pyp_observations to service_role;

grant select on table public.historical_pyp_observations to authenticated;

create policy chunk2n_site_admin_read_historical_pyp_observations
  on public.historical_pyp_observations
  for select
  to authenticated
  using ((select public.is_current_user_site_admin()));

commit;

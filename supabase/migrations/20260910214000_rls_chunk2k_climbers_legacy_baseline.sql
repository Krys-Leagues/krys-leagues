-- Staging-only security chunk 2K: Climbers legacy baseline support.
-- The admin Climbers page and protected activation route read these rows;
-- writes remain inside apply_climbers_legacy_baseline or service_role paths.

begin;

alter table public.climbers_legacy_baseline_imports enable row level security;
alter table public.climbers_legacy_baseline_source_rows enable row level security;
alter table public.climbers_legacy_baselines enable row level security;

revoke all on table public.climbers_legacy_baseline_imports from public, anon, authenticated;
revoke all on table public.climbers_legacy_baseline_source_rows from public, anon, authenticated;
revoke all on table public.climbers_legacy_baselines from public, anon, authenticated;

grant all on table public.climbers_legacy_baseline_imports to service_role;
grant all on table public.climbers_legacy_baseline_source_rows to service_role;
grant all on table public.climbers_legacy_baselines to service_role;

grant select on table public.climbers_legacy_baseline_imports to authenticated;
grant select on table public.climbers_legacy_baseline_source_rows to authenticated;
grant select on table public.climbers_legacy_baselines to authenticated;

create policy chunk2k_site_admin_read_climbers_legacy_baseline_imports
  on public.climbers_legacy_baseline_imports
  for select
  to authenticated
  using ((select public.is_current_user_site_admin()));

create policy chunk2k_site_admin_read_climbers_legacy_baseline_source_rows
  on public.climbers_legacy_baseline_source_rows
  for select
  to authenticated
  using ((select public.is_current_user_site_admin()));

create policy chunk2k_site_admin_read_climbers_legacy_baselines
  on public.climbers_legacy_baselines
  for select
  to authenticated
  using ((select public.is_current_user_site_admin()));

commit;

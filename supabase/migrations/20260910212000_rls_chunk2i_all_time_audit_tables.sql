-- Staging-only security chunk 2I: All-Time audit and import metadata.
-- The admin backfill page reads all_time_late_backfill_audit directly;
-- all other access remains inside protected RPCs or service_role paths.

begin;

alter table public.all_time_correction_audit enable row level security;
alter table public.all_time_late_backfill_audit enable row level security;
alter table public.all_time_verified_period_audit enable row level security;
alter table public.all_time_source_batches enable row level security;
alter table public.all_time_late_backfill_batches enable row level security;

revoke all on table public.all_time_correction_audit from public, anon, authenticated;
revoke all on table public.all_time_late_backfill_audit from public, anon, authenticated;
revoke all on table public.all_time_verified_period_audit from public, anon, authenticated;
revoke all on table public.all_time_source_batches from public, anon, authenticated;
revoke all on table public.all_time_late_backfill_batches from public, anon, authenticated;

grant all on table public.all_time_correction_audit to service_role;
grant all on table public.all_time_late_backfill_audit to service_role;
grant all on table public.all_time_verified_period_audit to service_role;
grant all on table public.all_time_source_batches to service_role;
grant all on table public.all_time_late_backfill_batches to service_role;

grant select on table public.all_time_late_backfill_audit to authenticated;

create policy chunk2i_site_admin_select_late_backfill_audit
  on public.all_time_late_backfill_audit
  for select
  to authenticated
  using ((select public.is_current_user_site_admin()));

commit;

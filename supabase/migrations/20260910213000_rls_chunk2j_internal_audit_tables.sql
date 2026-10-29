-- Staging-only security chunk 2J: internal KWT/Solo audit state.
-- These tables have no direct application reader; protected admin functions
-- and service_role are the only intended access paths.

begin;

alter table public.historical_kwt_website_rank_cleanup_runs enable row level security;
alter table public.kwt_operational_result_audit enable row level security;
alter table public.solo_attempt_correction_audit enable row level security;

revoke all on table public.historical_kwt_website_rank_cleanup_runs from public, anon, authenticated;
revoke all on table public.kwt_operational_result_audit from public, anon, authenticated;
revoke all on table public.solo_attempt_correction_audit from public, anon, authenticated;

grant all on table public.historical_kwt_website_rank_cleanup_runs to service_role;
grant all on table public.kwt_operational_result_audit to service_role;
grant all on table public.solo_attempt_correction_audit to service_role;

commit;

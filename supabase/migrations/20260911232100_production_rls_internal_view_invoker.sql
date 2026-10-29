-- Production security-definer view repair for server/admin-only derived data.
-- These views are consumed through trusted server paths, not browser reads.

alter view public.solo_live_best_attempts set (security_invoker = true);
alter view public.solo_live_hn1_recognition set (security_invoker = true);
alter view public.climbers_year_to_date set (security_invoker = true);
alter view public.climbers_standings set (security_invoker = true);

revoke all on
  public.solo_live_best_attempts,
  public.solo_live_hn1_recognition,
  public.climbers_year_to_date,
  public.climbers_standings
from public, anon, authenticated;

grant select on
  public.solo_live_best_attempts,
  public.solo_live_hn1_recognition,
  public.climbers_year_to_date,
  public.climbers_standings
to service_role;

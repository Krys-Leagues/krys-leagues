-- Staging-only security chunk 2Q: Historical Stroke legacy import data.
-- Public player history remains RPC-backed; the admin import/pairing UI reads
-- these tables directly through authenticated site-admin sessions.

begin;

alter table public.historical_stroke_imports enable row level security;
alter table public.historical_stroke_standings enable row level security;
alter table public.historical_stroke_course_appearances enable row level security;
alter table public.historical_stroke_opponent_assignments enable row level security;

revoke all on table public.historical_stroke_imports from public, anon, authenticated;
revoke all on table public.historical_stroke_standings from public, anon, authenticated;
revoke all on table public.historical_stroke_course_appearances from public, anon, authenticated;
revoke all on table public.historical_stroke_opponent_assignments from public, anon, authenticated;

grant all on table public.historical_stroke_imports to service_role;
grant all on table public.historical_stroke_standings to service_role;
grant all on table public.historical_stroke_course_appearances to service_role;
grant all on table public.historical_stroke_opponent_assignments to service_role;

grant select on table public.historical_stroke_imports to authenticated;
grant select on table public.historical_stroke_standings to authenticated;
grant select on table public.historical_stroke_course_appearances to authenticated;
grant select on table public.historical_stroke_opponent_assignments to authenticated;

create policy chunk2q_site_admin_read_historical_stroke_imports
  on public.historical_stroke_imports
  for select
  to authenticated
  using ((select public.is_current_user_site_admin()));

create policy chunk2q_site_admin_read_historical_stroke_standings
  on public.historical_stroke_standings
  for select
  to authenticated
  using ((select public.is_current_user_site_admin()));

create policy chunk2q_site_admin_read_historical_stroke_course_appearances
  on public.historical_stroke_course_appearances
  for select
  to authenticated
  using ((select public.is_current_user_site_admin()));

create policy chunk2q_site_admin_read_historical_stroke_opponent_assignments
  on public.historical_stroke_opponent_assignments
  for select
  to authenticated
  using ((select public.is_current_user_site_admin()));

commit;

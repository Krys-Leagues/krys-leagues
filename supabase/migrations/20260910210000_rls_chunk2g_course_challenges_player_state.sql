-- Staging-only security chunk 2G: Course Challenges player-state tables.
-- No current application, RPC, or server path references these tables, so
-- keep them service-role-only until an explicit protected workflow exists.

begin;

alter table public.course_challenge_progress enable row level security;
alter table public.course_challenge_rewards enable row level security;
alter table public.course_challenge_profile_selections enable row level security;

revoke all on table public.course_challenge_progress from public, anon, authenticated;
revoke all on table public.course_challenge_rewards from public, anon, authenticated;
revoke all on table public.course_challenge_profile_selections from public, anon, authenticated;

grant all on table public.course_challenge_progress to service_role;
grant all on table public.course_challenge_rewards to service_role;
grant all on table public.course_challenge_profile_selections to service_role;

commit;

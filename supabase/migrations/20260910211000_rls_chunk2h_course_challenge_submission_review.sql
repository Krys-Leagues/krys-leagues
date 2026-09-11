-- Staging-only security chunk 2H: Course Challenges submission/review state.
-- No current client or server route references these tables directly; the
-- existing protected review RPCs are the only intended mutation path.

begin;

alter table public.course_challenge_submissions enable row level security;
alter table public.course_challenge_review_notifications enable row level security;
alter table public.course_challenge_submission_review_events enable row level security;

revoke all on table public.course_challenge_submissions from public, anon, authenticated;
revoke all on table public.course_challenge_review_notifications from public, anon, authenticated;
revoke all on table public.course_challenge_submission_review_events from public, anon, authenticated;

grant all on table public.course_challenge_submissions to service_role;
grant all on table public.course_challenge_review_notifications to service_role;
grant all on table public.course_challenge_submission_review_events to service_role;

commit;

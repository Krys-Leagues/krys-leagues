-- Read-only postflight for the separately reviewed Course Challenge Review Desk
-- event channel. Expected: one exact admin SELECT policy and one exact client
-- INSERT deny policy; no submission tables added to supabase_realtime.
select policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'realtime'
  and tablename = 'messages'
  and policyname in ('course_challenge_review_admin_receive', 'course_challenge_review_client_send_denied')
order by policyname;

select pubname, schemaname, tablename
from pg_publication_tables
where schemaname = 'public'
  and tablename in ('course_challenge_submissions', 'course_challenge_submission_review_events');

select has_table_privilege('anon', 'public.course_challenge_submissions', 'SELECT') as anon_submission_select,
       has_table_privilege('authenticated', 'public.course_challenge_submissions', 'SELECT') as authenticated_submission_select;


-- Read-only preflight for the separately reviewed Course Challenge Review Desk
-- event channel. No writes are performed by this file.
select current_database() as database_name;

select c.oid::regclass as relation_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'realtime' and c.relname = 'messages';

select policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'realtime' and tablename = 'messages'
order by policyname;

select pubname, schemaname, tablename
from pg_publication_tables
where schemaname = 'public'
  and tablename in ('course_challenge_submissions', 'course_challenge_submission_review_events')
order by pubname, tablename;

select has_table_privilege('anon', 'public.course_challenge_submissions', 'SELECT') as anon_submission_select,
       has_table_privilege('authenticated', 'public.course_challenge_submissions', 'SELECT') as authenticated_submission_select;

select pg_get_functiondef(p.oid) as site_admin_function
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'is_current_user_site_admin'
  and pg_get_function_identity_arguments(p.oid) = '';


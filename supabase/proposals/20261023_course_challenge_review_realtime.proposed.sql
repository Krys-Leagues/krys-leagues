-- PREPARED ONLY — do not execute without a separately authorized Production change.
-- The Review Desk receives an event-only signal on a private topic and then
-- refetches the protected admin API. No scorecard row is added to a Postgres
-- Changes publication and no private payload is broadcast.
begin;

select pg_advisory_xact_lock(hashtext('krys:course-challenge:review-realtime:v1'));

do $$
begin
  if to_regclass('realtime.messages') is null then
    raise exception 'realtime.messages is unavailable';
  end if;
  if not exists (
    select 1
    from pg_class
    where oid = 'realtime.messages'::regclass
      and relrowsecurity
  ) then
    raise exception 'realtime.messages RLS must be enabled';
  end if;
  if exists (
    select 1
    from pg_policies
    where schemaname = 'realtime'
      and tablename = 'messages'
      and policyname in (
        'course_challenge_review_admin_receive',
        'course_challenge_review_client_send_denied'
      )
  ) then
    raise exception 'Course Challenge review Realtime policies already exist';
  end if;
end
$$;

create policy course_challenge_review_admin_receive
on realtime.messages
for select
to authenticated
using (
  extension = 'broadcast'
  and topic = 'course-challenge:review-desk'
  and public.is_current_user_site_admin()
);

-- Browser clients only receive the signal. Broadcast sends are server-only
-- through the service-role REST endpoint and are not accepted from clients.
create policy course_challenge_review_client_send_denied
on realtime.messages
for insert
to authenticated
with check (false);

commit;

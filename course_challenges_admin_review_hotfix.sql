-- Additive Course Challenge admin-review hotfix.
-- Existing submissions, proof paths, scores, and review columns are preserved.
begin;

alter table public.course_challenge_submissions
  add column if not exists proof_image_sha256 text,
  add column if not exists admin_verified_game_mode text,
  add column if not exists admin_game_mode_verified_by uuid references auth.users(id) on delete set null,
  add column if not exists admin_game_mode_verified_at timestamptz;

alter table public.course_challenge_submissions
  drop constraint if exists course_challenge_submissions_proof_image_sha256_check;
alter table public.course_challenge_submissions
  add constraint course_challenge_submissions_proof_image_sha256_check
  check (proof_image_sha256 is null or proof_image_sha256 ~* '^[0-9a-f]{64}$');

alter table public.course_challenge_submissions
  drop constraint if exists course_challenge_submissions_admin_verified_game_mode_check;
alter table public.course_challenge_submissions
  add constraint course_challenge_submissions_admin_verified_game_mode_check
  check (admin_verified_game_mode is null or admin_verified_game_mode in ('solo','multiplayer'));

create index if not exists course_challenge_submissions_proof_hash_idx
  on public.course_challenge_submissions(proof_image_sha256)
  where proof_image_sha256 is not null;

create table if not exists public.course_challenge_submission_review_events (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.course_challenge_submissions(id) on delete restrict,
  action text not null check (action in ('submitted','approved','rejected','returned_to_review')),
  from_status text,
  to_status text not null,
  reviewer_id uuid references auth.users(id) on delete set null,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists course_challenge_review_events_submission_idx
  on public.course_challenge_submission_review_events(submission_id, created_at desc);

alter table public.course_challenge_submission_review_events enable row level security;
revoke all on table public.course_challenge_submission_review_events from public, anon, authenticated;
drop policy if exists course_challenge_review_events_admin_read on public.course_challenge_submission_review_events;
create policy course_challenge_review_events_admin_read
  on public.course_challenge_submission_review_events
  for select to authenticated using (public.is_current_user_site_admin());
drop policy if exists course_challenge_review_events_admin_insert on public.course_challenge_submission_review_events;
create policy course_challenge_review_events_admin_insert
  on public.course_challenge_submission_review_events
  for insert to authenticated with check (public.is_current_user_site_admin());

create table if not exists public.course_challenge_review_notifications (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.course_challenge_submissions(id) on delete restrict,
  notification_kind text not null default 'discord_review_needed' check (notification_kind = 'discord_review_needed'),
  status text not null check (status in ('sent','not_configured','failed')),
  attempted_at timestamptz not null default now(),
  sent_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  unique (submission_id, notification_kind)
);

alter table public.course_challenge_review_notifications enable row level security;
revoke all on table public.course_challenge_review_notifications from public, anon, authenticated;
drop policy if exists course_challenge_review_notifications_admin_read on public.course_challenge_review_notifications;
create policy course_challenge_review_notifications_admin_read
  on public.course_challenge_review_notifications
  for select to authenticated using (public.is_current_user_site_admin());

-- Preserve a durable audit event for already-reviewed rows without changing them.
insert into public.course_challenge_submission_review_events(
  submission_id, action, from_status, to_status, reviewer_id, notes, metadata, created_at
)
select id, case when status = 'approved' then 'approved' else 'rejected' end,
       null, status, reviewed_by, review_notes,
       jsonb_build_object('source', 'legacy_review_columns'),
       coalesce(reviewed_at, created_at)
from public.course_challenge_submissions
where reviewed_at is not null
  and not exists (
    select 1 from public.course_challenge_submission_review_events event
    where event.submission_id = course_challenge_submissions.id
      and event.metadata ->> 'source' = 'legacy_review_columns'
  );

drop function if exists public.approve_course_challenge_submission(uuid,uuid,text,text);
create or replace function public.approve_course_challenge_submission(
  p_submission_id uuid,
  p_course_id uuid,
  p_fingerprint text,
  p_review_notes text default null,
  p_admin_verified_game_mode text default null
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_submission public.course_challenge_submissions%rowtype;
  v_course public.all_time_courses%rowtype;
  v_all_time jsonb;
  v_provenance text;
  v_previous_status text;
  v_mode text := lower(nullif(btrim(p_admin_verified_game_mode), ''));
begin
  if v_user_id is null or not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode='42501';
  end if;
  if p_submission_id is null or p_fingerprint is null or lower(p_fingerprint) !~ '^[0-9a-f]{64}$' then
    raise exception 'Submission id and fingerprint are required';
  end if;

  select * into v_submission
  from public.course_challenge_submissions
  where id = p_submission_id
  for update;
  if not found then raise exception 'Course Challenge submission was not found'; end if;
  v_previous_status := v_submission.status;
  if v_submission.status = 'rejected' then
    raise exception 'Return this submission to review before approving it';
  end if;
  if v_submission.status not in ('pending','needs_review','approved') then
    raise exception 'This Course Challenge submission is not reviewable';
  end if;
  if v_submission.status = 'approved' and v_submission.all_time_processing_status = 'processed'
     and v_submission.admin_verified_game_mode is not null then
    return jsonb_build_object(
      'action', 'already_processed',
      'submission_id', p_submission_id,
      'all_time', coalesce(v_submission.all_time_processing_result, '{}'::jsonb),
      'game_mode', v_submission.admin_verified_game_mode
    );
  end if;

  if v_submission.challenge_key = 'ace' or v_submission.level_number >= 3 then
    if v_mode <> 'multiplayer' then
      raise exception 'Levels 3–5 and the Ace Challenge require verified Multiplayer Game Mode';
    end if;
  elsif v_submission.level_number in (1,2) then
    if v_mode not in ('solo','multiplayer') then
      raise exception 'Select verified Solo or Multiplayer Game Mode before approval';
    end if;
  else
    raise exception 'Unsupported Course Challenge Level';
  end if;

  select * into v_course
  from public.all_time_courses
  where id = p_course_id and active and difficulty = v_submission.difficulty
  for update;
  if not found then raise exception 'The Course Challenge difficulty does not match the selected All-Time course'; end if;

  if v_mode = 'multiplayer' then
    v_provenance := 'course-challenge-submission:' || p_submission_id::text;
    v_all_time := public.apply_all_time_entry(
      p_course_id,
      v_submission.player_id,
      v_submission.id,
      lower(p_fingerprint),
      v_submission.relative_to_par,
      v_submission.hole_scores,
      'full_card',
      'course_challenge',
      v_provenance,
      coalesce(v_submission.review_notes, ''),
      v_submission.created_at,
      v_submission.id
    );
  else
    v_all_time := jsonb_build_object(
      'action', 'not_eligible',
      'classification', 'SOLO',
      'submitted_score', v_submission.relative_to_par,
      'climbers_points', 0
    );
  end if;

  update public.course_challenge_submissions
  set status = 'approved',
      reviewed_at = clock_timestamp(),
      reviewed_by = v_user_id,
      review_notes = coalesce(nullif(btrim(p_review_notes), ''), review_notes),
      admin_verified_game_mode = v_mode,
      admin_game_mode_verified_by = v_user_id,
      admin_game_mode_verified_at = clock_timestamp(),
      all_time_processing_status = 'processed',
      all_time_processing_result = v_all_time,
      all_time_processed_at = coalesce(all_time_processed_at, clock_timestamp())
  where id = p_submission_id;

  insert into public.course_challenge_submission_review_events(
    submission_id, action, from_status, to_status, reviewer_id, notes, metadata
  ) values (
    p_submission_id, 'approved', v_previous_status, 'approved', v_user_id,
    nullif(btrim(p_review_notes), ''),
    jsonb_build_object('admin_verified_game_mode', v_mode, 'all_time', v_all_time)
  );

  return jsonb_build_object(
    'action', 'processed',
    'submission_id', p_submission_id,
    'all_time', v_all_time,
    'game_mode', v_mode
  );
end;
$function$;
revoke all on function public.approve_course_challenge_submission(uuid,uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.approve_course_challenge_submission(uuid,uuid,text,text,text) to authenticated;

create or replace function public.return_course_challenge_submission_to_review(
  p_submission_id uuid,
  p_review_notes text default null
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_status text;
begin
  if v_user_id is null or not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode='42501';
  end if;
  select status into v_status from public.course_challenge_submissions where id = p_submission_id for update;
  if not found then raise exception 'Course Challenge submission was not found'; end if;
  if v_status <> 'rejected' then raise exception 'Only rejected submissions can be returned to review'; end if;

  update public.course_challenge_submissions
  set status = 'needs_review',
      review_reason = coalesce(nullif(btrim(p_review_notes), ''), review_reason, 'Returned to review by an authorized admin.')
  where id = p_submission_id;

  insert into public.course_challenge_submission_review_events(
    submission_id, action, from_status, to_status, reviewer_id, notes
  ) values (
    p_submission_id, 'returned_to_review', v_status, 'needs_review', v_user_id,
    nullif(btrim(p_review_notes), '')
  );

  return jsonb_build_object('action','returned_to_review','submission_id',p_submission_id);
end;
$function$;
revoke all on function public.return_course_challenge_submission_to_review(uuid,text) from public, anon, authenticated;
grant execute on function public.return_course_challenge_submission_to_review(uuid,text) to authenticated;

commit;

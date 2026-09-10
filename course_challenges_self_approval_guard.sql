-- Enforce canonical-player self-approval prevention for every approval RPC call.
-- Reject/withdraw behavior remains unchanged.
begin;

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
  v_reviewer_player_id uuid := public.current_user_canonical_player_id();
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
  if v_reviewer_player_id is not null and v_reviewer_player_id = v_submission.player_id then
    raise exception 'You cannot approve your own Course Challenge submission.' using errcode='42501';
  end if;
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

commit;

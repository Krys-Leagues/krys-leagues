-- Additive Course Challenge -> All-Time -> Climbers integration.
-- Apply after the existing All-Time/Climbers foundation, normal-entry, and
-- authoritative-time SQL. This file does not rewrite historical records.
begin;

do $$
begin
  if to_regclass('public.course_challenge_submissions') is null
     or to_regclass('public.all_time_record_observations') is null
     or to_regclass('public.all_time_best_records') is null
     or to_regclass('public.climbers_events') is null
     or to_regclass('public.climbers_seasons') is null then
    raise exception 'Course Challenges and the existing All-Time/Climbers layers must be installed first';
  end if;
end;
$$;

alter table public.course_challenge_submissions
  add column if not exists all_time_processing_status text not null default 'not_processed',
  add column if not exists all_time_processing_result jsonb,
  add column if not exists all_time_processed_at timestamptz;

alter table public.course_challenge_submissions
  drop constraint if exists course_challenge_submissions_all_time_processing_status_check;
alter table public.course_challenge_submissions
  add constraint course_challenge_submissions_all_time_processing_status_check
  check (all_time_processing_status in ('not_processed','processed'));

-- The direct link makes approval retries auditable without relying only on a
-- text provenance field. Existing observations/events remain unchanged.
alter table public.all_time_record_observations
  add column if not exists course_challenge_submission_id uuid references public.course_challenge_submissions(id) on delete set null;
alter table public.climbers_events
  add column if not exists course_challenge_submission_id uuid references public.course_challenge_submissions(id) on delete set null;

create unique index if not exists all_time_observation_course_challenge_submission_uidx
  on public.all_time_record_observations(course_challenge_submission_id)
  where course_challenge_submission_id is not null;
create unique index if not exists climbers_event_course_challenge_submission_uidx
  on public.climbers_events(course_challenge_submission_id)
  where course_challenge_submission_id is not null;

-- The current All-Time installation must supply these columns through its
-- authoritative-time layer. Refuse an unsafe partial install rather than
-- rewriting historical observations to manufacture timestamps.
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='all_time_record_observations' and column_name='entry_key')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='all_time_record_observations' and column_name='entry_type')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='all_time_record_observations' and column_name='hole_strokes')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='all_time_record_observations' and column_name='source_label')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='all_time_record_observations' and column_name='recorded_at')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='all_time_record_observations' and column_name='authoritative_submitted_at')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='all_time_record_observations' and column_name='authoritative_submitted_date')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='all_time_record_observations' and column_name='authoritative_time_precision')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='climbers_events' and column_name='effective_at')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='climbers_events' and column_name='effective_date') then
    raise exception 'Install the existing All-Time authoritative-time layer before Course Challenge integration';
  end if;
end;
$$;

-- Normal entries already use a nullable batch_id; keep Course Challenge
-- observations in the same single-card path.
alter table public.all_time_record_observations
  alter column batch_id drop not null;

create or replace function public.apply_all_time_entry(
  p_course_id uuid,
  p_player_id uuid,
  p_entry_key uuid,
  p_fingerprint text,
  p_score integer,
  p_hole_strokes jsonb,
  p_entry_type text,
  p_source_label text,
  p_provenance_reference text,
  p_notes text,
  p_authoritative_submitted_at timestamptz,
  p_course_challenge_submission_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_course public.all_time_courses%rowtype;
  v_player public.players%rowtype;
  v_existing_score integer;
  v_existing_fingerprint text;
  v_classification text;
  v_score integer := p_score;
  v_observation_id uuid;
  v_event_id uuid;
  v_season_id uuid;
  v_points integer := 0;
  v_passed uuid[] := '{}'::uuid[];
  v_recorded_at timestamptz := clock_timestamp();
  v_authoritative_at timestamptz := coalesce(p_authoritative_submitted_at, v_recorded_at);
  v_source_label text := coalesce(nullif(btrim(p_source_label), ''), 'All-Time score entry');
  v_provenance_reference text := nullif(btrim(p_provenance_reference), '');
begin
  if v_user_id is null or not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode='42501';
  end if;
  if p_entry_key is null or p_fingerprint is null or lower(p_fingerprint) !~ '^[0-9a-f]{64}$' then
    raise exception 'Entry idempotency key and fingerprint are required';
  end if;
  if p_entry_type not in ('full_card','quick_score') then
    raise exception 'Unsupported All-Time entry type';
  end if;

  select * into v_course
  from public.all_time_courses
  where id = p_course_id and active and difficulty in ('Easy','Hard')
  for update;
  if not found then raise exception 'The selected Easy/Hard course is unavailable'; end if;

  select * into v_player
  from public.players
  where id = public.resolve_canonical_player_id(p_player_id);
  if not found then raise exception 'The selected canonical player is unavailable'; end if;

  if p_course_challenge_submission_id is not null then
    select id into v_observation_id
    from public.all_time_record_observations
    where course_challenge_submission_id = p_course_challenge_submission_id;
    if found then
      return jsonb_build_object('action','already_saved','observation_id',v_observation_id,'climbers_points',0);
    end if;
  end if;

  if exists (select 1 from public.all_time_record_observations where entry_key = p_entry_key) then
    select id,score,fingerprint into v_observation_id,v_score,v_existing_fingerprint
    from public.all_time_record_observations where entry_key = p_entry_key;
    if v_existing_fingerprint <> lower(p_fingerprint) then
      raise exception 'This idempotency key is already bound to a different entry';
    end if;
    return jsonb_build_object('action','already_saved','observation_id',v_observation_id,'current_best_score',v_score,'climbers_points',0);
  end if;

  if exists (select 1 from public.all_time_record_observations where fingerprint = lower(p_fingerprint)) then
    select id,score into v_observation_id,v_score
    from public.all_time_record_observations where fingerprint = lower(p_fingerprint) limit 1;
    return jsonb_build_object('action','already_saved','observation_id',v_observation_id,'current_best_score',v_score,'climbers_points',0);
  end if;

  if p_entry_type = 'full_card' then
    if p_hole_strokes is null or jsonb_typeof(p_hole_strokes) <> 'array'
       or jsonb_array_length(p_hole_strokes) <> 18
       or v_course.par is null or v_course.hole_pars is null
       or jsonb_typeof(v_course.hole_pars) <> 'array'
       or jsonb_array_length(v_course.hole_pars) <> 18 then
      raise exception 'Full-card entry requires 18 hole scores and 18 authoritative hole pars';
    end if;
    if exists (
      select 1 from jsonb_array_elements(p_hole_strokes) value
      where jsonb_typeof(value) <> 'number' or value::text !~ '^[0-9]+$' or value::text::integer < 1
    ) then raise exception 'Hole scores must be positive whole numbers'; end if;
    if exists (
      select 1 from jsonb_array_elements(v_course.hole_pars) value
      where jsonb_typeof(value) <> 'number' or value::text !~ '^[0-9]+$' or value::text::integer < 1
    ) then raise exception 'Course hole pars must be positive whole numbers'; end if;
    if (select sum(value::text::integer) from jsonb_array_elements(v_course.hole_pars)) <> v_course.par then
      raise exception 'Course hole pars must total the authoritative course par';
    end if;
    v_score := (select sum(value::text::integer) from jsonb_array_elements(p_hole_strokes))
      - (select sum(value::text::integer) from jsonb_array_elements(v_course.hole_pars));
  elsif v_score is null then
    raise exception 'Quick Score requires a score relative to par';
  end if;

  perform public.refresh_all_time_best_record(p_course_id, v_player.id);
  select score into v_existing_score
  from public.all_time_best_records
  where course_id = p_course_id and player_id = v_player.id
  for update;

  if not found then v_classification := 'FIRST';
  elsif v_score < v_existing_score then v_classification := 'BETTER';
  elsif v_score = v_existing_score then v_classification := 'EQUAL';
  else v_classification := 'WORSE';
  end if;

  if v_classification = 'BETTER' then
    select coalesce(array_agg(best.player_id order by best.score,best.player_id),'{}'::uuid[]), count(*)::integer
    into v_passed,v_points
    from public.all_time_best_records best
    where best.course_id = p_course_id and best.player_id <> v_player.id and best.score > v_score;
  end if;

  insert into public.all_time_record_observations(
    batch_id,course_id,player_id,identity_status,historical_player_name,score,source_course_name,
    source_row,fingerprint,observed_at,metadata,entry_type,hole_strokes,source_label,
    provenance_reference,notes,recorded_by,entry_key,recorded_at,authoritative_submitted_at,
    authoritative_submitted_date,authoritative_submission_order,authoritative_time_precision,
    course_challenge_submission_id
  ) values (
    null,p_course_id,v_player.id,'resolved',v_player.screen_name,v_score,v_course.display_name,
    null,lower(p_fingerprint),v_recorded_at,
    jsonb_build_object('entry_method',p_entry_type,'course_challenge_submission_id',p_course_challenge_submission_id),
    p_entry_type,nullif(p_hole_strokes,'null'::jsonb),v_source_label,v_provenance_reference,
    nullif(btrim(p_notes),''),v_user_id,p_entry_key,v_recorded_at,v_authoritative_at,
    (v_authoritative_at at time zone 'UTC')::date,null,'exact',p_course_challenge_submission_id
  ) returning id into v_observation_id;

  if v_classification in ('FIRST','BETTER') then
    perform public.refresh_all_time_best_record(p_course_id, v_player.id);
  end if;

  if v_classification in ('FIRST','BETTER') then
    select id into v_season_id
    from public.climbers_seasons
    where status in ('active','awaiting_finalization')
      and starts_at <= v_authoritative_at and ends_at > v_authoritative_at
    order by starts_at desc limit 1;

    if v_season_id is not null then
      insert into public.climbers_events(
        season_id,observation_id,player_id,course_id,difficulty,old_pb_score,new_pb_score,
        points,calculation_version,source_label,provenance_reference,created_by,created_at,
        effective_at,effective_date,effective_order,effective_time_precision,
        course_challenge_submission_id
      ) values (
        v_season_id,v_observation_id,v_player.id,p_course_id,v_course.difficulty,v_existing_score,
        v_score,case when v_classification = 'BETTER' then v_points else 0 end,'climbers-v1',
        v_source_label,v_provenance_reference,v_user_id,v_recorded_at,v_authoritative_at,
        (v_authoritative_at at time zone 'UTC')::date,null,'exact',p_course_challenge_submission_id
      ) returning id into v_event_id;
      insert into public.climbers_event_passes(event_id,passed_player_id)
      select v_event_id,passed from unnest(v_passed) passed;
    else
      v_points := 0;
    end if;
  end if;

  return jsonb_build_object(
    'action',lower(v_classification),
    'classification',v_classification,
    'observation_id',v_observation_id,
    'old_pb_score',v_existing_score,
    'submitted_score',v_score,
    'new_pb_score',case when v_classification in ('FIRST','BETTER') then v_score else v_existing_score end,
    'current_best_score',case when v_classification in ('FIRST','BETTER') then v_score else v_existing_score end,
    'climbers_points',case when v_classification = 'BETTER' then v_points else 0 end,
    'climbers_event_id',v_event_id,
    'passed_player_ids',to_jsonb(v_passed),
    'target_season_id',v_season_id,
    'authoritative_submitted_at',v_authoritative_at
  );
end;
$function$;
revoke all on function public.apply_all_time_entry(uuid,uuid,uuid,text,integer,jsonb,text,text,text,text,timestamptz,uuid) from public,anon,authenticated;

-- Existing admin All-Time entry now uses the same comparison/pass-count core.
create or replace function public.record_all_time_normal_entry(
  p_course_id uuid,p_player_id uuid,p_entry_key uuid,p_fingerprint text,p_score integer,
  p_hole_strokes jsonb,p_entry_type text,p_source_label text,p_provenance_reference text,p_notes text
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
begin
  return public.apply_all_time_entry(
    p_course_id,p_player_id,p_entry_key,p_fingerprint,p_score,p_hole_strokes,p_entry_type,
    p_source_label,p_provenance_reference,p_notes,null,null
  );
end;
$function$;
revoke all on function public.record_all_time_normal_entry(uuid,uuid,uuid,text,integer,jsonb,text,text,text,text) from public,anon,authenticated;
grant execute on function public.record_all_time_normal_entry(uuid,uuid,uuid,text,integer,jsonb,text,text,text,text) to authenticated;

create or replace function public.approve_course_challenge_submission(
  p_submission_id uuid,
  p_course_id uuid,
  p_fingerprint text,
  p_review_notes text default null
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
  if v_submission.status = 'rejected' then raise exception 'A rejected Course Challenge submission cannot be approved'; end if;
  if v_submission.status not in ('pending','needs_review','approved') then raise exception 'This Course Challenge submission is not reviewable'; end if;

  select * into v_course
  from public.all_time_courses
  where id = p_course_id and active and difficulty = v_submission.difficulty
  for update;
  if not found then raise exception 'The Course Challenge difficulty does not match the selected All-Time course'; end if;

  v_provenance := 'course-challenge-submission:' || p_submission_id::text;
  v_all_time := public.apply_all_time_entry(
    p_course_id,
    v_submission.player_id,
    p_submission.id,
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

  update public.course_challenge_submissions
  set status = 'approved',
      reviewed_at = coalesce(reviewed_at, clock_timestamp()),
      reviewed_by = coalesce(reviewed_by, v_user_id),
      review_notes = coalesce(nullif(btrim(p_review_notes), ''), review_notes),
      all_time_processing_status = 'processed',
      all_time_processing_result = v_all_time,
      all_time_processed_at = coalesce(all_time_processed_at, clock_timestamp())
  where id = p_submission_id;

  return jsonb_build_object(
    'action',case when (v_all_time->>'action') = 'already_saved' then 'already_processed' else 'processed' end,
    'submission_id',p_submission_id,
    'all_time',v_all_time
  );
end;
$function$;
revoke all on function public.approve_course_challenge_submission(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.approve_course_challenge_submission(uuid,uuid,text,text) to authenticated;

commit;

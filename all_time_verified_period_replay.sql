-- Protected posting-order replay for verified Previous Period entries.
--
-- This migration is intentionally manual. It does not run automatically from
-- the application. It preserves the verified observations and their audit rows,
-- assigns immutable per-period posting sequence, and replays Climbers from the
-- opening PB state reconstructed from preserved observations.
begin;

do $guard$
begin
  if to_regclass('public.all_time_record_observations') is null
     or to_regclass('public.all_time_verified_period_audit') is null
     or to_regclass('public.all_time_courses') is null
     or to_regclass('public.players') is null
     or to_regclass('public.climbers_seasons') is null
     or to_regclass('public.climbers_events') is null
     or to_regclass('public.climbers_event_passes') is null
     or to_regclass('public.site_admin_users') is null
     or to_regprocedure('public.is_current_user_site_admin()') is null then
    raise exception 'Verified-period replay prerequisites are missing';
  end if;
end;
$guard$;

alter table public.all_time_verified_period_audit
  add column if not exists posting_sequence integer,
  add column if not exists passed_player_ids uuid[] not null default '{}'::uuid[];

alter table public.all_time_verified_period_audit
  drop constraint if exists all_time_verified_period_audit_posting_sequence_check,
  drop constraint if exists all_time_verified_period_audit_climbers_points_check,
  drop constraint if exists all_time_verified_period_audit_climbers_status_check;

alter table public.all_time_verified_period_audit
  add constraint all_time_verified_period_audit_posting_sequence_check
    check (posting_sequence is null or posting_sequence > 0),
  add constraint all_time_verified_period_audit_climbers_points_check
    check (climbers_points >= 0),
  add constraint all_time_verified_period_audit_climbers_status_check
    check (climbers_status in ('pending_period_replay','replayed','voided'));

create unique index if not exists all_time_verified_period_audit_period_sequence_uidx
  on public.all_time_verified_period_audit(verified_period_id, posting_sequence)
  where posting_sequence is not null;

create or replace function public.assign_all_time_verified_period_sequence()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_next_sequence integer;
begin
  if new.posting_sequence is not null then
    raise exception 'Posting sequence is assigned automatically';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'krys-leagues:verified-period-posting-sequence:' || new.verified_period_id::text,
      0
    )
  );

  perform 1
  from public.climbers_seasons as season
  where season.id = new.verified_period_id
  for update;

  if not found then
    raise exception 'Verified Climbers period does not exist';
  end if;

  select coalesce(max(a.posting_sequence), 0) + 1
    into v_next_sequence
  from public.all_time_verified_period_audit as a
  where a.verified_period_id = new.verified_period_id;

  new.posting_sequence := v_next_sequence;
  return new;
end;
$function$;

drop trigger if exists all_time_verified_period_sequence_assign
  on public.all_time_verified_period_audit;
create trigger all_time_verified_period_sequence_assign
before insert on public.all_time_verified_period_audit
for each row
execute function public.assign_all_time_verified_period_sequence();

create or replace function public.guard_all_time_verified_period_sequence()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if old.posting_sequence is not null
     and new.posting_sequence is distinct from old.posting_sequence then
    raise exception 'Verified-period posting sequence is immutable';
  end if;

  if new.verified_period_id is distinct from old.verified_period_id then
    raise exception 'Verified-period assignment is immutable';
  end if;

  return new;
end;
$function$;

drop trigger if exists all_time_verified_period_sequence_guard
  on public.all_time_verified_period_audit;
create trigger all_time_verified_period_sequence_guard
before update on public.all_time_verified_period_audit
for each row
execute function public.guard_all_time_verified_period_sequence();

create or replace function public.sync_all_time_verified_period_audit()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if old.entry_type = 'verified_period' then
    update public.all_time_verified_period_audit
    set submitted_score = new.score,
        new_pb_score = null,
        passed_player_ids = '{}'::uuid[],
        climbers_points = 0,
        climbers_status = case
          when new.voided_at is null then 'pending_period_replay'
          else 'voided'
        end,
        updated_at = clock_timestamp()
    where observation_id = new.id;
  end if;
  return new;
end;
$function$;

drop trigger if exists all_time_verified_period_audit_sync
  on public.all_time_record_observations;
create trigger all_time_verified_period_audit_sync
after update on public.all_time_record_observations
for each row
execute function public.sync_all_time_verified_period_audit();

create or replace function public._replay_climbers_verified_period(
  p_period_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_period public.climbers_seasons%rowtype;
  v_row record;
  v_old_pb integer;
  v_classification text;
  v_new_pb integer;
  v_points integer;
  v_passed uuid[];
  v_event_id uuid;
  v_total_points integer := 0;
  v_event_count integer := 0;
  v_replayed_count integer := 0;
  v_zero_count integer := 0;
  v_target_count integer;
  v_target_audit_count integer;
  v_missing_sequence_count integer;
  v_blocker_count integer;
begin
  if p_actor_id is null
     or not exists (
       select 1
       from auth.users as auth_user
       where auth_user.id = p_actor_id
     )
     or not exists (
       select 1
       from public.site_admin_users as site_admin
       where site_admin.user_id = p_actor_id
     ) then
    raise exception 'Replay actor must be an authenticated site admin';
  end if;

  select *
    into v_period
  from public.climbers_seasons as season
  where season.id = p_period_id
  for update;

  if not found then
    raise exception 'Verified Climbers period was not found';
  end if;

  if v_period.status = 'finalized' then
    raise exception 'A finalized Climbers period cannot be replayed';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('krys-leagues:verified-period-replay:' || p_period_id::text, 0)
  );

  select count(*)
    into v_target_count
  from public.all_time_record_observations as observation
  where observation.verified_period_id = p_period_id
    and observation.entry_type = 'verified_period'
    and observation.voided_at is null;

  select count(*)
    into v_target_audit_count
  from public.all_time_verified_period_audit as audit
  join public.all_time_record_observations as observation
    on observation.id = audit.observation_id
  where audit.verified_period_id = p_period_id
    and observation.verified_period_id = p_period_id
    and observation.entry_type = 'verified_period'
    and observation.voided_at is null;

  select count(*)
    into v_missing_sequence_count
  from public.all_time_verified_period_audit as audit
  join public.all_time_record_observations as observation
    on observation.id = audit.observation_id
  where audit.verified_period_id = p_period_id
    and observation.verified_period_id = p_period_id
    and observation.entry_type = 'verified_period'
    and observation.voided_at is null
    and audit.posting_sequence is null;

  if v_target_count = 0 then
    return jsonb_build_object(
      'action', 'nothing_to_replay',
      'period_id', p_period_id,
      'replayed_entries', 0,
      'total_points', 0,
      'calculation_version', 'climbers-verified-period-posting-v1'
    );
  end if;

  if v_target_count <> v_target_audit_count
     or v_missing_sequence_count <> 0 then
    raise exception 'Every verified-period observation needs exactly one immutable posting sequence and audit row';
  end if;

  create temp table verified_period_replay_pb (
    course_id uuid not null,
    player_id uuid not null,
    score integer not null,
    primary key (course_id, player_id)
  ) on commit drop;

  insert into verified_period_replay_pb(course_id, player_id, score)
  select
    observation.course_id,
    observation.player_id,
    min(observation.score)::integer
  from public.all_time_record_observations as observation
  where observation.entry_type = 'historical_import'
    and observation.identity_status = 'resolved'
    and observation.player_id is not null
    and observation.voided_at is null
  group by observation.course_id, observation.player_id;

  insert into verified_period_replay_pb(course_id, player_id, score)
  select
    observation.course_id,
    observation.player_id,
    min(observation.score)::integer
  from public.all_time_record_observations as observation
  join public.climbers_seasons as prior_period
    on prior_period.id = observation.verified_period_id
   and prior_period.ends_at <= v_period.starts_at
  where observation.entry_type = 'verified_period'
    and observation.verified_period_id <> p_period_id
    and observation.identity_status = 'resolved'
    and observation.player_id is not null
    and observation.voided_at is null
  group by observation.course_id, observation.player_id
  on conflict (course_id, player_id) do update
    set score = least(
      verified_period_replay_pb.score,
      excluded.score
    );

  insert into verified_period_replay_pb(course_id, player_id, score)
  select
    observation.course_id,
    observation.player_id,
    min(observation.score)::integer
  from public.all_time_record_observations as observation
  where observation.entry_type <> 'historical_import'
    and observation.entry_type <> 'verified_period'
    and observation.observed_at < v_period.starts_at
    and observation.identity_status = 'resolved'
    and observation.player_id is not null
    and observation.voided_at is null
  group by observation.course_id, observation.player_id
  on conflict (course_id, player_id) do update
    set score = least(
      verified_period_replay_pb.score,
      excluded.score
    );

  select count(*)
    into v_blocker_count
  from public.all_time_record_observations as observation
  where observation.voided_at is null
    and (
      (
        observation.entry_type = 'verified_period'
        and observation.verified_period_id = p_period_id
      )
      or (
        observation.entry_type = 'late_backfill'
        and observation.authoritative_submitted_date >= v_period.starts_at::date
        and observation.authoritative_submitted_date < v_period.ends_at::date
      )
      or (
        observation.entry_type not in ('historical_import','verified_period','late_backfill')
        and observation.observed_at >= v_period.starts_at
        and observation.observed_at < v_period.ends_at
      )
    )
    and observation.entry_type <> 'verified_period';

  if v_blocker_count <> 0 then
    raise exception 'Verified-period replay found observations in the selected period without approved posting-sequence evidence';
  end if;

  if exists (
    select 1
    from public.all_time_record_observations as observation
    where observation.verified_period_id = p_period_id
      and observation.entry_type = 'verified_period'
      and observation.voided_at is null
      and (
        observation.player_id is null
        or observation.identity_status <> 'resolved'
        or not exists (
          select 1
          from public.players as player
          where player.id = observation.player_id
        )
      )
  ) then
    raise exception 'Every verified-period replay observation must have a resolved canonical player';
  end if;

  create temp table verified_period_replay_effects (
    posting_sequence integer primary key,
    observation_id uuid not null,
    player_id uuid not null,
    course_id uuid not null,
    score integer not null,
    old_pb_score integer,
    classification text not null,
    new_pb_score integer,
    passed_player_ids uuid[] not null,
    climbers_points integer not null
  ) on commit drop;

  for v_row in
    select
      audit.posting_sequence,
      audit.observation_id,
      observation.player_id,
      observation.course_id,
      course.difficulty,
      observation.score::integer as score,
      observation.source_label,
      observation.provenance_reference
    from public.all_time_verified_period_audit as audit
    join public.all_time_record_observations as observation
      on observation.id = audit.observation_id
    join public.all_time_courses as course
      on course.id = observation.course_id
    where audit.verified_period_id = p_period_id
      and observation.verified_period_id = p_period_id
      and observation.entry_type = 'verified_period'
      and observation.voided_at is null
    order by audit.posting_sequence
  loop
    select replay.score
      into v_old_pb
    from verified_period_replay_pb as replay
    where replay.course_id = v_row.course_id
      and replay.player_id = v_row.player_id;

    if not found then
      v_classification := 'FIRST';
    elsif v_row.score < v_old_pb then
      v_classification := 'BETTER';
    elsif v_row.score = v_old_pb then
      v_classification := 'EQUAL';
    else
      v_classification := 'WORSE';
    end if;

    v_passed := '{}'::uuid[];
    v_points := 0;

    if v_classification = 'BETTER' then
      select
        coalesce(array_agg(replay.player_id order by replay.score, replay.player_id), '{}'::uuid[]),
        count(*)::integer
        into v_passed, v_points
      from verified_period_replay_pb as replay
      where replay.course_id = v_row.course_id
        and replay.player_id <> v_row.player_id
        and replay.score > v_row.score;
    end if;

    v_new_pb := case
      when v_classification in ('FIRST','BETTER') then v_row.score
      else v_old_pb
    end;

    insert into verified_period_replay_effects(
      posting_sequence,
      observation_id,
      player_id,
      course_id,
      score,
      old_pb_score,
      classification,
      new_pb_score,
      passed_player_ids,
      climbers_points
    ) values (
      v_row.posting_sequence,
      v_row.observation_id,
      v_row.player_id,
      v_row.course_id,
      v_row.score,
      v_old_pb,
      v_classification,
      v_new_pb,
      v_passed,
      case when v_classification = 'BETTER' then v_points else 0 end
    );

    if v_classification in ('FIRST','BETTER') then
      insert into verified_period_replay_pb(course_id, player_id, score)
      values (v_row.course_id, v_row.player_id, v_row.score)
      on conflict (course_id, player_id) do update
        set score = least(
          verified_period_replay_pb.score,
          excluded.score
        );
    end if;
  end loop;

  select
    count(*)::integer,
    coalesce(sum(climbers_points), 0)::integer
    into v_replayed_count, v_total_points
  from verified_period_replay_effects;

  if v_period.starts_at = timestamptz '2026-08-15T00:00:00Z'
     and v_period.ends_at = timestamptz '2026-08-29T00:00:00Z'
     and (
       v_replayed_count <> 12
       or v_total_points <> 281
       or not exists (
         select 1
         from verified_period_replay_effects as effect
         join public.all_time_courses as course
           on course.id = effect.course_id
         where course.display_name ilike 'Cherry Blossom%'
           and course.difficulty = 'Hard'
           and effect.score = -18
           and effect.climbers_points = 73
       )
       or not exists (
         select 1
         from verified_period_replay_effects as effect
         join public.all_time_courses as course
           on course.id = effect.course_id
         where course.display_name ilike 'Cherry Blossom%'
           and course.difficulty = 'Hard'
           and effect.score = -10
           and effect.climbers_points = 35
       )
       or not exists (
         select 1
         from verified_period_replay_effects as effect
         join public.all_time_courses as course
           on course.id = effect.course_id
         where course.display_name ilike 'Shangri-La%'
           and course.difficulty = 'Easy'
           and effect.score = -26
           and effect.climbers_points = 75
       )
       or not exists (
         select 1
         from verified_period_replay_effects as effect
         join public.all_time_courses as course
           on course.id = effect.course_id
         where course.display_name ilike 'Shangri-La%'
           and course.difficulty = 'Easy'
           and effect.score = -29
           and effect.climbers_points = 98
       )
     ) then
    raise exception 'Approved Aug 15–Aug 28 replay did not reproduce exactly 281 Climbers points';
  end if;

  for v_row in
    select *
    from verified_period_replay_effects
    order by posting_sequence
  loop
    select event.id
      into v_event_id
    from public.climbers_events as event
    where event.observation_id = v_row.observation_id
    for update;

    if v_event_id is not null and exists (
      select 1
      from public.climbers_events as event
      where event.id = v_event_id
        and event.season_id <> p_period_id
    ) then
      raise exception 'Observation already belongs to a different Climbers period event';
    end if;

    if v_row.classification in ('FIRST','BETTER') then
      if v_event_id is null then
        insert into public.climbers_events(
          season_id,
          observation_id,
          player_id,
          course_id,
          difficulty,
          old_pb_score,
          new_pb_score,
          points,
          calculation_version,
          source_label,
          provenance_reference,
          created_by,
          effective_at,
          effective_date,
          effective_order,
          effective_time_precision
        )
        select
          p_period_id,
          v_row.observation_id,
          v_row.player_id,
          v_row.course_id,
          course.difficulty,
          v_row.old_pb_score,
          v_row.new_pb_score,
          v_row.climbers_points,
          'climbers-verified-period-posting-v1',
          observation.source_label,
          observation.provenance_reference,
          p_actor_id,
          null,
          v_period.starts_at::date,
          v_row.posting_sequence,
          'date_ordered'
        from public.all_time_courses as course
        join public.all_time_record_observations as observation
          on observation.id = v_row.observation_id
        returning id into v_event_id;
      else
        update public.climbers_events as event
        set season_id = p_period_id,
            player_id = v_row.player_id,
            course_id = v_row.course_id,
            old_pb_score = v_row.old_pb_score,
            new_pb_score = v_row.new_pb_score,
            points = v_row.climbers_points,
            calculation_version = 'climbers-verified-period-posting-v1',
            effective_at = null,
            effective_date = v_period.starts_at::date,
            effective_order = v_row.posting_sequence,
            effective_time_precision = 'date_ordered',
            voided_at = null,
            voided_by = null,
            void_reason = null
        where event.id = v_event_id;
      end if;

      delete from public.climbers_event_passes
      where event_id = v_event_id;

      insert into public.climbers_event_passes(event_id, passed_player_id)
      select v_event_id, passed_player_id
      from unnest(v_row.passed_player_ids) as passed(passed_player_id);

      update public.all_time_verified_period_audit as audit
      set all_time_classification = v_row.classification,
          current_pb_score = v_row.old_pb_score,
          submitted_score = v_row.score,
          new_pb_score = v_row.new_pb_score,
          passed_player_ids = v_row.passed_player_ids,
          climbers_points = v_row.climbers_points,
          climbers_status = 'replayed',
          updated_at = clock_timestamp()
      where audit.observation_id = v_row.observation_id;

      v_event_count := v_event_count + 1;
    else
      if v_event_id is not null then
        update public.climbers_events as event
        set points = 0,
            voided_at = clock_timestamp(),
            voided_by = p_actor_id,
            void_reason = 'Verified-period replay: entry did not establish a PB'
        where event.id = v_event_id;

        delete from public.climbers_event_passes
        where event_id = v_event_id;
      end if;

      update public.all_time_verified_period_audit as audit
      set all_time_classification = v_row.classification,
          current_pb_score = v_row.old_pb_score,
          submitted_score = v_row.score,
          new_pb_score = null,
          passed_player_ids = '{}'::uuid[],
          climbers_points = 0,
          climbers_status = 'replayed',
          updated_at = clock_timestamp()
      where audit.observation_id = v_row.observation_id;

      v_zero_count := v_zero_count + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'action', 'replayed',
    'period_id', p_period_id,
    'replayed_entries', v_replayed_count,
    'events_created_or_reconciled', v_event_count,
    'zero_effect_entries', v_zero_count,
    'total_points', v_total_points,
    'calculation_version', 'climbers-verified-period-posting-v1',
    'same_posting_order', true,
    'legacy_baseline_untouched', true
  );
end;
$function$;

revoke all on function public._replay_climbers_verified_period(uuid,uuid)
  from public, anon, authenticated;

create or replace function public.replay_climbers_verified_period(p_period_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null or not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode = '42501';
  end if;

  return public._replay_climbers_verified_period(p_period_id, v_user_id);
end;
$function$;

revoke all on function public.replay_climbers_verified_period(uuid)
  from public, anon, authenticated;
grant execute on function public.replay_climbers_verified_period(uuid)
  to authenticated;

-- Keep the existing verified-period API signature. The automatic sequence
-- trigger assigns the next position, then the protected replay resolves the
-- selected period without requiring any manual order field.
create or replace function public.record_all_time_verified_period_entry(
  p_period_id uuid,
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
  p_confirmation_token text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_preview jsonb;
  v_observation_id uuid;
  v_recorded_at timestamptz;
  v_replay jsonb;
begin
  if v_user_id is null or not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode = '42501';
  end if;

  v_preview := public.preview_all_time_verified_period_entry(
    p_period_id,
    p_course_id,
    p_player_id,
    p_entry_key,
    p_fingerprint,
    p_score,
    p_hole_strokes,
    p_entry_type,
    p_source_label,
    p_provenance_reference,
    p_notes
  );

  if v_preview->>'action' = 'already_saved' then
    v_replay := public.replay_climbers_verified_period(p_period_id);
    return v_preview || jsonb_build_object('replay', v_replay);
  end if;

  if p_confirmation_token is null
     or p_confirmation_token <> v_preview->>'confirmation_token' then
    raise exception 'The preview changed or was not explicitly confirmed; review again before saving';
  end if;

  v_recorded_at := clock_timestamp();

  insert into public.all_time_record_observations(
    batch_id,
    course_id,
    player_id,
    identity_status,
    historical_player_name,
    score,
    source_course_name,
    source_row,
    fingerprint,
    observed_at,
    metadata,
    entry_type,
    hole_strokes,
    source_label,
    provenance_reference,
    notes,
    recorded_by,
    entry_key,
    recorded_at,
    authoritative_submitted_at,
    authoritative_submitted_date,
    authoritative_submission_order,
    authoritative_time_precision,
    verified_period_id
  ) values (
    null,
    p_course_id,
    (v_preview->>'player_id')::uuid,
    'resolved',
    v_preview->>'player_name',
    (v_preview->>'submitted_score')::integer,
    v_preview->>'course_name',
    null,
    lower(p_fingerprint),
    v_recorded_at,
    jsonb_build_object(
      'entry_method', p_entry_type,
      'verified_period_id', p_period_id::text,
      'climbers_status', 'pending_period_replay',
      'all_time_classification', v_preview->>'all_time_classification'
    ),
    'verified_period',
    nullif(p_hole_strokes, 'null'::jsonb),
    nullif(btrim(p_source_label), ''),
    nullif(btrim(p_provenance_reference), ''),
    nullif(btrim(p_notes), ''),
    v_user_id,
    p_entry_key,
    v_recorded_at,
    null,
    null,
    null,
    'unknown',
    p_period_id
  ) returning id into v_observation_id;

  if v_preview->>'all_time_classification' in ('FIRST', 'BETTER') then
    perform public.refresh_all_time_best_record(
      p_course_id,
      (v_preview->>'player_id')::uuid
    );
  end if;

  insert into public.all_time_verified_period_audit(
    observation_id,
    verified_period_id,
    course_id,
    player_id,
    recorded_at,
    recorded_by,
    source_label,
    provenance_reference,
    notes,
    all_time_classification,
    current_pb_score,
    submitted_score,
    new_pb_score,
    climbers_points,
    climbers_status
  ) values (
    v_observation_id,
    p_period_id,
    p_course_id,
    (v_preview->>'player_id')::uuid,
    v_recorded_at,
    v_user_id,
    p_source_label,
    nullif(btrim(p_provenance_reference), ''),
    nullif(btrim(p_notes), ''),
    v_preview->>'all_time_classification',
    nullif(v_preview->>'current_pb_score', '')::integer,
    (v_preview->>'submitted_score')::integer,
    nullif(v_preview->>'new_pb_score', '')::integer,
    0,
    'pending_period_replay'
  );

  v_replay := public.replay_climbers_verified_period(p_period_id);

  return jsonb_build_object(
    'action', 'saved',
    'observation_id', v_observation_id,
    'recorded_at', v_recorded_at,
    'authoritative_submitted_at', null,
    'authoritative_time_precision', 'unknown',
    'period_id', p_period_id,
    'target_period_label', v_preview->>'target_period_label',
    'all_time_classification', v_preview->>'all_time_classification',
    'climbers_points', coalesce(
      (
        select audit.climbers_points
        from public.all_time_verified_period_audit as audit
        where audit.observation_id = v_observation_id
      ),
      0
    ),
    'climbers_status', coalesce(
      (
        select audit.climbers_status
        from public.all_time_verified_period_audit as audit
        where audit.observation_id = v_observation_id
      ),
      'pending_period_replay'
    ),
    'replay', v_replay
  );
end;
$function$;

revoke all on function public.record_all_time_verified_period_entry(
  uuid,uuid,uuid,uuid,text,integer,jsonb,text,text,text,text,text
) from public, anon, authenticated;
grant execute on function public.record_all_time_verified_period_entry(
  uuid,uuid,uuid,uuid,text,integer,jsonb,text,text,text,text,text
) to authenticated;

-- Assign the already-proven posting order to the existing twelve rows only.
-- The expected player/course values are validation evidence; UUIDs and
-- observations are selected by verified_period_id, never by display text.
do $backfill$
declare
  v_period_id uuid;
  v_period_count integer;
  v_entry_count integer;
  v_audit_count integer;
  v_sequence_count integer;
  v_event_count integer;
begin
  perform pg_advisory_xact_lock(
    hashtext('krys-leagues:verified-period-posting-sequence-backfill:v1')
  );

  select count(*)
    into v_period_count
  from public.climbers_seasons as season
  where season.starts_at = timestamptz '2026-08-15T00:00:00Z'
    and season.ends_at = timestamptz '2026-08-29T00:00:00Z';

  select season.id
    into v_period_id
  from public.climbers_seasons as season
  where season.starts_at = timestamptz '2026-08-15T00:00:00Z'
    and season.ends_at = timestamptz '2026-08-29T00:00:00Z'
  order by season.id
  limit 1;

  if v_period_count <> 1 then
    raise exception 'Expected exactly one approved Aug 15–Aug 28, 2026 period; found %', v_period_count;
  end if;

  select count(*)
    into v_entry_count
  from public.all_time_record_observations as observation
  where observation.verified_period_id = v_period_id
    and observation.entry_type = 'verified_period'
    and observation.voided_at is null;

  select count(*)
    into v_audit_count
  from public.all_time_verified_period_audit as audit
  join public.all_time_record_observations as observation
    on observation.id = audit.observation_id
  where audit.verified_period_id = v_period_id
    and observation.verified_period_id = v_period_id
    and observation.entry_type = 'verified_period'
    and observation.voided_at is null;

  select count(*)
    into v_sequence_count
  from public.all_time_verified_period_audit as audit
  join public.all_time_record_observations as observation
    on observation.id = audit.observation_id
  where audit.verified_period_id = v_period_id
    and observation.verified_period_id = v_period_id
    and observation.entry_type = 'verified_period'
    and observation.voided_at is null
    and audit.posting_sequence is not null;

  select count(*)
    into v_event_count
  from public.climbers_events as event
  join public.all_time_record_observations as observation
    on observation.id = event.observation_id
  where observation.verified_period_id = v_period_id
    and observation.entry_type = 'verified_period'
    and observation.voided_at is null;

  if v_entry_count <> 12
     or v_audit_count <> 12
     or v_sequence_count <> 0
     or v_event_count <> 0 then
    raise exception
      'Approved twelve-row replay precondition failed: observations %, audits %, existing sequences %, events %',
      v_entry_count, v_audit_count, v_sequence_count, v_event_count;
  end if;

  if exists (
    select 1
    from public.all_time_verified_period_audit as audit
    join public.all_time_record_observations as observation
      on observation.id = audit.observation_id
    where audit.verified_period_id = v_period_id
      and observation.verified_period_id = v_period_id
      and observation.entry_type = 'verified_period'
      and observation.voided_at is null
      and coalesce(audit.recorded_at, audit.created_at, observation.observed_at) is null
  ) then
    raise exception 'Every approved verified entry needs preserved sequence evidence';
  end if;

  if exists (
    select 1
    from (
      select
        coalesce(audit.recorded_at, audit.created_at, observation.observed_at)
          as sequence_evidence_at
      from public.all_time_verified_period_audit as audit
      join public.all_time_record_observations as observation
        on observation.id = audit.observation_id
      where audit.verified_period_id = v_period_id
        and observation.verified_period_id = v_period_id
        and observation.entry_type = 'verified_period'
        and observation.voided_at is null
    ) as evidence
    group by evidence.sequence_evidence_at
    having count(*) > 1
  ) then
    raise exception 'Preserved verified-entry sequence evidence is ambiguous';
  end if;

  if exists (
    with expected (
      sequence_no,
      player_key,
      course_key,
      difficulty,
      score
    ) as (
      values
        (1,  '50jim',       'glooplair',      'Easy', -20),
        (2,  'catweazel',   'glooplair',      'Easy', -20),
        (3,  'bigja',       'glooplair',      'Easy', -20),
        (4,  'paulvppp',    'glooplair',      'Easy', -26),
        (5,  'jennem',      'cherryblossom',  'Hard', -18),
        (6,  'serenitymoon','cherryblossom',  'Hard', -10),
        (7,  'minig',       'cherryblossom',  'Hard', -32),
        (8,  'jennem',      'glooplair',      'Easy', -18),
        (9,  'therealjb',   'shangrila',      'Easy', -26),
        (10, 'leanin2it',   'glooplair',      'Hard', -19),
        (11, '50jim',       'glooplair',      'Hard', -10),
        (12, 'plucky',      'shangrila',      'Easy', -29)
    ),
    ordered as (
      select
        row_number() over (
          order by
            coalesce(audit.recorded_at, audit.created_at, observation.observed_at),
            audit.id
        )::integer as sequence_no,
        lower(regexp_replace(player.screen_name, '[^[:alnum:]]', '', 'g')) as player_key,
        lower(
          regexp_replace(
            regexp_replace(course.display_name, '\s+(easy|hard)$', '', 'i'),
            '[^[:alnum:]]',
            '',
            'g'
          )
        ) as course_key,
        course.difficulty,
        observation.score::integer as score
      from public.all_time_verified_period_audit as audit
      join public.all_time_record_observations as observation
        on observation.id = audit.observation_id
      join public.players as player
        on player.id = observation.player_id
      join public.all_time_courses as course
        on course.id = observation.course_id
      where audit.verified_period_id = v_period_id
        and observation.verified_period_id = v_period_id
        and observation.entry_type = 'verified_period'
        and observation.voided_at is null
    )
    select 1
    from ordered actual
    full join expected
      on expected.sequence_no = actual.sequence_no
    where actual.sequence_no is null
       or expected.sequence_no is null
       or actual.player_key <> expected.player_key
       or actual.course_key <> expected.course_key
       or actual.difficulty <> expected.difficulty
       or actual.score <> expected.score
  ) then
    raise exception 'The approved twelve-entry posting sequence does not match the preserved Production rows';
  end if;

  with ranked as (
    select
      audit.id,
      row_number() over (
        order by
          coalesce(audit.recorded_at, audit.created_at, observation.observed_at),
          audit.id
      )::integer as posting_sequence
    from public.all_time_verified_period_audit as audit
    join public.all_time_record_observations as observation
      on observation.id = audit.observation_id
    where audit.verified_period_id = v_period_id
      and observation.verified_period_id = v_period_id
      and observation.entry_type = 'verified_period'
      and observation.voided_at is null
  )
  update public.all_time_verified_period_audit as audit
  set posting_sequence = ranked.posting_sequence,
      updated_at = clock_timestamp()
  from ranked
  where audit.id = ranked.id;
end;
$backfill$;

-- Execute the one-time replay through the internal, explicitly attributed
-- migration path. The public RPC remains authenticated-admin-only for future
-- Previous Period saves and replays.
do $replay$
declare
  v_period_id uuid;
  v_period_count integer;
  v_result jsonb;
  v_actor_id uuid := '0d93ca19-289a-4929-a093-c7556e6d51ed'::uuid;
begin
  select count(*)
    into v_period_count
  from public.climbers_seasons as season
  where season.starts_at = timestamptz '2026-08-15T00:00:00Z'
    and season.ends_at = timestamptz '2026-08-29T00:00:00Z';

  select season.id
    into v_period_id
  from public.climbers_seasons as season
  where season.starts_at = timestamptz '2026-08-15T00:00:00Z'
    and season.ends_at = timestamptz '2026-08-29T00:00:00Z'
  order by season.id
  limit 1;

  if v_period_count <> 1 then
    raise exception 'Expected exactly one approved replay period; found %', v_period_count;
  end if;

  if not exists (
    select 1 from auth.users as auth_user where auth_user.id = v_actor_id
  ) or not exists (
    select 1 from public.site_admin_users as site_admin where site_admin.user_id = v_actor_id
  ) then
    raise exception 'Approved replay actor is not a valid site admin';
  end if;

  v_result := public._replay_climbers_verified_period(v_period_id, v_actor_id);

  if v_result->>'action' <> 'replayed'
     or (v_result->>'replayed_entries')::integer <> 12
     or (v_result->>'total_points')::integer <> 281 then
    raise exception 'Approved replay verification failed: %', v_result;
  end if;
end;
$replay$;

-- Read-only verification emitted when the migration is run.
select
  audit.verified_period_id as period_id,
  count(*)::integer as verified_audit_rows,
  count(*) filter (where audit.posting_sequence is not null)::integer
    as posting_sequence_rows,
  count(distinct audit.posting_sequence)::integer as unique_posting_sequences,
  min(audit.posting_sequence)::integer as first_posting_sequence,
  max(audit.posting_sequence)::integer as last_posting_sequence,
  count(distinct observation.id)::integer as observations_preserved,
  count(distinct event.id)::integer as climbers_events,
  coalesce(sum(event.points), 0)::integer as total_event_points,
  count(pass.passed_player_id)::integer as event_pass_rows,
  count(*) filter (where audit.climbers_status = 'replayed')::integer
    as replayed_audit_rows,
  15892::integer as legacy_baseline,
  (15892 + coalesce(sum(event.points), 0))::integer as expected_combined_ytd
from public.all_time_verified_period_audit as audit
join public.all_time_record_observations as observation
  on observation.id = audit.observation_id
left join public.climbers_events as event
  on event.observation_id = observation.id
 and event.season_id = audit.verified_period_id
left join public.climbers_event_passes as pass
  on pass.event_id = event.id
where audit.verified_period_id = (
  select season.id
  from public.climbers_seasons as season
  where season.starts_at = timestamptz '2026-08-15T00:00:00Z'
    and season.ends_at = timestamptz '2026-08-29T00:00:00Z'
)
group by audit.verified_period_id;

commit;

begin;

alter table public.major_scoring_sessions
  add column if not exists stream_participant_order uuid[];

create or replace function public.update_masters_stream_scorecard(
  p_session_id uuid,
  p_expected_revision bigint,
  p_current_hole integer,
  p_scores jsonb,
  p_trigger_fireworks boolean default false
)
returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare
  session_record public.major_scoring_sessions%rowtype;
  score_item jsonb;
  score_participant_id uuid;
  score_hole_number integer;
  score_value integer;
  next_revision bigint;
begin
  if not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode = '42501';
  end if;
  if p_current_hole not between 1 and 18 then raise exception 'Hole must be between 1 and 18'; end if;
  if jsonb_typeof(p_scores) <> 'array' then raise exception 'Scores must be an array'; end if;

  select * into session_record
  from public.major_scoring_sessions
  where id = p_session_id
  for update;
  if not found then raise exception 'Broadcast scorecard not found'; end if;
  if session_record.schedule_group_id is null then
    raise exception 'This is not a room-driven Masters stream scorecard' using errcode = '22023';
  end if;
  if not session_record.is_active or not session_record.is_public then
    raise exception 'This stream scorecard is no longer active; reload the current room' using errcode = '55000';
  end if;
  if session_record.revision <> p_expected_revision then
    raise exception 'STALE_STREAM_REVISION' using errcode = '40001';
  end if;

  for score_item in select value from jsonb_array_elements(p_scores)
  loop
    score_participant_id := (score_item ->> 'participant_id')::uuid;
    score_hole_number := coalesce((score_item ->> 'hole_number')::integer, p_current_hole);
    if score_hole_number not between 1 and 18 then raise exception 'Score hole must be between 1 and 18'; end if;
    if not exists (
      select 1
      from public.major_scoring_participants participant
      where participant.id = score_participant_id
        and participant.session_id = p_session_id
    ) then
      raise exception 'Participant does not belong to this broadcast scorecard';
    end if;

    if score_item ->> 'strokes' is null then
      delete from public.major_hole_scores
      where session_id = p_session_id
        and participant_id = score_participant_id
        and hole_number = score_hole_number;
    else
      score_value := (score_item ->> 'strokes')::integer;
      if score_value not between 1 and 99 then raise exception 'Score must be between 1 and 99'; end if;
      insert into public.major_hole_scores (session_id, participant_id, hole_number, strokes)
      values (p_session_id, score_participant_id, score_hole_number, score_value)
      on conflict (session_id, participant_id, hole_number)
      do update set strokes = excluded.strokes, updated_at = now();
    end if;
  end loop;

  update public.major_scoring_sessions
  set current_hole = p_current_hole,
      revision = revision + 1,
      fireworks_sequence = fireworks_sequence + case when p_trigger_fireworks then 1 else 0 end,
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_session_id
  returning revision into next_revision;
  return next_revision;
end;
$function$;

create or replace function public.reorder_masters_stream_participants(
  p_session_id uuid,
  p_expected_revision bigint,
  p_participant_ids uuid[]
)
returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare
  session_record public.major_scoring_sessions%rowtype;
  distinct_count integer;
  next_revision bigint;
begin
  if not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode = '42501';
  end if;

  select * into session_record
  from public.major_scoring_sessions
  where id = p_session_id
  for update;
  if not found then raise exception 'Broadcast scorecard not found'; end if;
  if session_record.schedule_group_id is null then
    raise exception 'This is not a room-driven Masters stream scorecard' using errcode = '22023';
  end if;
  if not session_record.is_active or not session_record.is_public then
    raise exception 'This stream scorecard is no longer active; reload the current room' using errcode = '55000';
  end if;
  if session_record.revision <> p_expected_revision then
    raise exception 'STALE_STREAM_REVISION' using errcode = '40001';
  end if;
  if pg_catalog.cardinality(p_participant_ids) <> session_record.participant_count then
    raise exception 'Player order must contain the complete broadcast roster' using errcode = '22023';
  end if;

  select count(distinct ordered.participant_id)
  into distinct_count
  from pg_catalog.unnest(p_participant_ids) as ordered(participant_id);
  if distinct_count <> session_record.participant_count
    or exists (
      select 1
      from pg_catalog.unnest(p_participant_ids) as ordered(participant_id)
      where not exists (
        select 1
        from public.major_scoring_participants participant
        where participant.session_id = p_session_id
          and participant.id = ordered.participant_id
      )
    ) then
    raise exception 'Player order must contain each broadcast participant exactly once' using errcode = '22023';
  end if;

  update public.major_scoring_sessions
  set stream_participant_order = p_participant_ids,
      revision = revision + 1,
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_session_id
  returning revision into next_revision;
  return next_revision;
end;
$function$;

create or replace function public.get_public_major_scoreboard(p_session_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  select jsonb_build_object(
    'session', jsonb_build_object(
      'id', session.id, 'label', session.label,
      'participant_count', session.participant_count,
      'current_hole', session.current_hole,
      'is_active', session.is_active,
      'updated_at', session.updated_at,
      'schedule_group_id', session.schedule_group_id,
      'play_day_id', session.play_day_id,
      'course_code', session.course_code,
      'course_name', session.course_name,
      'hole_pars', session.hole_pars,
      'revision', session.revision,
      'fireworks_sequence', session.fireworks_sequence,
      'stream_participant_order', session.stream_participant_order
    ),
    'event', jsonb_build_object(
      'id', event.id, 'slug', event.slug, 'name', event.name, 'year', event.year,
      'scorecard_background_url', event.scorecard_background_url,
      'scorecard_accent_color', event.scorecard_accent_color,
      'scorecard_text_color', event.scorecard_text_color
    ),
    'participants', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', participant.id, 'position', participant.position,
        'player_id', participant.player_id,
        'player_screen_name_snapshot', participant.player_screen_name_snapshot
      ) order by coalesce(
        pg_catalog.array_position(session.stream_participant_order, participant.id),
        participant.position
      ))
      from public.major_scoring_participants participant
      where participant.session_id = session.id
    ), '[]'::jsonb),
    'scores', coalesce((
      select jsonb_agg(jsonb_build_object(
        'participant_id', score.participant_id,
        'hole_number', score.hole_number,
        'strokes', score.strokes
      ) order by score.hole_number, score.participant_id)
      from public.major_hole_scores score
      where score.session_id = session.id
    ), '[]'::jsonb)
  )
  from public.major_scoring_sessions session
  join public.major_events event on event.id = session.major_event_id
  where session.id = p_session_id
    and session.is_public
    and event.is_public;
$function$;

revoke all on function public.update_masters_stream_scorecard(uuid, bigint, integer, jsonb, boolean)
from public, anon, authenticated;
grant execute on function public.update_masters_stream_scorecard(uuid, bigint, integer, jsonb, boolean)
to authenticated, service_role;
revoke all on function public.reorder_masters_stream_participants(uuid, bigint, uuid[])
from public, anon, authenticated;
grant execute on function public.reorder_masters_stream_participants(uuid, bigint, uuid[])
to authenticated, service_role;
revoke all on function public.get_public_major_scoreboard(uuid) from public, anon, authenticated;
grant execute on function public.get_public_major_scoreboard(uuid) to anon, authenticated;

commit;

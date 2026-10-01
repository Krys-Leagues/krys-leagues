begin;

-- Broadcast scoring is deliberately isolated from official Masters scorecards,
-- verification, results, and standings. These tables contain stream-only state.
alter table public.major_scoring_sessions
  drop constraint if exists major_scoring_sessions_participant_count_check;
alter table public.major_scoring_sessions
  add constraint major_scoring_sessions_participant_count_check
  check (participant_count between 2 and 4);

alter table public.major_scoring_participants
  drop constraint if exists major_scoring_participants_position_check;
alter table public.major_scoring_participants
  add constraint major_scoring_participants_position_check
  check (position between 1 and 4);

alter table public.major_scoring_sessions
  add column if not exists schedule_group_id uuid references public.major_schedule_groups(id) on delete restrict,
  add column if not exists play_day_id uuid references public.major_play_days(id) on delete restrict,
  add column if not exists course_code text,
  add column if not exists course_name text,
  add column if not exists hole_pars smallint[],
  add column if not exists revision bigint not null default 1,
  add column if not exists fireworks_sequence bigint not null default 0,
  add column if not exists updated_by uuid references auth.users(id) on delete set null;

alter table public.major_scoring_sessions
  add constraint major_scoring_sessions_course_code_check
  check (course_code is null or course_code in ('CBE', 'CBH')),
  add constraint major_scoring_sessions_hole_pars_check
  check (hole_pars is null or cardinality(hole_pars) = 18),
  add constraint major_scoring_sessions_revision_check
  check (revision >= 1),
  add constraint major_scoring_sessions_fireworks_sequence_check
  check (fireworks_sequence >= 0);

create unique index if not exists major_scoring_sessions_schedule_group_unique
  on public.major_scoring_sessions(schedule_group_id)
  where schedule_group_id is not null;

create or replace function public.get_admin_masters_stream_rooms(p_major_event_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  select case
    when not public.is_current_user_site_admin() then
      jsonb_build_object('error', 'Administrator authorization is required')
    else coalesce((
      select jsonb_agg(jsonb_build_object(
        'group_id', room.id,
        'play_day_id', day.id,
        'day_number', day.day_number,
        'day_label', day.label,
        'play_date', day.play_date,
        'starts_at', slot.starts_at,
        'group_label', room.group_label,
        'roster', room_data.roster,
        'participant_count', room_data.member_count,
        'existing_session_id', session.id
      ) order by day.day_number, slot.starts_at, lower(room.group_label))
      from public.major_schedule_groups room
      join public.major_play_days day on day.id = room.play_day_id
      join public.major_time_slots slot on slot.id = room.time_slot_id
      join lateral (
        select count(*)::integer as member_count,
          jsonb_agg(jsonb_build_object(
            'player_id', entry.player_id,
            'player_screen_name_snapshot', entry.player_screen_name_snapshot
          ) order by lower(entry.player_screen_name_snapshot), entry.player_id) as roster
        from public.major_schedule_group_members member
        join public.major_entries entry on entry.id = member.entry_id
        where member.group_id = room.id
          and entry.status in ('registered', 'confirmed')
      ) room_data on room_data.member_count between 2 and 4
      left join public.major_scoring_sessions session on session.schedule_group_id = room.id
      where room.major_event_id = p_major_event_id
        and room.is_published
    ), '[]'::jsonb)
  end;
$function$;

create or replace function public.load_masters_stream_room(
  p_schedule_group_id uuid,
  p_confirmed boolean default false
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  room_record record;
  session_id uuid;
  roster_count integer;
  course_code_value text;
  course_name_value text;
  pars_value smallint[];
begin
  if not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode = '42501';
  end if;
  if not p_confirmed then
    raise exception 'Room loading requires explicit confirmation' using errcode = '22023';
  end if;

  select room.id, room.major_event_id, room.play_day_id, room.group_label,
         day.day_number, day.label as day_label
  into room_record
  from public.major_schedule_groups room
  join public.major_play_days day on day.id = room.play_day_id
  where room.id = p_schedule_group_id
    and room.is_published;
  if not found then raise exception 'Complete published Masters room not found'; end if;

  select count(*) into roster_count
  from public.major_schedule_group_members member
  join public.major_entries entry on entry.id = member.entry_id
  where member.group_id = room_record.id
    and entry.status in ('registered', 'confirmed');
  if roster_count not between 2 and 4 then
    raise exception 'A stream room requires 2 to 4 active players';
  end if;

  if room_record.day_number in (1, 2) then
    course_code_value := 'CBE';
    course_name_value := 'Cherry Blossom Easy';
    pars_value := array[3,4,3,4,3,3,3,4,3,5,3,4,2,3,3,3,3,7]::smallint[];
  else
    course_code_value := 'CBH';
    course_name_value := 'Cherry Blossom Hard';
    pars_value := array[3,4,3,4,3,3,3,4,3,5,3,4,2,3,3,3,3,8]::smallint[];
  end if;

  update public.major_scoring_sessions
  set is_active = false, is_public = false, revision = revision + 1,
      updated_by = auth.uid(), updated_at = now()
  where is_active or is_public;

  select id into session_id
  from public.major_scoring_sessions
  where schedule_group_id = room_record.id
  for update;

  if session_id is null then
    insert into public.major_scoring_sessions (
      major_event_id, label, participant_count, current_hole, is_active, is_public,
      schedule_group_id, play_day_id, course_code, course_name, hole_pars, updated_by
    ) values (
      room_record.major_event_id,
      room_record.group_label || ' · Round ' || room_record.day_number,
      roster_count, 1, true, true, room_record.id, room_record.play_day_id,
      course_code_value, course_name_value, pars_value, auth.uid()
    ) returning id into session_id;

    insert into public.major_scoring_participants (
      session_id, position, player_id, player_screen_name_snapshot
    )
    select session_id, row_number() over (order by lower(entry.player_screen_name_snapshot), entry.player_id),
      entry.player_id, entry.player_screen_name_snapshot
    from public.major_schedule_group_members member
    join public.major_entries entry on entry.id = member.entry_id
    where member.group_id = room_record.id
      and entry.status in ('registered', 'confirmed')
    order by lower(entry.player_screen_name_snapshot), entry.player_id;
  else
    update public.major_scoring_sessions
    set label = room_record.group_label || ' · Round ' || room_record.day_number,
        participant_count = roster_count,
        is_active = true,
        is_public = true,
        play_day_id = room_record.play_day_id,
        course_code = course_code_value,
        course_name = course_name_value,
        hole_pars = pars_value,
        revision = revision + 1,
        updated_by = auth.uid(),
        updated_at = now()
    where id = session_id;
  end if;

  return session_id;
end;
$function$;

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
  score_value integer;
  next_revision bigint;
begin
  if not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode = '42501';
  end if;
  if p_current_hole not between 1 and 18 then raise exception 'Hole must be between 1 and 18'; end if;
  if jsonb_typeof(p_scores) <> 'array' then raise exception 'Scores must be an array'; end if;

  select * into session_record from public.major_scoring_sessions
  where id = p_session_id for update;
  if not found then raise exception 'Broadcast scorecard not found'; end if;
  if session_record.revision <> p_expected_revision then
    raise exception 'STALE_STREAM_REVISION' using errcode = '40001';
  end if;

  for score_item in select value from jsonb_array_elements(p_scores)
  loop
    score_participant_id := (score_item ->> 'participant_id')::uuid;
    if not exists (
      select 1 from public.major_scoring_participants participant
      where participant.id = score_participant_id and participant.session_id = p_session_id
    ) then raise exception 'Participant does not belong to this broadcast scorecard'; end if;

    if score_item ->> 'strokes' is null then
      delete from public.major_hole_scores
      where session_id = p_session_id
        and participant_id = score_participant_id
        and hole_number = p_current_hole;
    else
      score_value := (score_item ->> 'strokes')::integer;
      if score_value not between 1 and 99 then raise exception 'Score must be between 1 and 99'; end if;
      insert into public.major_hole_scores (session_id, participant_id, hole_number, strokes)
      values (p_session_id, score_participant_id, p_current_hole, score_value)
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
      'fireworks_sequence', session.fireworks_sequence
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
      ) order by participant.position)
      from public.major_scoring_participants participant
      where participant.session_id = session.id
    ), '[]'::jsonb),
    'scores', coalesce((
      select jsonb_agg(jsonb_build_object(
        'participant_id', score.participant_id,
        'hole_number', score.hole_number,
        'strokes', score.strokes
      ) order by score.hole_number, score.participant_id)
      from public.major_hole_scores score where score.session_id = session.id
    ), '[]'::jsonb)
  )
  from public.major_scoring_sessions session
  join public.major_events event on event.id = session.major_event_id
  where session.id = p_session_id and session.is_public and event.is_public;
$function$;

revoke all on function public.get_admin_masters_stream_rooms(uuid) from public, anon, authenticated;
grant execute on function public.get_admin_masters_stream_rooms(uuid) to authenticated, service_role;
revoke all on function public.load_masters_stream_room(uuid, boolean) from public, anon, authenticated;
grant execute on function public.load_masters_stream_room(uuid, boolean) to authenticated, service_role;
revoke all on function public.update_masters_stream_scorecard(uuid, bigint, integer, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.update_masters_stream_scorecard(uuid, bigint, integer, jsonb, boolean) to authenticated, service_role;
revoke all on function public.get_public_major_scoreboard(uuid) from public, anon, authenticated;
grant execute on function public.get_public_major_scoreboard(uuid) to anon, authenticated;

commit;

begin;

-- Cherry Blossom Hard is the shared course for both Round 3 and the Final
-- Round. Keep this array in one database authority so player entry, admin
-- late-entry, and stream preparation cannot drift apart.
create or replace function public.masters_course_pars(p_day_number integer)
returns smallint[]
language sql
immutable
strict
set search_path to ''
as $function$
select case
  when p_day_number between 1 and 2 then
    array[3,4,3,4,3,3,3,4,3,5,3,4,2,3,3,3,3,7]::smallint[]
  when p_day_number between 3 and 4 then
    array[3,4,3,4,3,3,3,4,3,8,3,3,2,4,3,4,4,6]::smallint[]
  else null::smallint[]
end
$function$;

revoke all on function public.masters_course_pars(integer)
from public, anon, authenticated;
grant execute on function public.masters_course_pars(integer)
to authenticated, service_role;

-- Repair only the derived par metadata on existing Masters scorecard holes.
-- Player-entered strokes, scorecard status, evidence, and audit snapshots are
-- deliberately untouched. The predicate makes this safe to re-run.
update public.major_player_scorecard_holes hole
set par = (public.masters_course_pars(day.day_number))[hole.hole_number]
from public.major_player_scorecards card
join public.major_events event on event.id = card.major_event_id
join public.major_play_days day on day.id = card.play_day_id
where hole.scorecard_id = card.id
  and event.slug = 'masters'
  and day.day_number in (3,4)
  and hole.par is distinct from (public.masters_course_pars(day.day_number))[hole.hole_number];

-- Keep any already-created Masters stream metadata aligned with the same
-- authority. No current Hard stream rows are changed by this repair unless
-- their stored derived par array is actually wrong.
update public.major_scoring_sessions session
set hole_pars = public.masters_course_pars(day.day_number),
    revision = session.revision + 1,
    updated_at = now()
from public.major_events event
join public.major_play_days day on day.major_event_id = event.id
where session.major_event_id = event.id
  and session.play_day_id = day.id
  and event.slug = 'masters'
  and day.day_number in (3,4)
  and session.course_code = 'CBH'
  and session.hole_pars is distinct from public.masters_course_pars(day.day_number);

create or replace function public.save_my_major_scorecard(
  p_play_day_id uuid,
  p_holes jsonb
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  me uuid;
  entry public.major_entries;
  day public.major_play_days;
  card uuid;
  item jsonb;
  pars smallint[];
  scoring_window record;
begin
  me := public.current_major_player_id();
  if me is null then
    raise exception 'Canonical player identity is required' using errcode = '42501';
  end if;

  select * into day from public.major_play_days where id = p_play_day_id;
  if not found then raise exception 'Major play day not found'; end if;

  select * into entry
  from public.major_entries
  where major_event_id = day.major_event_id
    and player_id = me
    and status in ('registered', 'confirmed');
  if not found then raise exception 'You are not entered in this Major'; end if;

  select * into scoring_window
  from public.major_player_round_scoring_window(me, day.id);
  if not found then raise exception 'A complete published room assignment is required'; end if;
  if now() < scoring_window.room_start_at then raise exception 'Your room has not started yet'; end if;

  if day.scoring_finalized_at is not null then
    raise exception 'Score entry is closed for this round';
  end if;

  if jsonb_typeof(p_holes) <> 'array' then raise exception 'Holes must be an array'; end if;
  pars := public.masters_course_pars(day.day_number);
  if pars is null then raise exception 'Unsupported Masters round'; end if;

  insert into public.major_player_scorecards (
    major_event_id, play_day_id, entry_id, player_id, player_screen_name_snapshot, course_code
  ) values (
    day.major_event_id, day.id, entry.id, me, entry.player_screen_name_snapshot,
    case when day.day_number <= 2 then 'CBE' else 'CBH' end
  )
  on conflict (entry_id, play_day_id) do update
    set updated_at = now()
    where public.major_player_scorecards.status in ('draft', 'reopened')
  returning id into card;

  if card is null then raise exception 'Submitted or verified scorecards cannot be silently changed'; end if;

  delete from public.major_player_scorecard_holes where scorecard_id = card;
  for item in select value from jsonb_array_elements(p_holes) loop
    if (item->>'hole_number')::integer not between 1 and 18
       or (item->>'strokes')::integer not between 1 and 99 then
      raise exception 'Invalid hole score';
    end if;
    insert into public.major_player_scorecard_holes (scorecard_id, hole_number, par, strokes)
    values (card, (item->>'hole_number')::integer, pars[(item->>'hole_number')::integer], (item->>'strokes')::integer);
  end loop;

  return card;
end
$function$;

revoke all on function public.save_my_major_scorecard(uuid, jsonb)
from public, anon, authenticated;
grant execute on function public.save_my_major_scorecard(uuid, jsonb)
to authenticated;

create or replace function public.admin_submit_major_scorecard_service(
  p_major_event_id uuid,
  p_play_day_id uuid,
  p_entry_id uuid,
  p_holes jsonb,
  p_actor_user_id uuid,
  p_actor_player_id uuid,
  p_actor_screen_name text,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  target_entry public.major_entries;
  target_day public.major_play_days;
  scoring_window record;
  existing_card public.major_player_scorecards;
  card_id uuid;
  prior_status text;
  prior_access text;
  pars smallint[];
  score_snapshot jsonb;
begin
  if p_actor_user_id is null or nullif(btrim(p_actor_screen_name), '') is null then
    raise exception 'Authorized admin provenance is required' using errcode = '42501';
  end if;
  if length(coalesce(p_reason, '')) > 1000 then raise exception 'Reason is too long'; end if;
  if not exists (select 1 from public.major_events where id = p_major_event_id and slug = 'masters') then
    raise exception 'The late-score tool is restricted to the Masters event';
  end if;

  select * into target_entry
  from public.major_entries
  where id = p_entry_id and major_event_id = p_major_event_id and status in ('registered', 'confirmed');
  if not found then raise exception 'Active Masters entrant not found'; end if;

  select * into target_day from public.major_play_days where id = p_play_day_id and major_event_id = p_major_event_id;
  if not found then raise exception 'Masters round not found'; end if;
  if target_day.scoring_finalized_at is not null then raise exception 'This round is finalized and cannot accept a late score'; end if;

  select * into scoring_window from public.major_player_round_scoring_window(target_entry.player_id, target_day.id);
  if not found then raise exception 'A complete published room assignment is required'; end if;
  if now() <= scoring_window.round_closes_at then raise exception 'This player is still inside the normal scoring window'; end if;

  select * into existing_card from public.major_player_scorecards
  where entry_id = target_entry.id and play_day_id = target_day.id for update;
  prior_status := case when found then existing_card.status else null end;
  if prior_status in ('submitted', 'verified') then raise exception 'Submitted or verified scorecards cannot be overwritten'; end if;

  if jsonb_typeof(p_holes) <> 'array'
     or jsonb_array_length(p_holes) <> 18
     or (select count(distinct (item->>'hole_number')::integer) from jsonb_array_elements(p_holes) item) <> 18
     or exists (select 1 from jsonb_array_elements(p_holes) item
       where (item->>'hole_number')::integer not between 1 and 18
          or (item->>'strokes')::integer not between 1 and 99) then
    raise exception 'Enter one valid score for each of the 18 holes';
  end if;
  pars := public.masters_course_pars(target_day.day_number);
  if pars is null then raise exception 'Unsupported Masters round'; end if;
  prior_access := case
    when now() < scoring_window.room_start_at then 'before_room_start'
    when now() <= scoring_window.round_closes_at then 'normal_window_open'
    else 'closed_after_normal_deadline'
  end;

  insert into public.major_player_scorecards (
    major_event_id, play_day_id, entry_id, player_id, player_screen_name_snapshot, course_code
  ) values (
    p_major_event_id, target_day.id, target_entry.id, target_entry.player_id,
    target_entry.player_screen_name_snapshot, case when target_day.day_number <= 2 then 'CBE' else 'CBH' end
  )
  on conflict (entry_id, play_day_id) do update set updated_at = now()
    where public.major_player_scorecards.status in ('draft', 'reopened')
  returning id into card_id;
  if card_id is null then raise exception 'Submitted or verified scorecards cannot be overwritten'; end if;

  delete from public.major_player_scorecard_holes where scorecard_id = card_id;
  insert into public.major_player_scorecard_holes (scorecard_id, hole_number, par, strokes)
  select card_id, hole_number, pars[hole_number], strokes
  from (select (item->>'hole_number')::integer as hole_number, (item->>'strokes')::integer as strokes
        from jsonb_array_elements(p_holes) item) scores order by hole_number;

  select jsonb_agg(to_jsonb(hole) order by hole.hole_number) into score_snapshot
  from public.major_player_scorecard_holes hole where hole.scorecard_id = card_id;

  update public.major_player_scorecards
  set status = 'submitted', submitted_at = now(), submitted_by = null,
      verified_at = null, verified_by = null, verification_notes = null, updated_at = now()
  where id = card_id;

  insert into public.major_scorecard_audit_log (
    scorecard_id, action, actor_player_id, previous_status, next_status, score_snapshot, notes
  ) values (card_id, 'admin_score_entry', p_actor_player_id, prior_status, 'submitted', score_snapshot, nullif(btrim(p_reason), ''));

  insert into public.major_score_entry_admin_actions (
    major_event_id, play_day_id, entry_id, player_id, scorecard_id, action,
    actor_user_id, actor_player_id, actor_screen_name_snapshot, prior_access_state, reason, score_snapshot
  ) values (
    p_major_event_id, p_play_day_id, target_entry.id, target_entry.player_id, card_id,
    'admin_score_entry', p_actor_user_id, p_actor_player_id, btrim(p_actor_screen_name),
    prior_access, nullif(btrim(p_reason), ''), score_snapshot
  );
  return card_id;
end
$function$;

revoke all on function public.admin_submit_major_scorecard_service(uuid, uuid, uuid, jsonb, uuid, uuid, text, text)
from public, anon, authenticated;
grant execute on function public.admin_submit_major_scorecard_service(uuid, uuid, uuid, jsonb, uuid, uuid, text, text)
to service_role;

-- The player room-proof reader uses the same published physical-room rule as
-- the public room reader. Classification remains available as player metadata,
-- but it cannot hide a valid published Round 3 or Final Round room.
create or replace function public.get_my_major_room_scorecard_context(
  p_play_day_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  me uuid;
  result jsonb;
begin
  me := public.current_major_player_id();
  if me is null then return null; end if;

  select jsonb_build_object(
    'group_id', room.id,
    'major_event_id', room.major_event_id,
    'play_day_id', room.play_day_id,
    'group_label', room.group_label,
    'instructions', room.instructions,
    'player_id', me,
    'day_number', day.day_number,
    'day_label', day.label,
    'roster', coalesce((
      select jsonb_agg(jsonb_build_object(
        'player_id', roster_entry.player_id,
        'player_screen_name_snapshot', roster_entry.player_screen_name_snapshot
      ) order by roster_entry.player_screen_name_snapshot, roster_entry.player_id)
      from public.major_schedule_group_members roster_member
      join public.major_entries roster_entry on roster_entry.id = roster_member.entry_id
      where roster_member.group_id = room.id
    ), '[]'::jsonb)
  ) into result
  from public.major_entries entry
  join public.major_entry_day_choices choice on choice.entry_id = entry.id and choice.play_day_id = p_play_day_id
  join public.major_play_days day on day.id = choice.play_day_id
  join public.major_events event on event.id = day.major_event_id
  join public.major_schedule_group_members membership
    on membership.entry_id = entry.id and membership.play_day_id = day.id and membership.time_slot_id = choice.time_slot_id
  join public.major_schedule_groups room
    on room.id = membership.group_id and room.major_event_id = event.id
   and room.play_day_id = day.id and room.time_slot_id = choice.time_slot_id and room.is_published
  where entry.player_id = me
    and entry.status in ('registered', 'confirmed')
    and (select count(*) from public.major_schedule_group_members count_member where count_member.group_id = room.id) between 2 and 4
  limit 1;
  return result;
end
$function$;

revoke all on function public.get_my_major_room_scorecard_context(uuid)
from public, anon, authenticated;
grant execute on function public.get_my_major_room_scorecard_context(uuid)
to authenticated;

-- Round 3 and Final Round share this stream authority as well.
create or replace function public.load_masters_stream_room(
  p_schedule_group_id uuid,
  p_confirmed boolean,
  p_course_code text,
  p_course_name text,
  p_hole_pars smallint[]
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
  expected_course_code text;
  expected_course_name text;
  expected_pars smallint[];
  existing_participant_count integer;
begin
  if not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required' using errcode = '42501'; end if;
  if not p_confirmed then raise exception 'Room loading requires explicit confirmation' using errcode = '22023'; end if;

  select room.id, room.major_event_id, room.play_day_id, room.group_label, day.day_number, day.label as day_label
  into room_record
  from public.major_schedule_groups room
  join public.major_play_days day on day.id = room.play_day_id
  where room.id = p_schedule_group_id and room.is_published;
  if not found then raise exception 'Complete published Masters room not found'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(room_record.major_event_id::text));
  select count(*) into roster_count
  from public.major_schedule_group_members member
  join public.major_entries entry on entry.id = member.entry_id
  where member.group_id = room_record.id and entry.status in ('registered', 'confirmed');
  if roster_count not between 2 and 4 then raise exception 'A stream room requires 2 to 4 active players'; end if;

  expected_course_code := case when room_record.day_number <= 2 then 'CBE' else 'CBH' end;
  expected_course_name := case when room_record.day_number <= 2 then 'Cherry Blossom Easy' else 'Cherry Blossom Hard' end;
  expected_pars := public.masters_course_pars(room_record.day_number);
  if p_course_code is distinct from expected_course_code
     or p_course_name is distinct from expected_course_name
     or p_hole_pars is distinct from expected_pars then
    raise exception 'Course configuration does not match the authoritative Masters round configuration' using errcode = '22023';
  end if;

  update public.major_scoring_sessions
  set is_active = false, is_public = false, revision = revision + 1, updated_by = auth.uid(), updated_at = now()
  where major_event_id = room_record.major_event_id and schedule_group_id is not null and (is_active or is_public);

  select id into session_id from public.major_scoring_sessions where schedule_group_id = room_record.id for update;
  if session_id is null then
    insert into public.major_scoring_sessions (
      major_event_id, label, participant_count, current_hole, is_active, is_public,
      schedule_group_id, play_day_id, course_code, course_name, hole_pars, updated_by
    ) values (
      room_record.major_event_id, room_record.group_label || ' · Round ' || room_record.day_number,
      roster_count, 1, true, true, room_record.id, room_record.play_day_id,
      expected_course_code, expected_course_name, expected_pars, auth.uid()
    ) returning id into session_id;

    insert into public.major_scoring_participants (session_id, position, player_id, player_screen_name_snapshot)
    select session_id, row_number() over (order by lower(entry.player_screen_name_snapshot), entry.player_id),
      entry.player_id, entry.player_screen_name_snapshot
    from public.major_schedule_group_members member
    join public.major_entries entry on entry.id = member.entry_id
    where member.group_id = room_record.id and entry.status in ('registered', 'confirmed')
    order by lower(entry.player_screen_name_snapshot), entry.player_id;
  else
    select count(*) into existing_participant_count from public.major_scoring_participants participant where participant.session_id = session_id;
    if existing_participant_count <> roster_count or exists (
      select 1 from public.major_scoring_participants participant
      where participant.session_id = session_id and not exists (
        select 1 from public.major_schedule_group_members member
        join public.major_entries entry on entry.id = member.entry_id
        where member.group_id = room_record.id and entry.status in ('registered', 'confirmed') and entry.player_id = participant.player_id
      )
    ) then
      if exists (select 1 from public.major_hole_scores score where score.session_id = session_id) then
        raise exception 'Published room roster changed after stream scoring began; existing stream state was preserved';
      end if;
      delete from public.major_scoring_participants participant where participant.session_id = session_id;
      insert into public.major_scoring_participants (session_id, position, player_id, player_screen_name_snapshot)
      select session_id, row_number() over (order by lower(entry.player_screen_name_snapshot), entry.player_id), entry.player_id, entry.player_screen_name_snapshot
      from public.major_schedule_group_members member
      join public.major_entries entry on entry.id = member.entry_id
      where member.group_id = room_record.id and entry.status in ('registered', 'confirmed')
      order by lower(entry.player_screen_name_snapshot), entry.player_id;
    end if;
    update public.major_scoring_sessions
    set label = room_record.group_label || ' · Round ' || room_record.day_number,
        participant_count = roster_count, is_active = true, is_public = true,
        play_day_id = room_record.play_day_id, course_code = expected_course_code,
        course_name = expected_course_name, hole_pars = expected_pars, revision = revision + 1,
        updated_by = auth.uid(), updated_at = now()
    where id = session_id;
  end if;
  return session_id;
end
$function$;

revoke all on function public.load_masters_stream_room(uuid, boolean, text, text, smallint[])
from public, anon, authenticated;
grant execute on function public.load_masters_stream_room(uuid, boolean, text, text, smallint[])
to authenticated;

commit;

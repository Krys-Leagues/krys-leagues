begin;

-- Return only complete, published rooms that are player-visible. Direct table
-- access remains protected by RLS; this narrow reader exposes no admin notes or
-- private/incomplete room staging.
create or replace function public.get_public_major_published_rooms(
  p_major_event_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
with visible_event as (
  select event.*
  from public.major_events event
  where event.id = p_major_event_id
    and (
      (not event.is_test_event and event.is_public)
      or (
        event.is_test_event
        and auth.uid() is not null
        and (
          public.is_current_user_site_admin()
          or exists (
            select 1
            from public.major_test_event_testers tester
            where tester.major_event_id = event.id
              and tester.player_id = public.current_major_player_id()
          )
        )
      )
    )
), complete_rooms as (
  select
    room.id as group_id,
    room.play_day_id,
    day.day_number,
    day.label as day_label,
    day.play_date,
    slot.starts_at,
    room.group_label,
    room.competition,
    count(member.entry_id)::integer as member_count,
    coalesce(jsonb_agg(
      jsonb_build_object(
        'player_id', entry.player_id,
        'player_screen_name_snapshot', entry.player_screen_name_snapshot
      )
      order by entry.player_screen_name_snapshot, entry.player_id
    ), '[]'::jsonb) as roster,
    coalesce(bool_or(entry.player_id = public.current_major_player_id()), false) as is_my_room
  from visible_event event
  join public.major_play_days day on day.major_event_id = event.id
  join public.major_schedule_groups room
    on room.major_event_id = event.id
   and room.play_day_id = day.id
   and room.is_published
  join public.major_time_slots slot
    on slot.id = room.time_slot_id
   and slot.play_day_id = day.id
  join public.major_schedule_group_members member
    on member.group_id = room.id
   and member.major_event_id = event.id
   and member.play_day_id = day.id
   and member.time_slot_id = slot.id
  join public.major_entries entry
    on entry.id = member.entry_id
   and entry.major_event_id = event.id
   and entry.status in ('registered', 'confirmed')
  where day.day_number <= 2
     or event.weekend_status_published_at is not null
  group by room.id, room.play_day_id, day.day_number, day.label,
    day.play_date, slot.starts_at, room.group_label, room.competition
  having count(member.entry_id) between 2 and 4
)
select coalesce(jsonb_agg(
  jsonb_build_object(
    'group_id', room.group_id,
    'play_day_id', room.play_day_id,
    'day_number', room.day_number,
    'day_label', room.day_label,
    'play_date', room.play_date,
    'starts_at', room.starts_at,
    'group_label', room.group_label,
    'competition', room.competition,
    'roster', room.roster,
    'is_my_room', room.is_my_room
  )
  order by room.day_number, room.starts_at, lower(room.group_label), room.group_label
), '[]'::jsonb)
from complete_rooms room
$function$;

revoke all on function public.get_public_major_published_rooms(uuid)
from public, anon, authenticated;
grant execute on function public.get_public_major_published_rooms(uuid)
to anon, authenticated;

-- One authoritative scoring-window calculation is shared by player reads,
-- draft saves, and submissions. A player's window starts at their own complete
-- published room and closes three hours after that round's final complete
-- published room begins. Rounds are independent, so their windows may overlap.
create or replace function public.major_player_round_scoring_window(
  p_player_id uuid,
  p_play_day_id uuid
)
returns table (
  entry_id uuid,
  room_group_id uuid,
  room_label text,
  room_start_at timestamptz,
  round_closes_at timestamptz
)
language sql
stable
security definer
set search_path to ''
as $function$
select
  entry.id,
  room.id,
  room.group_label,
  slot.starts_at,
  (
    select max(last_slot.starts_at) + interval '3 hours'
    from public.major_schedule_groups last_room
    join public.major_time_slots last_slot
      on last_slot.id = last_room.time_slot_id
     and last_slot.play_day_id = last_room.play_day_id
    where last_room.major_event_id = event.id
      and last_room.play_day_id = day.id
      and last_room.is_published
      and (
        select count(*)
        from public.major_schedule_group_members last_member
        join public.major_entries last_entry on last_entry.id = last_member.entry_id
        where last_member.group_id = last_room.id
          and last_entry.status in ('registered', 'confirmed')
      ) between 2 and 4
  ) as round_closes_at
from public.major_entries entry
join public.major_events event on event.id = entry.major_event_id
join public.major_play_days day
  on day.major_event_id = event.id
 and day.id = p_play_day_id
join public.major_schedule_group_members membership
  on membership.entry_id = entry.id
 and membership.major_event_id = event.id
 and membership.play_day_id = day.id
join public.major_schedule_groups room
  on room.id = membership.group_id
 and room.major_event_id = event.id
 and room.play_day_id = day.id
 and room.is_published
join public.major_time_slots slot
  on slot.id = room.time_slot_id
 and slot.play_day_id = day.id
where entry.player_id = p_player_id
  and entry.status in ('registered', 'confirmed')
  and (day.day_number <= 2 or event.weekend_status_published_at is not null)
  and (
    select count(*)
    from public.major_schedule_group_members room_member
    join public.major_entries room_entry on room_entry.id = room_member.entry_id
    where room_member.group_id = room.id
      and room_entry.status in ('registered', 'confirmed')
  ) between 2 and 4
limit 1
$function$;

revoke all on function public.major_player_round_scoring_window(uuid, uuid)
from public, anon, authenticated;

create or replace function public.get_my_major_scorecards(p_major_event_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
with me as (
  select public.current_major_player_id() as id
), entry as (
  select major_entry.*
  from public.major_entries major_entry, me
  where major_entry.major_event_id = p_major_event_id
    and major_entry.player_id = me.id
    and major_entry.status in ('registered', 'confirmed')
), rounds as (
  select
    day.id as play_day_id,
    day.day_number,
    day.label,
    day.play_date,
    entry.id as entry_id,
    entry.major_event_id,
    entry.player_id,
    entry.player_screen_name_snapshot,
    case when day.day_number <= 2 then 'CBE' else 'CBH' end as course_code,
    card.id,
    card.status,
    card.submitted_at,
    card.submitted_by,
    card.verified_at,
    card.verified_by,
    null::text as verifier_screen_name,
    card.verification_notes,
    (select sum(hole.strokes) from public.major_player_scorecard_holes hole where hole.scorecard_id = card.id) as total_strokes,
    (select sum(hole.strokes - hole.par) from public.major_player_scorecard_holes hole where hole.scorecard_id = card.id) as score_to_par,
    scoring_window.room_group_id,
    scoring_window.room_label,
    scoring_window.room_start_at as slot_starts_at,
    (select room.instructions from public.major_schedule_groups room where room.id = scoring_window.room_group_id) as room_instructions,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'player_id', room_entry.player_id,
          'player_screen_name_snapshot', room_entry.player_screen_name_snapshot
        )
        order by room_entry.player_screen_name_snapshot, room_entry.player_id
      )
      from public.major_schedule_group_members room_member
      join public.major_entries room_entry on room_entry.id = room_member.entry_id
      where room_member.group_id = scoring_window.room_group_id
    ), '[]'::jsonb) as room_roster,
    case when day.day_number <= 2 then 'qualifying'
      else coalesce((select weekend.competition_status from public.major_entry_weekend_status weekend where weekend.entry_id = entry.id), 'pending')
    end as weekend_field,
    scoring_window.room_start_at,
    scoring_window.round_closes_at,
    case when scoring_window.room_start_at is null then null
      else scoring_window.room_start_at - interval '3 hours'
    end as score_visible_at,
    case
      when scoring_window.room_start_at is null then 'hidden'
      when now() < scoring_window.room_start_at - interval '3 hours' then 'hidden'
      when now() < scoring_window.room_start_at then 'upcoming'
      when now() <= scoring_window.round_closes_at and day.scoring_finalized_at is null then 'open'
      else 'closed'
    end as score_access_state,
    coalesce(
      now() >= scoring_window.room_start_at
      and now() <= scoring_window.round_closes_at
      and day.scoring_finalized_at is null,
      false
    ) as scoring_entry_open,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'hole_number', hole.hole_number,
          'par', hole.par,
          'strokes', hole.strokes
        )
        order by hole.hole_number
      )
      from public.major_player_scorecard_holes hole
      where hole.scorecard_id = card.id
    ), '[]'::jsonb) as holes
  from entry
  join public.major_play_days day on day.major_event_id = entry.major_event_id
  left join public.major_player_scorecards card
    on card.entry_id = entry.id
   and card.play_day_id = day.id
  left join lateral public.major_player_round_scoring_window(entry.player_id, day.id) scoring_window on true
)
select coalesce(jsonb_agg(to_jsonb(rounds) order by day_number), '[]'::jsonb)
from rounds
$function$;

revoke all on function public.get_my_major_scorecards(uuid)
from public, anon, authenticated;
grant execute on function public.get_my_major_scorecards(uuid)
to authenticated;

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
  pars integer[];
  scoring_window record;
begin
  me := public.current_major_player_id();
  if me is null then
    raise exception 'Canonical player identity is required' using errcode = '42501';
  end if;

  select * into day
  from public.major_play_days
  where id = p_play_day_id;
  if not found then
    raise exception 'Major play day not found';
  end if;

  select * into entry
  from public.major_entries
  where major_event_id = day.major_event_id
    and player_id = me
    and status in ('registered', 'confirmed');
  if not found then
    raise exception 'You are not entered in this Major';
  end if;

  select * into scoring_window
  from public.major_player_round_scoring_window(me, day.id);
  if not found then
    raise exception 'A complete published room assignment is required';
  end if;
  if now() < scoring_window.room_start_at then
    raise exception 'Your room has not started yet';
  end if;
  if day.scoring_finalized_at is not null or now() > scoring_window.round_closes_at then
    raise exception 'Score entry is closed for this round';
  end if;

  if jsonb_typeof(p_holes) <> 'array' then
    raise exception 'Holes must be an array';
  end if;

  insert into public.major_player_scorecards (
    major_event_id,
    play_day_id,
    entry_id,
    player_id,
    player_screen_name_snapshot,
    course_code
  ) values (
    day.major_event_id,
    day.id,
    entry.id,
    me,
    entry.player_screen_name_snapshot,
    case when day.day_number <= 2 then 'CBE' else 'CBH' end
  )
  on conflict (entry_id, play_day_id) do update
    set updated_at = now()
    where public.major_player_scorecards.status in ('draft', 'reopened')
  returning id into card;

  if card is null then
    raise exception 'Submitted or verified scorecards cannot be silently changed';
  end if;

  pars := case when day.day_number <= 2
    then array[3,4,3,4,3,3,3,4,3,5,3,4,2,3,3,3,3,7]
    else array[3,4,3,4,3,3,3,4,3,5,3,4,2,3,3,3,3,8]
  end;

  delete from public.major_player_scorecard_holes
  where scorecard_id = card;

  for item in select value from jsonb_array_elements(p_holes) loop
    if (item->>'hole_number')::integer not between 1 and 18
       or (item->>'strokes')::integer not between 1 and 99 then
      raise exception 'Invalid hole score';
    end if;
    insert into public.major_player_scorecard_holes (
      scorecard_id,
      hole_number,
      par,
      strokes
    ) values (
      card,
      (item->>'hole_number')::integer,
      pars[(item->>'hole_number')::integer],
      (item->>'strokes')::integer
    );
  end loop;

  return card;
end
$function$;

revoke all on function public.save_my_major_scorecard(uuid, jsonb)
from public, anon, authenticated;
grant execute on function public.save_my_major_scorecard(uuid, jsonb)
to authenticated;

create or replace function public.submit_my_major_scorecard(p_scorecard_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  me uuid := public.current_major_player_id();
  old_status text;
  score_snapshot jsonb;
  card public.major_player_scorecards;
  day public.major_play_days;
  scoring_window record;
begin
  select * into card
  from public.major_player_scorecards
  where id = p_scorecard_id
    and player_id = me
  for update;

  if not found or card.status not in ('draft', 'reopened') then
    raise exception 'This scorecard cannot be submitted';
  end if;
  old_status := card.status;

  select * into day
  from public.major_play_days
  where id = card.play_day_id;

  select * into scoring_window
  from public.major_player_round_scoring_window(me, card.play_day_id);
  if not found then
    raise exception 'A complete published room assignment is required';
  end if;
  if now() < scoring_window.room_start_at then
    raise exception 'Your room has not started yet';
  end if;
  if day.scoring_finalized_at is not null or now() > scoring_window.round_closes_at then
    raise exception 'Score entry is closed for this round';
  end if;

  if (
    select count(*)
    from public.major_player_scorecard_holes
    where scorecard_id = p_scorecard_id
  ) <> 18 then
    raise exception 'Enter all 18 holes before submitting';
  end if;

  select jsonb_agg(to_jsonb(hole) order by hole.hole_number)
  into score_snapshot
  from public.major_player_scorecard_holes hole
  where hole.scorecard_id = p_scorecard_id;

  update public.major_player_scorecards
  set status = 'submitted',
      submitted_at = now(),
      submitted_by = me,
      updated_at = now()
  where id = p_scorecard_id;

  insert into public.major_scorecard_audit_log (
    scorecard_id,
    action,
    actor_player_id,
    previous_status,
    next_status,
    score_snapshot
  ) values (
    p_scorecard_id,
    'submitted',
    me,
    old_status,
    'submitted',
    score_snapshot
  );
end
$function$;

revoke all on function public.submit_my_major_scorecard(uuid)
from public, anon, authenticated;
grant execute on function public.submit_my_major_scorecard(uuid)
to authenticated;

commit;

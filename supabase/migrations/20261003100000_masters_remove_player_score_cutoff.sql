begin;

-- Player score entry stays open after the room starts until the round is
-- explicitly finalized. The historical round_closes_at value remains
-- available to the Masters admin late-score tools, but it is not a player
-- deadline and does not close unsubmitted scorecards.

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
    public.major_active_score_reopen_until(entry.id, day.id) as admin_reopened_until,
    case when scoring_window.room_start_at is null then null
      else scoring_window.room_start_at - interval '3 hours'
    end as score_visible_at,
    case
      when scoring_window.room_start_at is null then 'hidden'
      when now() < scoring_window.room_start_at - interval '3 hours' then 'hidden'
      when now() < scoring_window.room_start_at then 'upcoming'
      when day.scoring_finalized_at is null then 'open'
      else 'closed'
    end as score_access_state,
    coalesce(
      now() >= scoring_window.room_start_at
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

  pars := case when day.day_number <= 2
    then array[3,4,3,4,3,3,3,4,3,5,3,4,2,3,3,3,3,7]
    else array[3,4,3,4,3,3,3,4,3,5,3,4,2,3,3,3,3,8]
  end;

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
  where id = p_scorecard_id and player_id = me
  for update;

  if not found or card.status not in ('draft', 'reopened') then
    raise exception 'This scorecard cannot be submitted';
  end if;
  old_status := card.status;

  select * into day from public.major_play_days where id = card.play_day_id;
  select * into scoring_window from public.major_player_round_scoring_window(me, card.play_day_id);
  if not found then raise exception 'A complete published room assignment is required'; end if;
  if now() < scoring_window.room_start_at then raise exception 'Your room has not started yet'; end if;

  if day.scoring_finalized_at is not null then
    raise exception 'Score entry is closed for this round';
  end if;

  if (select count(*) from public.major_player_scorecard_holes where scorecard_id = p_scorecard_id) <> 18 then
    raise exception 'Enter all 18 holes before submitting';
  end if;

  select jsonb_agg(to_jsonb(hole) order by hole.hole_number)
  into score_snapshot
  from public.major_player_scorecard_holes hole
  where hole.scorecard_id = p_scorecard_id;

  update public.major_player_scorecards
  set status = 'submitted', submitted_at = now(), submitted_by = me, updated_at = now()
  where id = p_scorecard_id;

  insert into public.major_scorecard_audit_log (
    scorecard_id, action, actor_player_id, previous_status, next_status, score_snapshot
  ) values (p_scorecard_id, 'submitted', me, old_status, 'submitted', score_snapshot);
end
$function$;

revoke all on function public.submit_my_major_scorecard(uuid)
from public, anon, authenticated;
grant execute on function public.submit_my_major_scorecard(uuid)
to authenticated;

commit;

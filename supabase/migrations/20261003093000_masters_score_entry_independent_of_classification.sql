-- A published physical Masters room is the authority for player score-entry
-- eligibility. Weekend competition classification describes what the player is
-- competing for, but it must not decide whether a legitimate Round 3 or Final
-- Round player can score.

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

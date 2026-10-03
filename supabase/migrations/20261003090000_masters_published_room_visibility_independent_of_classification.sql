-- Published Masters physical rooms are visible by room publication state.
-- Weekend competition classification remains player-specific metadata and does
-- not gate public room discovery or the player's published-room popup.

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

create or replace function public.get_my_major_signup_schedule(p_major_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  provider_id text;
  matched_player_id uuid;
  matched_count integer;
begin
  if auth.uid() is null
     or (
       coalesce(auth.jwt()->'app_metadata'->>'provider', '') <> 'discord'
       and not (coalesce(auth.jwt()->'app_metadata'->'providers', '[]'::jsonb) ? 'discord')
     ) then
    return '[]'::jsonb;
  end if;

  provider_id := coalesce(
    nullif(btrim(auth.jwt()->'user_metadata'->>'provider_id'), ''),
    nullif(btrim(auth.jwt()->'user_metadata'->>'sub'), '')
  );
  if provider_id is null then
    return '[]'::jsonb;
  end if;

  select count(*) into matched_count
  from public.players player
  where player.discord_id = provider_id;

  if matched_count <> 1 then
    return '[]'::jsonb;
  end if;

  select player.id into strict matched_player_id
  from public.players player
  where player.discord_id = provider_id;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', choice.id,
        'entry_id', choice.entry_id,
        'play_day_id', choice.play_day_id,
        'time_slot_id', choice.time_slot_id,
        'assignment_location', coalesce(room.location, choice.assignment_location),
        'starts_at', slot.starts_at,
        'slot_label', slot.label,
        'selection_locks_at', day.selection_locks_at,
        'is_locked', day.choices_locked
          or (day.selection_locks_at is not null and now() >= day.selection_locks_at),
        'weekend_competition_status', case
          when event.weekend_status_published_at is null then 'pending'
          else coalesce(weekend.competition_status, 'pending')
        end,
        'group_label', room.group_label,
        'group_competition', room.competition,
        'group_instructions', room.instructions,
        'room_roster', case
          when room.id is not null then coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'player_id', room_entry.player_id,
                'player_screen_name_snapshot', room_entry.player_screen_name_snapshot
              )
              order by room_entry.player_screen_name_snapshot, room_entry.player_id
            )
            from public.major_schedule_group_members room_member
            join public.major_entries room_entry on room_entry.id = room_member.entry_id
            where room_member.group_id = room.id
              and room_member.major_event_id = event.id
          ), '[]'::jsonb)
          else '[]'::jsonb
        end
      )
      order by day.day_number
    )
    from public.major_entries entry
    join public.major_events event on event.id = entry.major_event_id
    join public.major_entry_day_choices choice on choice.entry_id = entry.id
    join public.major_play_days day on day.id = choice.play_day_id
    join public.major_time_slots slot on slot.id = choice.time_slot_id
    left join public.major_entry_weekend_status weekend on weekend.entry_id = entry.id
    left join public.major_schedule_group_members membership
      on membership.entry_id = entry.id
     and membership.play_day_id = day.id
    left join public.major_schedule_groups room
      on room.id = membership.group_id
     and room.major_event_id = event.id
     and room.is_published
    where entry.major_event_id = p_major_event_id
      and entry.player_id = matched_player_id
      and entry.status in ('registered', 'confirmed')
  ), '[]'::jsonb);
end
$function$;

revoke all on function public.get_public_major_published_rooms(uuid)
from public, anon, authenticated;
grant execute on function public.get_public_major_published_rooms(uuid)
to anon, authenticated;

revoke all on function public.get_my_major_signup_schedule(uuid)
from public, anon, authenticated;
grant execute on function public.get_my_major_signup_schedule(uuid)
to authenticated;

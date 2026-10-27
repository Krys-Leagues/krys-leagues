begin;

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

  select count(*)
  into matched_count
  from public.players p
  where p.discord_id = provider_id;

  if matched_count <> 1 then
    return '[]'::jsonb;
  end if;

  select p.id
  into strict matched_player_id
  from public.players p
  where p.discord_id = provider_id;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'entry_id', c.entry_id,
        'play_day_id', c.play_day_id,
        'time_slot_id', c.time_slot_id,
        'assignment_location', case
          when d.day_number <= 2 or ev.weekend_status_published_at is not null
            then coalesce(g.location, c.assignment_location)
          else null
        end,
        'starts_at', s.starts_at,
        'slot_label', s.label,
        'selection_locks_at', d.selection_locks_at,
        'is_locked', d.choices_locked
          or (d.selection_locks_at is not null and now() >= d.selection_locks_at),
        'weekend_competition_status', case
          when ev.weekend_status_published_at is null then 'pending'
          else coalesce(ws.competition_status, 'pending')
        end,
        'group_label', case
          when d.day_number <= 2 or ev.weekend_status_published_at is not null then g.group_label
          else null
        end,
        'group_competition', case
          when d.day_number <= 2 or ev.weekend_status_published_at is not null then g.competition
          else null
        end,
        'group_instructions', case
          when d.day_number <= 2 or ev.weekend_status_published_at is not null then g.instructions
          else null
        end,
        'room_roster', case
          when g.id is not null
           and (d.day_number <= 2 or ev.weekend_status_published_at is not null)
          then coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'player_id', room_entry.player_id,
                'player_screen_name_snapshot', room_entry.player_screen_name_snapshot
              )
              order by room_entry.player_screen_name_snapshot, room_entry.player_id
            )
            from public.major_schedule_group_members room_member
            join public.major_entries room_entry on room_entry.id = room_member.entry_id
            where room_member.group_id = g.id
              and room_member.major_event_id = ev.id
          ), '[]'::jsonb)
          else '[]'::jsonb
        end
      )
      order by d.day_number
    )
    from public.major_entries e
    join public.major_events ev on ev.id = e.major_event_id
    join public.major_entry_day_choices c on c.entry_id = e.id
    join public.major_play_days d on d.id = c.play_day_id
    join public.major_time_slots s on s.id = c.time_slot_id
    left join public.major_entry_weekend_status ws on ws.entry_id = e.id
    left join public.major_schedule_group_members gm
      on gm.entry_id = e.id
     and gm.play_day_id = d.id
    left join public.major_schedule_groups g
      on g.id = gm.group_id
     and g.major_event_id = ev.id
     and g.is_published
    where e.major_event_id = p_major_event_id
      and e.player_id = matched_player_id
  ), '[]'::jsonb);
end
$function$;

revoke all on function public.get_my_major_signup_schedule(uuid)
from public, anon, authenticated;

grant execute on function public.get_my_major_signup_schedule(uuid)
to authenticated;

commit;

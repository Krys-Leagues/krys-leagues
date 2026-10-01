begin;

create table if not exists public.major_admin_help_requests (
  id uuid primary key default gen_random_uuid(),
  major_event_id uuid not null references public.major_events(id) on delete restrict,
  play_day_id uuid not null references public.major_play_days(id) on delete restrict,
  entry_id uuid not null references public.major_entries(id) on delete restrict,
  player_id uuid not null references public.players(id) on delete restrict,
  player_screen_name_snapshot text not null,
  schedule_group_id uuid not null references public.major_schedule_groups(id) on delete restrict,
  room_label_snapshot text not null,
  round_number integer not null check (round_number between 1 and 4),
  scheduled_start_at timestamptz not null,
  local_display_time text,
  category text not null check (category in (
    'PLAYER NO-SHOW',
    'CAN''T FIND MY ROOM',
    'SCORECARD PHOTO PROBLEM',
    'SCORE ENTRY PROBLEM',
    'WRONG ROOM OR TIME',
    'WEBSITE / TECHNICAL PROBLEM',
    'OTHER'
  )),
  message text not null check (length(btrim(message)) between 2 and 800),
  submitted_at timestamptz not null default now(),
  delivery_status text not null default 'pending' check (delivery_status in ('pending', 'sent', 'failed')),
  delivery_attempted_at timestamptz,
  discord_message_id text,
  delivery_error text,
  context_snapshot jsonb not null default '{}'::jsonb
);

create index if not exists major_admin_help_requests_player_rate_idx
  on public.major_admin_help_requests(player_id, submitted_at desc);
create index if not exists major_admin_help_requests_event_pending_idx
  on public.major_admin_help_requests(major_event_id, delivery_status, submitted_at desc);

alter table public.major_admin_help_requests enable row level security;
alter table public.major_admin_help_requests force row level security;
revoke all on table public.major_admin_help_requests from public, anon, authenticated;
grant select, insert, update on table public.major_admin_help_requests to service_role;

create or replace function public.create_my_masters_admin_help_request(
  p_major_event_id uuid,
  p_play_day_id uuid,
  p_category text,
  p_message text,
  p_local_display_time text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  me uuid := public.current_major_player_id();
  assignment record;
  other_room jsonb;
  request_id uuid;
  submitted_at timestamptz := now();
begin
  if me is null then
    raise exception 'Canonical player identity is required.' using errcode = '42501';
  end if;
  if p_category not in (
    'PLAYER NO-SHOW', 'CAN''T FIND MY ROOM', 'SCORECARD PHOTO PROBLEM',
    'SCORE ENTRY PROBLEM', 'WRONG ROOM OR TIME', 'WEBSITE / TECHNICAL PROBLEM', 'OTHER'
  ) or length(btrim(coalesce(p_message, ''))) not between 2 and 800 then
    raise exception 'Complete the Masters help form before sending.' using errcode = '22023';
  end if;

  select
    event.name as event_name,
    entry.id as entry_id,
    entry.player_screen_name_snapshot,
    day.day_number,
    room.id as room_id,
    room.group_label,
    slot.starts_at
  into assignment
  from public.major_entries entry
  join public.major_events event on event.id = entry.major_event_id
  join public.major_play_days day on day.major_event_id = event.id and day.id = p_play_day_id
  join public.major_entry_day_choices choice on choice.entry_id = entry.id and choice.play_day_id = day.id
  join public.major_time_slots slot on slot.id = choice.time_slot_id and slot.play_day_id = day.id
  join public.major_schedule_group_members member on member.entry_id = entry.id and member.play_day_id = day.id and member.time_slot_id = slot.id
  join public.major_schedule_groups room on room.id = member.group_id and room.is_published
  where event.id = p_major_event_id
    and event.slug = 'masters'
    and entry.player_id = me
    and entry.status in ('registered', 'confirmed')
    and (select count(*) from public.major_schedule_group_members counted where counted.group_id = room.id) between 2 and 4
  limit 1;

  if not found then
    raise exception 'A complete published Masters room assignment is required.' using errcode = '42501';
  end if;

  if (
    select count(*)
    from public.major_admin_help_requests recent
    where recent.player_id = me
      and recent.submitted_at > submitted_at - interval '10 minutes'
  ) >= 3 then
    raise exception 'Please wait before sending another Masters admin alert.' using errcode = '42900';
  end if;
  if exists (
    select 1
    from public.major_admin_help_requests recent
    where recent.player_id = me
      and recent.play_day_id = p_play_day_id
      and recent.category = p_category
      and recent.message = btrim(p_message)
      and recent.submitted_at > submitted_at - interval '2 minutes'
  ) then
    raise exception 'This Masters admin alert was already sent recently.' using errcode = '23505';
  end if;

  select jsonb_build_object(
    'room_label', alternate.group_label,
    'players', coalesce((
      select jsonb_agg(other_entry.player_screen_name_snapshot order by other_entry.player_screen_name_snapshot)
      from public.major_schedule_group_members other_member
      join public.major_entries other_entry on other_entry.id = other_member.entry_id
      where other_member.group_id = alternate.id
    ), '[]'::jsonb)
  )
  into other_room
  from public.major_schedule_groups alternate
  join public.major_time_slots alternate_slot on alternate_slot.id = alternate.time_slot_id
  where alternate.major_event_id = p_major_event_id
    and alternate.play_day_id = p_play_day_id
    and alternate.id <> assignment.room_id
    and alternate.is_published
    and alternate_slot.starts_at = assignment.starts_at
    and (select count(*) from public.major_schedule_group_members counted where counted.group_id = alternate.id) between 2 and 4
  order by alternate.group_label
  limit 1;

  insert into public.major_admin_help_requests (
    major_event_id, play_day_id, entry_id, player_id, player_screen_name_snapshot,
    schedule_group_id, room_label_snapshot, round_number, scheduled_start_at,
    local_display_time, category, message, submitted_at, context_snapshot
  ) values (
    p_major_event_id, p_play_day_id, assignment.entry_id, me, assignment.player_screen_name_snapshot,
    assignment.room_id, assignment.group_label, assignment.day_number, assignment.starts_at,
    nullif(left(btrim(coalesce(p_local_display_time, '')), 200), ''), p_category, btrim(p_message), submitted_at,
    jsonb_build_object('other_room', other_room)
  )
  returning id into request_id;

  return jsonb_build_object(
    'request_id', request_id,
    'player_id', me,
    'player_screen_name', assignment.player_screen_name_snapshot,
    'event_name', assignment.event_name,
    'round_number', assignment.day_number,
    'room_label', assignment.group_label,
    'scheduled_start', assignment.starts_at,
    'local_display_time', nullif(left(btrim(coalesce(p_local_display_time, '')), 200), ''),
    'category', p_category,
    'message', btrim(p_message),
    'submitted_at', submitted_at,
    'other_room', other_room
  );
end
$function$;

revoke all on function public.create_my_masters_admin_help_request(uuid, uuid, text, text, text)
from public, anon, authenticated;
grant execute on function public.create_my_masters_admin_help_request(uuid, uuid, text, text, text)
to authenticated;

commit;

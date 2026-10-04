begin;

alter table public.major_entry_participation_audit
  drop constraint if exists major_entry_participation_audit_action_check;

alter table public.major_entry_participation_audit
  add constraint major_entry_participation_audit_action_check
  check (action in ('admin_add', 'withdraw', 'reactivate', 'emergency_room_assignment'));

create or replace function public.admin_assign_major_player_to_existing_final_room(
  p_major_event_id uuid,
  p_entry_id uuid,
  p_target_group_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  actor_user uuid;
  actor_player uuid;
  actor_name text;
  event_row public.major_events%rowtype;
  entry_row public.major_entries%rowtype;
  target_room public.major_schedule_groups%rowtype;
  target_day public.major_play_days%rowtype;
  target_slot public.major_time_slots%rowtype;
  source_member public.major_schedule_group_members%rowtype;
  source_count integer;
  target_count integer;
  has_target boolean;
  normalized_reason text;
begin
  actor_user := auth.uid();
  if actor_user is null or not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required.' using errcode = '42501';
  end if;

  normalized_reason := nullif(btrim(coalesce(p_reason, '')), '');
  if normalized_reason is null then
    raise exception 'A durable emergency-assignment reason is required.' using errcode = '22023';
  end if;

  select * into event_row
  from public.major_events
  where id = p_major_event_id
    and slug = 'masters'
  for update;
  if not found then raise exception 'Masters event not found.'; end if;

  select * into entry_row
  from public.major_entries
  where id = p_entry_id
    and major_event_id = event_row.id
    and status in ('registered', 'confirmed')
  for update;
  if not found then raise exception 'An active Masters entry is required.'; end if;

  select * into target_room
  from public.major_schedule_groups
  where id = p_target_group_id
    and major_event_id = event_row.id
  for update;
  if not found then raise exception 'Target Masters room not found.'; end if;
  if not target_room.is_published or not target_room.is_finalized then
    raise exception 'The target Final Round room must already be published and finalized.' using errcode = '22023';
  end if;

  select * into target_day from public.major_play_days
  where id = target_room.play_day_id and major_event_id = event_row.id
  for update;
  if not found or target_day.day_number <> 4 then
    raise exception 'The target room must belong to the Masters Final Round.' using errcode = '22023';
  end if;

  select * into target_slot from public.major_time_slots
  where id = target_room.time_slot_id and play_day_id = target_day.id
  for update;
  if not found then raise exception 'The target room time is invalid.'; end if;

  if not exists (
    select 1 from public.major_entry_day_choices choice
    where choice.entry_id = entry_row.id
      and choice.play_day_id = target_day.id
      and choice.time_slot_id = target_slot.id
  ) then
    raise exception 'The player has not selected the target Final Round time.' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.major_player_scorecards card
    where card.major_event_id = event_row.id
      and card.entry_id = entry_row.id
      and card.play_day_id = target_day.id
  ) or exists (
    select 1 from public.major_score_entry_admin_actions action
    where action.major_event_id = event_row.id
      and action.entry_id = entry_row.id
      and action.play_day_id = target_day.id
  ) then
    raise exception 'This player has Final Round score activity; room membership is protected.' using errcode = '22023';
  end if;

  select exists (
    select 1 from public.major_schedule_group_members member
    where member.group_id = target_room.id and member.entry_id = entry_row.id
  ) into has_target;
  if has_target then
    return jsonb_build_object('status', 'already_assigned', 'entry_id', entry_row.id, 'target_group_id', target_room.id);
  end if;

  select count(*)::integer into target_count
  from public.major_schedule_group_members member
  where member.group_id = target_room.id;
  if target_count >= 4 then
    raise exception 'The target Final Round room is full.' using errcode = '22023';
  end if;

  select count(*)::integer into source_count
  from public.major_schedule_group_members member
  join public.major_schedule_groups room on room.id = member.group_id
  where member.entry_id = entry_row.id
    and member.play_day_id = target_day.id;
  if source_count > 1 then
    raise exception 'The player has multiple Final Round room memberships; resolve the data first.' using errcode = '23514';
  end if;

  if source_count = 1 then
    select member.* into source_member
    from public.major_schedule_group_members member
    where member.entry_id = entry_row.id and member.play_day_id = target_day.id
    for update;
    if source_member.time_slot_id <> target_slot.id then
      raise exception 'The existing Final Round room is at a different selected time.' using errcode = '22023';
    end if;
    delete from public.major_schedule_group_members where group_id = source_member.group_id and entry_id = entry_row.id;
  end if;

  insert into public.major_schedule_group_members (
    group_id, major_event_id, play_day_id, time_slot_id, entry_id
  ) values (
    target_room.id, event_row.id, target_day.id, target_slot.id, entry_row.id
  );

  actor_player := public.current_major_player_id();
  select player.screen_name into actor_name from public.players player where player.id = actor_player;
  actor_name := coalesce(nullif(btrim(actor_name), ''), actor_user::text);

  insert into public.major_entry_participation_audit (
    major_event_id, entry_id, player_id, action, previous_status, next_status,
    reason, actor_user_id, actor_player_id, actor_screen_name_snapshot, room_changes
  ) values (
    event_row.id, entry_row.id, entry_row.player_id, 'emergency_room_assignment',
    entry_row.status, entry_row.status, normalized_reason, actor_user, actor_player,
    actor_name, jsonb_build_object(
      'prior_group_id', case when source_count = 1 then source_member.group_id else null end,
      'destination_group_id', target_room.id,
      'destination_group_label', target_room.group_label,
      'destination_play_day_id', target_day.id,
      'destination_time_slot_id', target_slot.id,
      'destination_starts_at', target_slot.starts_at,
      'source_membership_removed', source_count = 1
    )
  );

  return jsonb_build_object(
    'status', 'assigned', 'entry_id', entry_row.id, 'target_group_id', target_room.id,
    'target_group_label', target_room.group_label, 'source_group_id',
    case when source_count = 1 then source_member.group_id else null end
  );
end
$function$;

revoke all on function public.admin_assign_major_player_to_existing_final_room(uuid, uuid, uuid, text)
from public, anon, authenticated;
grant execute on function public.admin_assign_major_player_to_existing_final_room(uuid, uuid, uuid, text)
to authenticated;

commit;

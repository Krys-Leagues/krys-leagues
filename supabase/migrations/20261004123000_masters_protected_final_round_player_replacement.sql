begin;

alter table public.major_entry_participation_audit
  drop constraint if exists major_entry_participation_audit_action_check;

alter table public.major_entry_participation_audit
  add constraint major_entry_participation_audit_action_check
  check (action in ('admin_add', 'withdraw', 'reactivate', 'emergency_room_assignment', 'protected_player_replacement'));

create or replace function public.admin_replace_major_final_round_player(
  p_major_event_id uuid,
  p_target_group_id uuid,
  p_remove_entry_id uuid,
  p_add_entry_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  actor_user uuid := auth.uid();
  actor_player uuid;
  actor_name text;
  operation_id uuid := gen_random_uuid();
  normalized_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  event_row public.major_events%rowtype;
  room_row public.major_schedule_groups%rowtype;
  day_row public.major_play_days%rowtype;
  slot_row public.major_time_slots%rowtype;
  remove_entry public.major_entries%rowtype;
  add_entry public.major_entries%rowtype;
  remove_member public.major_schedule_group_members%rowtype;
  add_membership_count integer;
  room_member_count integer;
  remove_present boolean;
  add_in_target boolean;
begin
  if actor_user is null or not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required.' using errcode = '42501';
  end if;
  if normalized_reason is null then
    raise exception 'A durable protected-replacement reason is required.' using errcode = '22023';
  end if;
  if p_remove_entry_id = p_add_entry_id then
    raise exception 'Replacement players must be different.' using errcode = '22023';
  end if;

  select * into event_row
  from public.major_events
  where id = p_major_event_id and slug = 'masters'
  for update;
  if not found then raise exception 'Masters event not found.'; end if;

  select * into room_row
  from public.major_schedule_groups
  where id = p_target_group_id and major_event_id = event_row.id
  for update;
  if not found then raise exception 'Target Masters room not found.'; end if;
  if not room_row.is_published or not room_row.is_finalized then
    raise exception 'The protected replacement requires a published and finalized room.' using errcode = '22023';
  end if;

  select * into day_row
  from public.major_play_days
  where id = room_row.play_day_id and major_event_id = event_row.id
  for update;
  if not found or day_row.day_number <> 4 then
    raise exception 'The target room must be the Masters Final Round.' using errcode = '22023';
  end if;

  select * into slot_row
  from public.major_time_slots
  where id = room_row.time_slot_id and play_day_id = day_row.id
  for update;
  if not found then raise exception 'The target room time is invalid.'; end if;

  select * into remove_entry
  from public.major_entries
  where id = p_remove_entry_id and major_event_id = event_row.id and status in ('registered', 'confirmed')
  for update;
  if not found then raise exception 'The removed player must have an active Masters entry.'; end if;

  select * into add_entry
  from public.major_entries
  where id = p_add_entry_id and major_event_id = event_row.id and status in ('registered', 'confirmed')
  for update;
  if not found then raise exception 'The added player must have an active Masters entry.'; end if;

  select exists (
    select 1 from public.major_schedule_group_members member
    where member.group_id = room_row.id and member.entry_id = remove_entry.id
      and member.play_day_id = day_row.id and member.time_slot_id = slot_row.id
  ) into remove_present;
  select exists (
    select 1 from public.major_schedule_group_members member
    where member.group_id = room_row.id and member.entry_id = add_entry.id
      and member.play_day_id = day_row.id and member.time_slot_id = slot_row.id
  ) into add_in_target;
  if not remove_present and add_in_target then
    return jsonb_build_object('status', 'already_replaced', 'group_id', room_row.id, 'group_label', room_row.group_label, 'added_entry_id', add_entry.id);
  end if;
  if not remove_present then
    raise exception 'The removed player is not currently assigned to this Final Round room.' using errcode = '22023';
  end if;
  select member.* into remove_member
  from public.major_schedule_group_members member
  where member.group_id = room_row.id and member.entry_id = remove_entry.id
    and member.play_day_id = day_row.id and member.time_slot_id = slot_row.id
  for update;

  select count(*)::integer into add_membership_count
  from public.major_schedule_group_members member
  where member.entry_id = add_entry.id and member.play_day_id = day_row.id;
  if add_membership_count > 0 then
    raise exception 'The added player is already assigned to a Final Round room.' using errcode = '23514';
  end if;

  if not exists (
    select 1 from public.major_entry_day_choices choice
    where choice.entry_id = add_entry.id and choice.play_day_id = day_row.id and choice.time_slot_id = slot_row.id
  ) then
    raise exception 'The added player has not selected this Final Round time.' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.major_player_scorecards card
    where card.major_event_id = event_row.id and card.entry_id in (remove_entry.id, add_entry.id) and card.play_day_id = day_row.id
  ) or exists (
    select 1 from public.major_score_entry_admin_actions action
    where action.major_event_id = event_row.id and action.entry_id in (remove_entry.id, add_entry.id) and action.play_day_id = day_row.id
  ) then
    raise exception 'A replacement player has Final Round score activity; no membership was changed.' using errcode = '22023';
  end if;

  select count(*)::integer into room_member_count
  from public.major_schedule_group_members member
  where member.group_id = room_row.id;
  if room_member_count < 1 or room_member_count > 4 then
    raise exception 'The protected room has an invalid roster size.' using errcode = '23514';
  end if;

  delete from public.major_schedule_group_members
  where group_id = room_row.id and entry_id = remove_entry.id;

  insert into public.major_schedule_group_members (
    group_id, major_event_id, play_day_id, time_slot_id, entry_id
  ) values (
    room_row.id, event_row.id, day_row.id, slot_row.id, add_entry.id
  );

  actor_player := public.current_major_player_id();
  select player.screen_name into actor_name from public.players player where player.id = actor_player;
  actor_name := coalesce(nullif(btrim(actor_name), ''), actor_user::text);

  insert into public.major_entry_participation_audit (
    major_event_id, entry_id, player_id, action, previous_status, next_status,
    reason, actor_user_id, actor_player_id, actor_screen_name_snapshot, room_changes
  ) values (
    event_row.id, remove_entry.id, remove_entry.player_id, 'protected_player_replacement',
    remove_entry.status, remove_entry.status, normalized_reason, actor_user, actor_player, actor_name,
    jsonb_build_object('operation_id', operation_id, 'room_id', room_row.id, 'action', 'removed', 'destination_entry_id', add_entry.id, 'room_label', room_row.group_label)
  ), (
    event_row.id, add_entry.id, add_entry.player_id, 'protected_player_replacement',
    add_entry.status, add_entry.status, normalized_reason, actor_user, actor_player, actor_name,
    jsonb_build_object('operation_id', operation_id, 'room_id', room_row.id, 'action', 'added', 'source_entry_id', remove_entry.id, 'room_label', room_row.group_label)
  );

  return jsonb_build_object(
    'status', 'replaced', 'operation_id', operation_id, 'group_id', room_row.id,
    'group_label', room_row.group_label, 'removed_entry_id', remove_entry.id, 'added_entry_id', add_entry.id
  );
end
$function$;

revoke all on function public.admin_replace_major_final_round_player(uuid, uuid, uuid, uuid, text)
from public, anon, authenticated;
grant execute on function public.admin_replace_major_final_round_player(uuid, uuid, uuid, uuid, text)
to authenticated;

commit;

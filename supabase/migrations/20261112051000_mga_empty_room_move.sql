-- MGA Admin-only relocation of existing empty draft rooms.
-- This preserves room identity/number/name/capacity and does not touch registrations,
-- assignments, publication rows, completed scoring, or the event-wide counter.

do $preflight$
begin
  if to_regprocedure('mga_api.move_empty_room_to_time_slot(uuid,uuid,uuid)') is not null
     or to_regprocedure('public.mga_regular_room_move_empty_v1(uuid,uuid,uuid)') is not null then
    raise exception 'MGA empty-room move migration stopped: RPC already exists; inspect before applying';
  end if;
  if to_regprocedure('mga_api.assert_owner()') is null
     or to_regprocedure('mga_api.assert_regular_event(uuid)') is null
     or to_regprocedure('mga_api.assert_room_day_unpublished(uuid,text)') is null
     or to_regclass('mga_regular.rooms') is null
     or to_regclass('mga_regular.time_slots') is null
     or to_regclass('mga_regular.room_assignments') is null
     or to_regclass('mga_regular.room_publication_rooms') is null
     or to_regclass('mga_regular.room_publications') is null
     or to_regclass('mga_regular.room_audit_log') is null then
    raise exception 'MGA empty-room move migration stopped: required MGA room dependencies are missing';
  end if;
  if not exists (
    select 1 from pg_constraint c
    where c.conrelid='mga_regular.rooms'::regclass and c.contype='f'
      and pg_get_constraintdef(c.oid)='FOREIGN KEY (event_id, day_key, time_slot_id) REFERENCES mga_regular.time_slots(event_id, day_key, id)'
  ) then
    raise exception 'MGA empty-room move migration stopped: expected event/day/slot-scoped room foreign key is missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema='mga_regular' and table_name='room_audit_log'
      and column_name in ('event_id','actor_user_id','action','room_id','before_state','after_state','created_at')
    group by table_schema,table_name having count(*)=7
  ) then
    raise exception 'MGA empty-room move migration stopped: room audit schema differs from the reviewed contract';
  end if;
end;
$preflight$;

-- Extend the existing constrained audit vocabulary with an explicit room move.
-- Existing audit rows remain valid; no records are rewritten or removed.
do $audit_preflight$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='mga_regular.room_audit_log'::regclass
      and conname='room_audit_log_action_check'
      and contype='c'
  ) then
    raise exception 'MGA empty-room move migration stopped: expected room audit action constraint is missing';
  end if;
  if exists (
    select 1 from mga_regular.room_audit_log
    where action not in ('room_created','room_deleted','room_renamed','room_saved',
      'capacity_changed','player_assigned','player_unassigned','player_time_slot_moved',
      'room_published','room_unpublished','day_published','day_unpublished')
  ) then
    raise exception 'MGA empty-room move migration stopped: existing audit actions differ from the reviewed constraint';
  end if;
end;
$audit_preflight$;

alter table mga_regular.room_audit_log
  drop constraint room_audit_log_action_check;
alter table mga_regular.room_audit_log
  add constraint room_audit_log_action_check check (
    action = any (array[
      'room_created','room_deleted','room_renamed','room_saved',
      'capacity_changed','player_assigned','player_unassigned','player_time_slot_moved',
      'room_published','room_unpublished','day_published','day_unpublished',
      'room_time_slot_moved'
    ]::text[])
  );

create function mga_api.move_empty_room_to_time_slot(
  p_event_id uuid,
  p_room_id uuid,
  p_destination_time_slot_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_room mga_regular.rooms%rowtype;
  v_day_key text;
  v_before jsonb;
  v_after jsonb;
begin
  perform mga_api.assert_owner();
  perform mga_api.assert_regular_event(p_event_id);

  select r.day_key into v_day_key
  from mga_regular.rooms r
  where r.id=p_room_id and r.event_id=p_event_id;
  if not found then
    raise exception 'Room not found';
  end if;

  -- Serializes this operation with room saves/publication for the same day.
  perform mga_api.assert_room_day_unpublished(p_event_id,v_day_key);

  select * into v_room
  from mga_regular.rooms r
  where r.id=p_room_id and r.event_id=p_event_id
  for update;
  if not found or v_room.day_key is distinct from v_day_key then
    raise exception 'Room changed while the move was being prepared; refresh and retry';
  end if;

  if exists (
    select 1 from mga_regular.room_publication_rooms p
    where p.event_id=p_event_id and p.room_id=p_room_id and p.day_key=v_day_key
  ) then
    raise exception 'A published room cannot be moved';
  end if;
  if exists (
    select 1 from mga_regular.room_assignments a
    where a.event_id=p_event_id and a.room_id=p_room_id and a.day_key=v_day_key
  ) then
    raise exception 'Only empty rooms with no player assignments can be moved';
  end if;
  if not exists (
    select 1 from mga_regular.time_slots ts
    where ts.id=p_destination_time_slot_id
      and ts.event_id=p_event_id
      and ts.day_key=v_day_key
      and ts.is_available
  ) then
    raise exception 'Choose an available time slot on the same tournament day';
  end if;
  if p_destination_time_slot_id=v_room.time_slot_id then
    raise exception 'Choose a different time slot';
  end if;

  v_before := jsonb_build_object(
    'id',v_room.id,
    'day_key',v_room.day_key,
    'time_slot_id',v_room.time_slot_id,
    'room_number',v_room.room_number,
    'room_name',v_room.room_name,
    'capacity',v_room.capacity
  );
  update mga_regular.rooms
  set time_slot_id=p_destination_time_slot_id
  where id=p_room_id and event_id=p_event_id;

  v_after := v_before || jsonb_build_object(
    'time_slot_id',p_destination_time_slot_id
  );
  insert into mga_regular.room_audit_log(
    event_id,actor_user_id,action,room_id,before_state,after_state
  ) values (
    p_event_id,auth.uid(),'room_time_slot_moved',p_room_id,v_before,v_after
  );
end;
$function$;

create function public.mga_regular_room_move_empty_v1(
  p_event_id uuid,
  p_room_id uuid,
  p_destination_time_slot_id uuid
)
returns void
language sql
security definer
set search_path = ''
as $function$
  select mga_api.move_empty_room_to_time_slot(p_event_id,p_room_id,p_destination_time_slot_id);
$function$;

revoke all on function mga_api.move_empty_room_to_time_slot(uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function public.mga_regular_room_move_empty_v1(uuid,uuid,uuid) from public, anon;
grant execute on function public.mga_regular_room_move_empty_v1(uuid,uuid,uuid) to authenticated;


-- Change only the generated default MGA room-name prefix.
-- Existing room names and the global per-event room number are preserved.
-- This migration defines the replacement RPC; it does not create or rename rooms.

do $preflight$
declare
  v_definition text;
begin
  if to_regprocedure('mga_api.assert_room_day_unpublished(uuid,text)') is null
     or to_regclass('mga_regular.rooms') is null
     or to_regclass('mga_regular.room_settings') is null
     or to_regclass('mga_regular.room_audit_log') is null then
    raise exception 'MGA KMGA prefix migration stopped: required room schema or authorization helper is missing';
  end if;

  if to_regprocedure('mga_api.create_room(uuid,text,uuid,text)') is null
     or to_regprocedure('public.mga_regular_room_create_v1(uuid,text,uuid,text)') is null then
    raise exception 'MGA KMGA prefix migration stopped: expected room-creation RPC signatures are missing';
  end if;

  select pg_get_functiondef('mga_api.create_room(uuid,text,uuid,text)'::regprocedure)
    into v_definition;
  if position('next_room_number = next_room_number + 1' in v_definition) = 0
     or position('''KMGM'' || v_number::text' in v_definition) = 0
     or position('assert_room_day_unpublished' in v_definition) = 0
     or position('room_created' in v_definition) = 0 then
    raise exception 'MGA KMGA prefix migration stopped: the existing room number, authorization, or audit behavior differs from the reviewed Production function';
  end if;
end;
$preflight$;

create or replace function mga_api.create_room(
  p_event_id uuid,
  p_day_key text,
  p_time_slot_id uuid,
  p_room_name text default null::text
)
returns mga_regular.rooms
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_number integer;
  v_room mga_regular.rooms%rowtype;
begin
  perform mga_api.assert_room_day_unpublished(p_event_id, p_day_key);
  if p_day_key not in ('thursday','friday','saturday','sunday') then
    raise exception 'Invalid MGA tournament day';
  end if;
  if not exists (
    select 1 from mga_regular.time_slots
    where id = p_time_slot_id and event_id = p_event_id and day_key = p_day_key and is_available
  ) then
    raise exception 'Choose an available time slot from the registered MGA schedule';
  end if;

  insert into mga_regular.room_settings(event_id)
    values (p_event_id)
    on conflict (event_id) do nothing;
  select next_room_number into v_number
    from mga_regular.room_settings where event_id = p_event_id for update;
  update mga_regular.room_settings
    set next_room_number = next_room_number + 1,
        updated_at = now(),
        updated_by = auth.uid()
    where event_id = p_event_id;

  insert into mga_regular.rooms(event_id, day_key, time_slot_id, room_number, room_name, created_by)
    values (
      p_event_id,
      p_day_key,
      p_time_slot_id,
      v_number,
      coalesce(nullif(btrim(p_room_name), ''), 'KMGA' || v_number::text),
      auth.uid()
    )
    returning * into v_room;
  insert into mga_regular.room_audit_log(event_id, actor_user_id, action, room_id, after_state)
    values (p_event_id, auth.uid(), 'room_created', v_room.id, to_jsonb(v_room));
  return v_room;
end;
$function$;

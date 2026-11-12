-- MGA Admin-only room transfer correction.
-- Keeps individually published source rooms published while an authorized
-- Admin moves one player to a different room (including another room in the
-- same booked slot). Whole-day publication remains locked.

do $preflight$
begin
  if to_regprocedure('mga_api.move_player_time_slot(uuid,uuid,uuid,text,uuid,uuid,uuid)') is null
     or to_regprocedure('mga_api.assert_owner()') is null
     or to_regprocedure('mga_api.assert_room_day_unpublished(uuid,text)') is null
     or to_regprocedure('mga_api.guard_room_publication_assignment()') is null
     or to_regprocedure('mga_api.save_room(uuid,uuid,text,integer,uuid[])') is null
     or to_regprocedure('mga_api.assign_room(uuid,uuid,text,uuid,uuid)') is null
     or to_regclass('mga_regular.room_publication_rooms') is null
     or to_regclass('mga_regular.room_assignments') is null
     or to_regclass('mga_regular.room_audit_log') is null then
    raise exception 'MGA room-transfer migration stopped: required move and publication protections are missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema='mga_regular' and table_name='room_publication_rooms'
      and column_name in ('event_id','room_id','day_key','published_at','published_by')
    group by table_schema,table_name
    having count(*)=5
  ) then
    raise exception 'MGA room-transfer migration stopped: publication record shape differs from the reviewed schema';
  end if;
  if not exists (
    select 1 from pg_constraint c
    where c.conrelid='mga_regular.room_assignments'::regclass
      and c.contype='u'
      and pg_get_constraintdef(c.oid)='UNIQUE (event_id, registration_id, day_key)'
  ) then
    raise exception 'MGA room-transfer migration stopped: expected one assignment per player and tournament day';
  end if;
end;
$preflight$;

create or replace function mga_api.move_player_time_slot(
  p_event_id uuid,
  p_registration_id uuid,
  p_expected_canonical_player_id uuid,
  p_day_key text,
  p_expected_time_slot_id uuid,
  p_destination_time_slot_id uuid,
  p_destination_room_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_registration mga_regular.registrations%rowtype;
  v_current_time_slot_id uuid;
  v_previous_assignment mga_regular.room_assignments%rowtype;
  v_has_previous_assignment boolean := false;
  v_source_publication mga_regular.room_publication_rooms%rowtype;
  v_had_source_publication boolean := false;
begin
  perform mga_api.assert_owner();
  perform mga_api.assert_room_day_unpublished(p_event_id,p_day_key);
  if p_day_key not in ('thursday','friday','saturday','sunday') then
    raise exception 'Invalid MGA tournament day';
  end if;

  select * into v_registration
  from mga_regular.registrations r
  where r.id=p_registration_id and r.event_id=p_event_id and r.status='registered'
  for update;
  if not found
     or v_registration.canonical_player_id is distinct from p_expected_canonical_player_id
     or public.resolve_canonical_player_id(v_registration.canonical_player_id) is distinct from v_registration.canonical_player_id then
    raise exception 'The selected registration no longer matches the active canonical MGA player';
  end if;

  select rs.time_slot_id into v_current_time_slot_id
  from mga_regular.registration_slots rs
  where rs.registration_id=p_registration_id and rs.event_id=p_event_id and rs.day_key=p_day_key
  for update;
  if not found then raise exception 'The player has no saved time selection for this day'; end if;
  if v_current_time_slot_id is distinct from p_expected_time_slot_id then
    raise exception 'The player time changed since this move was reviewed; refresh and confirm again';
  end if;
  if not exists (
    select 1 from mga_regular.time_slots ts
    where ts.id=p_expected_time_slot_id and ts.event_id=p_event_id and ts.day_key=p_day_key
  ) then
    raise exception 'The player''s current time slot no longer belongs to this tournament day';
  end if;
  if not exists (
    select 1 from mga_regular.time_slots ts
    where ts.id=p_destination_time_slot_id and ts.event_id=p_event_id
      and ts.day_key=p_day_key and ts.is_available
  ) then
    raise exception 'Choose an available time slot for the same tournament day';
  end if;

  select * into v_previous_assignment
  from mga_regular.room_assignments a
  where a.event_id=p_event_id and a.registration_id=p_registration_id and a.day_key=p_day_key
  for update;
  v_has_previous_assignment := found;

  if p_destination_room_id is not null then
    perform 1 from mga_regular.rooms rm
    where rm.id=p_destination_room_id and rm.event_id=p_event_id
      and rm.day_key=p_day_key and rm.time_slot_id=p_destination_time_slot_id
    for update;
    if not found then raise exception 'Choose a room in the destination time slot'; end if;
    if exists (
      select 1 from mga_regular.room_publication_rooms pub
      where pub.event_id=p_event_id and pub.room_id=p_destination_room_id
    ) then
      raise exception 'Unpublish the destination room before assigning another player to it';
    end if;
  end if;

  if v_current_time_slot_id=p_destination_time_slot_id
     and (not v_has_previous_assignment or v_previous_assignment.room_id is not distinct from p_destination_room_id) then
    raise exception 'Choose a different room or time slot';
  end if;

  if v_has_previous_assignment then
    delete from mga_regular.room_publication_rooms pub
    where pub.event_id=p_event_id and pub.room_id=v_previous_assignment.room_id
    returning * into v_source_publication;
    v_had_source_publication := found;
  end if;

  if v_current_time_slot_id is distinct from p_destination_time_slot_id then
    update mga_regular.registration_slots rs
    set time_slot_id=p_destination_time_slot_id
    where rs.registration_id=p_registration_id and rs.event_id=p_event_id and rs.day_key=p_day_key;
    if not found then raise exception 'The player saved time could not be updated'; end if;
  end if;

  if p_destination_room_id is null then
    delete from mga_regular.room_assignments a
    where a.event_id=p_event_id and a.registration_id=p_registration_id and a.day_key=p_day_key;
  else
    insert into mga_regular.room_assignments(
      event_id,registration_id,day_key,time_slot_id,room_id,assigned_by,updated_by
    ) values (
      p_event_id,p_registration_id,p_day_key,p_destination_time_slot_id,
      p_destination_room_id,auth.uid(),auth.uid()
    )
    on conflict(event_id,registration_id,day_key) do update
      set time_slot_id=excluded.time_slot_id,
          room_id=excluded.room_id,
          updated_by=auth.uid();
  end if;

  if v_had_source_publication then
    insert into mga_regular.room_publication_rooms(event_id,room_id,day_key,published_at,published_by)
    values(v_source_publication.event_id,v_source_publication.room_id,v_source_publication.day_key,
      v_source_publication.published_at,v_source_publication.published_by);
  end if;

  insert into mga_regular.room_audit_log(
    event_id,actor_user_id,action,registration_id,room_id,before_state,after_state
  ) values (
    p_event_id,auth.uid(),'player_time_slot_moved',p_registration_id,p_destination_room_id,
    jsonb_build_object(
      'canonical_player_id',p_expected_canonical_player_id,
      'day_key',p_day_key,'time_slot_id',v_current_time_slot_id,
      'room_id',case when v_has_previous_assignment then v_previous_assignment.room_id else null end,
      'source_room_published',v_had_source_publication
    ),
    jsonb_build_object(
      'canonical_player_id',p_expected_canonical_player_id,
      'day_key',p_day_key,'time_slot_id',p_destination_time_slot_id,
      'room_id',p_destination_room_id
    )
  );
end;
$function$;

create or replace function mga_api.save_room(
  p_event_id uuid,
  p_room_id uuid,
  p_room_name text,
  p_room_capacity integer,
  p_registration_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_room mga_regular.rooms%rowtype;
  v_ids uuid[]:=coalesce(p_registration_ids,'{}'::uuid[]);
  v_before jsonb;
  v_after jsonb;
  v_valid_count integer;
begin
  perform mga_api.assert_owner();
  perform mga_api.assert_regular_event(p_event_id);
  select * into v_room from mga_regular.rooms where id=p_room_id and event_id=p_event_id;
  if not found then raise exception 'Room not found'; end if;
  perform mga_api.assert_room_day_unpublished(p_event_id,v_room.day_key);
  select * into v_room from mga_regular.rooms where id=p_room_id and event_id=p_event_id for update;
  if not found then raise exception 'Room no longer exists'; end if;
  if char_length(btrim(coalesce(p_room_name,''))) not between 2 and 40 then raise exception 'Room name must contain 2 to 40 characters'; end if;
  if p_room_capacity is null or p_room_capacity not between 1 and 100 then raise exception 'Room capacity must be between 1 and 100'; end if;
  if cardinality(v_ids)<>(select count(distinct u.registration_id) from unnest(v_ids) u(registration_id)) then
    raise exception 'The room draft contains duplicate players';
  end if;
  if cardinality(v_ids)>p_room_capacity then raise exception 'Room capacity reached (% players)',p_room_capacity using errcode='23514'; end if;
  select count(*) into v_valid_count
  from unnest(v_ids) u(registration_id)
  join mga_regular.registrations r on r.id=u.registration_id and r.event_id=p_event_id and r.status='registered'
  join mga_regular.registration_slots rs on rs.registration_id=r.id and rs.event_id=p_event_id
    and rs.day_key=v_room.day_key and rs.time_slot_id=v_room.time_slot_id
  where r.canonical_player_id is not null
    and public.resolve_canonical_player_id(r.canonical_player_id)=r.canonical_player_id;
  if v_valid_count<>cardinality(v_ids) then raise exception 'Every selected player must be registered and booked in this room time slot'; end if;
  perform rs.registration_id from mga_regular.registration_slots rs
    where rs.event_id=p_event_id and rs.day_key=v_room.day_key and rs.time_slot_id=v_room.time_slot_id
      and rs.registration_id=any(v_ids) for update;
  if exists (
    select 1 from mga_regular.room_assignments current_assignment
    where current_assignment.event_id=p_event_id and current_assignment.day_key=v_room.day_key
      and current_assignment.registration_id=any(v_ids) and current_assignment.room_id<>p_room_id
  ) then
    raise exception 'A selected player is already assigned to another room. Use the authorized Move time / room workflow.' using errcode='23505';
  end if;
  select jsonb_build_object('room',to_jsonb(v_room),'assignments',coalesce(jsonb_agg(jsonb_build_object(
    'registration_id',a.registration_id,'room_id',a.room_id,'time_slot_id',a.time_slot_id) order by a.registration_id),'[]'::jsonb))
    into v_before
  from mga_regular.room_assignments a
  where a.event_id=p_event_id and a.day_key=v_room.day_key and (a.room_id=p_room_id or a.registration_id=any(v_ids));
  update mga_regular.rooms set room_name=btrim(p_room_name),capacity=p_room_capacity where id=p_room_id and event_id=p_event_id;
  delete from mga_regular.room_assignments a where a.event_id=p_event_id and a.room_id=p_room_id
    and not (a.registration_id=any(v_ids));
  insert into mga_regular.room_assignments(event_id,registration_id,day_key,time_slot_id,room_id,assigned_by,updated_by)
    select p_event_id,u.registration_id,v_room.day_key,v_room.time_slot_id,p_room_id,auth.uid(),auth.uid()
    from unnest(v_ids) u(registration_id)
    where not exists (
      select 1 from mga_regular.room_assignments current_assignment
      where current_assignment.event_id=p_event_id
        and current_assignment.registration_id=u.registration_id
        and current_assignment.day_key=v_room.day_key
        and current_assignment.room_id=p_room_id
        and current_assignment.time_slot_id=v_room.time_slot_id
    )
    on conflict(event_id,registration_id,day_key) do update
      set time_slot_id=excluded.time_slot_id,room_id=excluded.room_id,updated_by=auth.uid();
  select jsonb_build_object('room',to_jsonb(r),'assignments',coalesce((
    select jsonb_agg(jsonb_build_object('registration_id',a.registration_id,'room_id',a.room_id,'time_slot_id',a.time_slot_id)
      order by a.registration_id)
    from mga_regular.room_assignments a where a.event_id=p_event_id and a.day_key=r.day_key
      and (a.room_id=p_room_id or a.registration_id=any(v_ids))
  ),'[]'::jsonb)) into v_after
  from mga_regular.rooms r where r.id=p_room_id and r.event_id=p_event_id;
  insert into mga_regular.room_audit_log(event_id,actor_user_id,action,room_id,before_state,after_state)
    values(p_event_id,auth.uid(),'room_saved',p_room_id,v_before,v_after);
end;
$function$;

create or replace function mga_api.assign_room(
  p_event_id uuid,
  p_registration_id uuid,
  p_day_key text,
  p_time_slot_id uuid,
  p_room_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_before uuid;
begin
  perform mga_api.assert_room_day_unpublished(p_event_id,p_day_key);
  perform 1 from mga_regular.registration_slots rs
    where rs.event_id=p_event_id and rs.registration_id=p_registration_id and rs.day_key=p_day_key
      and rs.time_slot_id=p_time_slot_id for update;
  if not found then raise exception 'Room assignment must match the player saved day and time slot'; end if;
  select room_id into v_before from mga_regular.room_assignments
    where event_id=p_event_id and registration_id=p_registration_id and day_key=p_day_key;
  if v_before is not null and v_before<>p_room_id then
    raise exception 'Player is already assigned to another room. Use the authorized Move time / room workflow.' using errcode='23505';
  end if;
  insert into mga_regular.room_assignments(event_id, registration_id, day_key, time_slot_id, room_id, assigned_by, updated_by)
    values(p_event_id,p_registration_id,p_day_key,p_time_slot_id,p_room_id,auth.uid(),auth.uid())
    on conflict(event_id,registration_id,day_key) do update set time_slot_id=excluded.time_slot_id, room_id=excluded.room_id, updated_by=auth.uid();
  insert into mga_regular.room_audit_log(event_id, actor_user_id, action, registration_id, room_id, before_state, after_state)
    values(p_event_id,auth.uid(),'player_assigned',p_registration_id,p_room_id,jsonb_build_object('room_id',v_before),jsonb_build_object('room_id',p_room_id,'day_key',p_day_key,'time_slot_id',p_time_slot_id));
end;
$function$;

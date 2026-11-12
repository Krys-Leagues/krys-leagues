-- Review candidate: isolated MGA Admin time-slot moves only.
-- No room-capacity changes, Save Room operations, or day publication changes.
-- Installing this creates the Admin-only RPC; it does not move any player.

do $preflight$
begin
  if to_regclass('mga_regular.registrations') is null
     or to_regclass('mga_regular.registration_slots') is null
     or to_regclass('mga_regular.time_slots') is null
     or to_regclass('mga_regular.room_assignments') is null
     or to_regclass('mga_regular.room_audit_log') is null
     or to_regprocedure('mga_api.assert_owner()') is null
     or to_regprocedure('mga_api.assert_regular_event(uuid)') is null
     or to_regprocedure('mga_api.assert_room_day_unpublished(uuid,text)') is null then
    raise exception 'MGA move-only migration stopped: required MGA room and authorization prerequisites are missing';
  end if;
  if to_regprocedure('mga_api.move_player_time_slot(uuid,uuid,uuid,text,uuid,uuid,uuid)') is not null
     or to_regprocedure('mga_api.room_move_options(uuid)') is not null
     or to_regprocedure('public.mga_regular_room_move_options_v1(uuid)') is not null
     or to_regprocedure('public.mga_regular_player_move_time_slot_v1(uuid,uuid,uuid,text,uuid,uuid,uuid)') is not null
     or to_regprocedure('public.mga_regular_player_move_time_slot_v1(uuid,uuid,text,uuid,uuid)') is not null then
    raise exception 'MGA move-only migration stopped: a move RPC signature already exists; review before applying';
  end if;
  if not exists (
    select 1 from pg_constraint c
    where c.conrelid='mga_regular.time_slots'::regclass
      and c.contype='u'
      and pg_get_constraintdef(c.oid)='UNIQUE (event_id, day_key, id)'
  ) or not exists (
    select 1 from pg_constraint c
    where c.conrelid='mga_regular.registration_slots'::regclass
      and c.contype='p'
      and pg_get_constraintdef(c.oid)='PRIMARY KEY (registration_id, day_key)'
  ) or not exists (
    select 1 from pg_constraint c
    where c.conrelid='mga_regular.room_assignments'::regclass
      and c.contype='u'
      and pg_get_constraintdef(c.oid)='UNIQUE (event_id, registration_id, day_key)'
  ) then
    raise exception 'MGA move-only migration stopped: day-scoped keys differ from the reviewed Production schema';
  end if;
  if not exists (
    select 1 from pg_constraint c
    where c.conrelid='mga_regular.room_audit_log'::regclass
      and c.conname='room_audit_log_action_check'
      and pg_get_constraintdef(c.oid) like '%room_created%room_deleted%room_renamed%capacity_changed%player_assigned%player_unassigned%day_published%day_unpublished%'
  ) then
    raise exception 'MGA move-only migration stopped: the existing audit action constraint differs from the reviewed Production schema';
  end if;
end;
$preflight$;

alter table mga_regular.room_audit_log drop constraint room_audit_log_action_check;
alter table mga_regular.room_audit_log add constraint room_audit_log_action_check check (action in (
  'room_created','room_deleted','room_renamed','capacity_changed',
  'player_assigned','player_unassigned','player_time_slot_moved','room_saved','room_published','room_unpublished',
  'day_published','day_unpublished'
));

create function mga_api.move_player_time_slot(
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
  v_previous_room_id uuid;
begin
  -- This helper enforces active MGA owner authorization, regular-event scope,
  -- and the publication lock under a per-event/day advisory transaction lock.
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
  if v_current_time_slot_id=p_destination_time_slot_id then
    raise exception 'Choose a different time slot';
  end if;
  if not exists (
    select 1 from mga_regular.time_slots ts
    where ts.id=p_destination_time_slot_id and ts.event_id=p_event_id
      and ts.day_key=p_day_key and ts.is_available
  ) then
    raise exception 'Choose an available time slot for the same tournament day';
  end if;

  if p_destination_room_id is not null then
    perform 1 from mga_regular.rooms rm
    where rm.id=p_destination_room_id and rm.event_id=p_event_id
      and rm.day_key=p_day_key and rm.time_slot_id=p_destination_time_slot_id
    for update;
    if not found then raise exception 'Choose a room in the destination time slot'; end if;
  end if;

  select a.room_id into v_previous_room_id
  from mga_regular.room_assignments a
  where a.event_id=p_event_id and a.registration_id=p_registration_id and a.day_key=p_day_key
  for update;

  update mga_regular.registration_slots rs
  set time_slot_id=p_destination_time_slot_id
  where rs.registration_id=p_registration_id and rs.event_id=p_event_id and rs.day_key=p_day_key;
  if not found then raise exception 'The player saved time could not be updated'; end if;

  if p_destination_room_id is null then
    -- An Admin time move never assigns a room implicitly. Remove only this
    -- player's old assignment for this one day.
    delete from mga_regular.room_assignments a
    where a.event_id=p_event_id and a.registration_id=p_registration_id and a.day_key=p_day_key;
  else
    -- The installed room-assignment trigger checks owner authorization,
    -- matching slot, unpublished day, and the existing configured room limit.
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

  insert into mga_regular.room_audit_log(
    event_id,actor_user_id,action,registration_id,room_id,before_state,after_state
  ) values (
    p_event_id,auth.uid(),'player_time_slot_moved',p_registration_id,p_destination_room_id,
    jsonb_build_object(
      'canonical_player_id',p_expected_canonical_player_id,
      'day_key',p_day_key,'time_slot_id',v_current_time_slot_id,'room_id',v_previous_room_id
    ),
    jsonb_build_object(
      'canonical_player_id',p_expected_canonical_player_id,
      'day_key',p_day_key,'time_slot_id',p_destination_time_slot_id,'room_id',p_destination_room_id
    )
  );
end;
$function$;

create function mga_api.room_move_options(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_slots jsonb;
begin
  perform mga_api.assert_owner();
  perform mga_api.assert_regular_event(p_event_id);
  select coalesce(jsonb_agg(jsonb_build_object(
    'day_key',ts.day_key,
    'time_slot_id',ts.id,
    'slot_number',ts.slot_number,
    'event_date',ts.event_date,
    'starts_at',ts.starts_at,
    'eastern_label',ts.eastern_label,
    'round_label',ts.round_label,
    'course_name',ts.course_name
  ) order by ts.event_date,ts.slot_number),'[]'::jsonb)
  into v_slots
  from mga_regular.time_slots ts
  where ts.event_id=p_event_id and ts.is_available;
  return v_slots;
end;
$function$;

revoke all on function mga_api.room_move_options(uuid) from public,anon,authenticated,service_role;

revoke all on function mga_api.move_player_time_slot(uuid,uuid,uuid,text,uuid,uuid,uuid)
  from public,anon,authenticated,service_role;

create function public.mga_regular_player_move_time_slot_v1(
  p_event_id uuid,
  p_registration_id uuid,
  p_expected_canonical_player_id uuid,
  p_day_key text,
  p_expected_time_slot_id uuid,
  p_destination_time_slot_id uuid,
  p_destination_room_id uuid
)
returns void
language sql
security definer
set search_path = ''
as $function$
  select mga_api.move_player_time_slot(
    p_event_id,p_registration_id,p_expected_canonical_player_id,p_day_key,
    p_expected_time_slot_id,p_destination_time_slot_id,p_destination_room_id
  );
$function$;

create function public.mga_regular_room_move_options_v1(p_event_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $function$
  select mga_api.room_move_options(p_event_id);
$function$;

revoke all on function public.mga_regular_player_move_time_slot_v1(uuid,uuid,uuid,text,uuid,uuid,uuid)
  from public,anon,authenticated,service_role;
revoke all on function public.mga_regular_room_move_options_v1(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.mga_regular_player_move_time_slot_v1(uuid,uuid,uuid,text,uuid,uuid,uuid)
  to authenticated;
grant execute on function public.mga_regular_room_move_options_v1(uuid)
  to authenticated;

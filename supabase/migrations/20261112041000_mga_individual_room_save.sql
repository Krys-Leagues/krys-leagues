-- Prepared additive MGA room-management correction.
-- Apply only after the owner separately approves this migration. It does not
-- modify registrations until an authorized Admin explicitly invokes the move RPC.

do $preflight$
begin
  if to_regclass('mga_regular.rooms') is null
     or to_regclass('mga_regular.room_settings') is null
     or to_regclass('mga_regular.room_assignments') is null
     or to_regclass('mga_regular.registration_slots') is null
     or to_regclass('mga_regular.room_audit_log') is null
     or to_regprocedure('mga_api.assert_owner()') is null
     or to_regprocedure('mga_api.assert_regular_event(uuid)') is null
     or to_regprocedure('mga_api.assert_room_day_unpublished(uuid,text)') is null then
    raise exception 'MGA room correction stopped: installed room-management prerequisites are missing';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema='mga_regular' and table_name='rooms' and column_name='capacity'
  ) then
    raise exception 'MGA room correction stopped: rooms.capacity already exists; review the schema before applying';
  end if;
  if exists (select 1 from pg_constraint where conname='mga_regular_rooms_capacity_check'
      and conrelid='mga_regular.rooms'::regclass) then
    raise exception 'MGA room correction stopped: room capacity constraint name already exists';
  end if;
  if to_regprocedure('public.mga_regular_room_save_v1(uuid,uuid,text,integer,uuid[])') is not null then
    raise exception 'MGA room correction stopped: the Save Room RPC already exists; review before applying';
  end if;
  if not exists (
    select 1 from pg_constraint c
    where c.conrelid='mga_regular.room_audit_log'::regclass
      and c.conname='room_audit_log_action_check'
      and pg_get_constraintdef(c.oid) like '%room_created%room_deleted%room_renamed%capacity_changed%player_assigned%player_unassigned%day_published%day_unpublished%'
  ) then
    raise exception 'MGA room correction stopped: room audit action constraint differs from the installed contract';
  end if;
end;
$preflight$;

alter table mga_regular.rooms
  add column capacity integer not null default 4;

update mga_regular.rooms r
set capacity=coalesce((select s.room_capacity from mga_regular.room_settings s where s.event_id=r.event_id),4);

alter table mga_regular.rooms
  add constraint mga_regular_rooms_capacity_check check (capacity between 1 and 100);

alter table mga_regular.room_audit_log drop constraint room_audit_log_action_check;
alter table mga_regular.room_audit_log add constraint room_audit_log_action_check check (action in (
  'room_created','room_deleted','room_renamed','room_saved','capacity_changed',
  'player_assigned','player_unassigned','player_time_slot_moved','day_published','day_unpublished'
));

create or replace function mga_api.create_room(p_event_id uuid, p_day_key text, p_time_slot_id uuid, p_room_name text default null)
returns mga_regular.rooms language plpgsql security definer set search_path = '' as $function$
declare
  v_number integer;
  v_capacity integer;
  v_room mga_regular.rooms%rowtype;
begin
  perform mga_api.assert_room_day_unpublished(p_event_id,p_day_key);
  if p_day_key not in ('thursday','friday','saturday','sunday') then raise exception 'Invalid MGA tournament day'; end if;
  if not exists (select 1 from mga_regular.time_slots where id=p_time_slot_id and event_id=p_event_id and day_key=p_day_key and is_available) then
    raise exception 'Choose an available time slot from the registered MGA schedule';
  end if;
  insert into mga_regular.room_settings(event_id) values(p_event_id) on conflict(event_id) do nothing;
  select next_room_number,room_capacity into v_number,v_capacity from mga_regular.room_settings where event_id=p_event_id for update;
  update mga_regular.room_settings set next_room_number=next_room_number+1,updated_at=now(),updated_by=auth.uid() where event_id=p_event_id;
  insert into mga_regular.rooms(event_id,day_key,time_slot_id,room_number,room_name,capacity,created_by)
    values(p_event_id,p_day_key,p_time_slot_id,v_number,coalesce(nullif(btrim(p_room_name),''),'KMGA'||v_number::text),v_capacity,auth.uid())
    returning * into v_room;
  insert into mga_regular.room_audit_log(event_id,actor_user_id,action,room_id,after_state)
    values(p_event_id,auth.uid(),'room_created',v_room.id,to_jsonb(v_room));
  return v_room;
end;
$function$;

create or replace function mga_api.set_room_capacity(p_event_id uuid,p_room_capacity integer)
returns void language plpgsql security definer set search_path = '' as $function$
declare v_before integer;
begin
  perform mga_api.assert_owner();
  perform mga_api.assert_regular_event(p_event_id);
  if p_room_capacity is null or p_room_capacity not between 1 and 100 then raise exception 'Room capacity must be between 1 and 100'; end if;
  insert into mga_regular.room_settings(event_id) values(p_event_id) on conflict(event_id) do nothing;
  select room_capacity into v_before from mga_regular.room_settings where event_id=p_event_id for update;
  update mga_regular.room_settings set room_capacity=p_room_capacity,updated_at=now(),updated_by=auth.uid() where event_id=p_event_id;
  insert into mga_regular.room_audit_log(event_id,actor_user_id,action,before_state,after_state)
    values(p_event_id,auth.uid(),'capacity_changed',jsonb_build_object('default_capacity',v_before),
      jsonb_build_object('default_capacity',p_room_capacity));
end;
$function$;

create or replace function mga_api.guard_room_assignment()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare
  v_registration mga_regular.registrations%rowtype;
  v_capacity integer;
  v_count integer;
begin
  perform mga_api.assert_owner();
  perform mga_api.assert_regular_event(new.event_id);
  perform mga_api.assert_room_day_unpublished(new.event_id,new.day_key);
  select * into v_registration from mga_regular.registrations where id=new.registration_id for key share;
  if not found or v_registration.event_id<>new.event_id or v_registration.status<>'registered'
     or v_registration.canonical_player_id is null
     or public.resolve_canonical_player_id(v_registration.canonical_player_id) is distinct from v_registration.canonical_player_id then
    raise exception 'Only a currently registered canonical MGA player can be assigned';
  end if;
  if not exists(select 1 from mga_regular.registration_slots rs where rs.registration_id=new.registration_id
      and rs.event_id=new.event_id and rs.day_key=new.day_key and rs.time_slot_id=new.time_slot_id) then
    raise exception 'Room assignment must match the player saved day and time slot';
  end if;
  select r.capacity into v_capacity from mga_regular.rooms r where r.id=new.room_id
    and r.event_id=new.event_id and r.day_key=new.day_key and r.time_slot_id=new.time_slot_id for update;
  if not found then raise exception 'Room does not match the player saved day and time slot'; end if;
  select count(*) into v_count from mga_regular.room_assignments a
    join mga_regular.registrations r on r.id=a.registration_id and r.event_id=a.event_id
    where a.room_id=new.room_id and r.status='registered' and (tg_op='INSERT' or a.id<>new.id);
  if v_count>=v_capacity then raise exception 'Room capacity reached (% players)',v_capacity using errcode='23514'; end if;
  new.updated_at:=now();
  new.updated_by:=auth.uid();
  return new;
end;
$function$;

create or replace function mga_api.room_admin_snapshot(p_event_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare v_result jsonb;
begin
  perform mga_api.assert_owner();
  perform mga_api.assert_regular_event(p_event_id);
  select jsonb_build_object(
    'room_capacity',coalesce((select room_capacity from mga_regular.room_settings where event_id=p_event_id),4),
    'next_room_number',coalesce((select next_room_number from mga_regular.room_settings where event_id=p_event_id),1),
    'days',coalesce((
      select jsonb_agg(jsonb_build_object('day_key',d.day_key,'published_at',p.published_at) order by d.day_order)
      from (values ('thursday',1),('friday',2),('saturday',3),('sunday',4)) d(day_key,day_order)
      left join mga_regular.room_publications p on p.event_id=p_event_id and p.day_key=d.day_key
    ),'[]'::jsonb),
    'time_slots',coalesce((
      select jsonb_agg(jsonb_build_object('day_key',ts.day_key,'time_slot_id',ts.id,'slot_number',ts.slot_number,
        'event_date',ts.event_date,'starts_at',ts.starts_at,'eastern_label',ts.eastern_label,
        'round_label',ts.round_label,'course_name',ts.course_name) order by ts.event_date,ts.slot_number)
      from mga_regular.time_slots ts where ts.event_id=p_event_id and ts.is_available
    ),'[]'::jsonb),
    'players',coalesce((
      select jsonb_agg(jsonb_build_object(
        'registration_id',r.id,'canonical_player_id',public.resolve_canonical_player_id(r.canonical_player_id),
        'screen_name',cp.screen_name,'player_time_zone',r.player_time_zone,
        'selections',coalesce((
          select jsonb_agg(jsonb_build_object('day_key',rs.day_key,'time_slot_id',ts.id,'slot_number',ts.slot_number,
            'event_date',ts.event_date,'starts_at',ts.starts_at,'eastern_label',ts.eastern_label,
            'round_label',ts.round_label,'course_name',ts.course_name) order by ts.event_date,ts.slot_number)
          from mga_regular.registration_slots rs join mga_regular.time_slots ts
            on ts.id=rs.time_slot_id and ts.event_id=rs.event_id and ts.day_key=rs.day_key
          where rs.registration_id=r.id and rs.event_id=r.event_id
        ),'[]'::jsonb)
      ) order by lower(cp.screen_name),r.id)
      from mga_regular.registrations r join public.players cp on cp.id=public.resolve_canonical_player_id(r.canonical_player_id)
      where r.event_id=p_event_id and r.status='registered'
    ),'[]'::jsonb),
    'rooms',coalesce((
      select jsonb_agg(jsonb_build_object('id',rm.id,'day_key',rm.day_key,'time_slot_id',rm.time_slot_id,
        'room_number',rm.room_number,'room_name',rm.room_name,'capacity',rm.capacity,
        'player_count',(select count(*) from mga_regular.room_assignments a join mga_regular.registrations r
          on r.id=a.registration_id and r.event_id=a.event_id where a.room_id=rm.id and r.status='registered'))
        order by rm.day_key,rm.time_slot_id,rm.room_number)
      from mga_regular.rooms rm where rm.event_id=p_event_id
    ),'[]'::jsonb),
    'assignments',coalesce((
      select jsonb_agg(jsonb_build_object('registration_id',a.registration_id,
        'canonical_player_id',public.resolve_canonical_player_id(r.canonical_player_id),
        'day_key',a.day_key,'time_slot_id',a.time_slot_id,'room_id',a.room_id)
        order by a.day_key,a.time_slot_id,a.registration_id)
      from mga_regular.room_assignments a join mga_regular.registrations r
        on r.id=a.registration_id and r.event_id=a.event_id
      where a.event_id=p_event_id and r.status='registered'
    ),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$function$;

create function mga_api.save_room(p_event_id uuid,p_room_id uuid,p_room_name text,p_room_capacity integer,p_registration_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $function$
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

revoke all on function mga_api.save_room(uuid,uuid,text,integer,uuid[])
  from public,anon,authenticated,service_role;

create function public.mga_regular_room_save_v1(p_event_id uuid,p_room_id uuid,p_room_name text,p_room_capacity integer,p_registration_ids uuid[])
returns void language sql security definer set search_path = '' as $function$
  select mga_api.save_room(p_event_id,p_room_id,p_room_name,p_room_capacity,p_registration_ids);
$function$;

revoke all on function public.mga_regular_room_save_v1(uuid,uuid,text,integer,uuid[])
  from public,anon,authenticated,service_role;
grant execute on function public.mga_regular_room_save_v1(uuid,uuid,text,integer,uuid[])
  to authenticated;

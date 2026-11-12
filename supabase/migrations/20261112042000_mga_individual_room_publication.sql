-- Prepared additive migration. Existing day-level publication remains available.

do $preflight$
begin
  if to_regclass('mga_regular.rooms') is null
     or to_regclass('mga_regular.room_assignments') is null
     or to_regclass('mga_regular.room_publications') is null
     or to_regclass('mga_regular.room_audit_log') is null
     or to_regprocedure('mga_api.assert_owner()') is null
     or to_regprocedure('mga_api.assert_regular_event(uuid)') is null
     or to_regprocedure('mga_api.assert_room_day_unpublished(uuid,text)') is null
     or to_regprocedure('mga_api.room_admin_snapshot(uuid)') is null
     or to_regprocedure('mga_api.my_published_rooms(uuid)') is null then
    raise exception 'MGA room publication stopped: required installed objects are missing';
  end if;
  if not exists (
    select 1 from pg_constraint c
    where c.conrelid='mga_regular.room_audit_log'::regclass
      and c.conname='room_audit_log_action_check'
      and pg_get_constraintdef(c.oid) like '%room_saved%player_time_slot_moved%day_published%day_unpublished%'
  ) then
    raise exception 'MGA room publication stopped: the reviewed room audit action contract is missing';
  end if;
  if to_regclass('mga_regular.room_publication_rooms') is not null
     or to_regprocedure('mga_api.publish_room(uuid,uuid)') is not null
     or to_regprocedure('public.mga_regular_room_publish_v1(uuid,uuid)') is not null then
    raise exception 'MGA room publication stopped: a room-publication object already exists; review it before applying';
  end if;
end;
$preflight$;

create table mga_regular.room_publication_rooms (
  event_id uuid not null references mga_regular.events(id),
  room_id uuid not null,
  day_key text not null check (day_key in ('thursday','friday','saturday','sunday')),
  published_at timestamptz not null default now(),
  published_by uuid not null references auth.users(id),
  primary key (event_id, room_id),
  foreign key (event_id, room_id) references mga_regular.rooms(event_id, id)
);

alter table mga_regular.room_publication_rooms enable row level security;
revoke all on table mga_regular.room_publication_rooms from public, anon, authenticated, service_role;

alter table mga_regular.room_audit_log drop constraint room_audit_log_action_check;
alter table mga_regular.room_audit_log add constraint room_audit_log_action_check check (action in (
  'room_created','room_deleted','room_renamed','room_saved','capacity_changed',
  'player_assigned','player_unassigned','player_time_slot_moved',
  'room_published','room_unpublished','day_published','day_unpublished'
));

create function mga_api.publish_room(p_event_id uuid,p_room_id uuid)
returns void language plpgsql security definer set search_path = '' as $function$
declare
  v_room mga_regular.rooms%rowtype;
  v_players integer;
begin
  perform mga_api.assert_owner();
  perform mga_api.assert_regular_event(p_event_id);
  select * into v_room from mga_regular.rooms where id=p_room_id and event_id=p_event_id for update;
  if not found then raise exception 'Room not found'; end if;
  perform mga_api.assert_room_day_unpublished(p_event_id,v_room.day_key);
  if exists(select 1 from mga_regular.room_publications p where p.event_id=p_event_id and p.day_key=v_room.day_key) then
    raise exception 'The whole day is already published; use the day publication controls';
  end if;
  select count(*) into v_players
  from mga_regular.room_assignments a
  join mga_regular.registrations r on r.id=a.registration_id and r.event_id=a.event_id
  where a.event_id=p_event_id and a.room_id=p_room_id and a.day_key=v_room.day_key
    and a.time_slot_id=v_room.time_slot_id and r.status='registered';
  if v_players=0 then raise exception 'Assign at least one registered player before publishing this room'; end if;
  insert into mga_regular.room_publication_rooms(event_id,room_id,day_key,published_by)
    values(p_event_id,p_room_id,v_room.day_key,auth.uid());
  insert into mga_regular.room_audit_log(event_id,actor_user_id,action,room_id,after_state)
    values(p_event_id,auth.uid(),'room_published',p_room_id,
      jsonb_build_object('day_key',v_room.day_key,'time_slot_id',v_room.time_slot_id,'players',v_players));
end;
$function$;

create function mga_api.unpublish_room(p_event_id uuid,p_room_id uuid)
returns void language plpgsql security definer set search_path = '' as $function$
declare
  v_publication mga_regular.room_publication_rooms%rowtype;
  v_day_key text;
begin
  perform mga_api.assert_owner();
  perform mga_api.assert_regular_event(p_event_id);
  select day_key into v_day_key from mga_regular.rooms where event_id=p_event_id and id=p_room_id for update;
  if not found then raise exception 'Room not found'; end if;
  perform mga_api.assert_room_day_unpublished(p_event_id,v_day_key);
  delete from mga_regular.room_publication_rooms
    where event_id=p_event_id and room_id=p_room_id returning * into v_publication;
  if not found then raise exception 'This room is not individually published'; end if;
  insert into mga_regular.room_audit_log(event_id,actor_user_id,action,room_id,before_state)
    values(p_event_id,auth.uid(),'room_unpublished',p_room_id,
      jsonb_build_object('day_key',v_publication.day_key,'published_at',v_publication.published_at));
end;
$function$;

revoke all on function mga_api.publish_room(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function mga_api.unpublish_room(uuid,uuid) from public,anon,authenticated,service_role;

create function public.mga_regular_room_publish_v1(p_event_id uuid,p_room_id uuid)
returns void language sql security definer set search_path = '' as $function$
  select mga_api.publish_room(p_event_id,p_room_id);
$function$;
create function public.mga_regular_room_unpublish_v1(p_event_id uuid,p_room_id uuid)
returns void language sql security definer set search_path = '' as $function$
  select mga_api.unpublish_room(p_event_id,p_room_id);
$function$;

revoke all on function public.mga_regular_room_publish_v1(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.mga_regular_room_unpublish_v1(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.mga_regular_room_publish_v1(uuid,uuid) to authenticated;
grant execute on function public.mga_regular_room_unpublish_v1(uuid,uuid) to authenticated;

create function mga_api.guard_room_publication_assignment()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  perform mga_api.assert_owner();
  if tg_op='DELETE' then
    perform mga_api.assert_room_day_unpublished(old.event_id,old.day_key);
    if exists(select 1 from mga_regular.room_publication_rooms p where p.event_id=old.event_id and p.room_id=old.room_id) then
      raise exception 'Unpublish this room before changing its player assignments';
    end if;
    return old;
  end if;
  perform mga_api.assert_room_day_unpublished(new.event_id,new.day_key);
  if exists(select 1 from mga_regular.room_publication_rooms p where p.event_id=new.event_id and p.room_id=new.room_id) then
    raise exception 'Unpublish the destination room before changing its player assignments';
  end if;
  if tg_op='UPDATE' and exists(select 1 from mga_regular.room_publication_rooms p where p.event_id=old.event_id and p.room_id=old.room_id) then
    raise exception 'Unpublish the source room before moving its player assignment';
  end if;
  return new;
end;
$function$;

create trigger mga_room_publication_assignment_lock
before insert or update or delete on mga_regular.room_assignments
for each row execute function mga_api.guard_room_publication_assignment();

create function mga_api.guard_room_publication_room()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  perform mga_api.assert_owner();
  perform mga_api.assert_room_day_unpublished(old.event_id,old.day_key);
  if exists(select 1 from mga_regular.room_publication_rooms p where p.event_id=old.event_id and p.room_id=old.id) then
    raise exception 'Unpublish this room before renaming, changing capacity, or deleting it';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$function$;

create trigger mga_room_publication_room_lock
before update or delete on mga_regular.rooms
for each row execute function mga_api.guard_room_publication_room();

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
        'published_at',rp.published_at,
        'player_count',(select count(*) from mga_regular.room_assignments a join mga_regular.registrations r
          on r.id=a.registration_id and r.event_id=a.event_id where a.room_id=rm.id and r.status='registered'))
        order by rm.day_key,rm.time_slot_id,rm.room_number)
      from mga_regular.rooms rm left join mga_regular.room_publication_rooms rp
        on rp.event_id=rm.event_id and rp.room_id=rm.id
      where rm.event_id=p_event_id
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

create or replace function mga_api.my_published_rooms(p_event_id uuid)
returns table(registration_id uuid,canonical_player_id uuid,day_key text,room_name text,
  event_date date,starts_at timestamptz,eastern_label text,player_time_zone text,
  round_label text,course_name text,published_at timestamptz)
language sql stable security definer set search_path = '' as $function$
  with discord_claims as (
    select array_agg(distinct nullif(btrim(coalesce(i.identity_data->>'provider_id',i.identity_data->>'id',i.identity_data->>'sub')),'')
      order by nullif(btrim(coalesce(i.identity_data->>'provider_id',i.identity_data->>'id',i.identity_data->>'sub')),'')) as ids
    from auth.identities i where i.user_id=auth.uid() and i.provider='discord'
  )
  select r.id,public.resolve_canonical_player_id(r.canonical_player_id),a.day_key,rm.room_name,
    ts.event_date,ts.starts_at,ts.eastern_label,r.player_time_zone,ts.round_label,ts.course_name,
    coalesce(dp.published_at,rp.published_at)
  from discord_claims d
  join mga_regular.registrations r on cardinality(d.ids)=1 and r.discord_user_id=d.ids[1]
  join public.players cp on cp.id=public.resolve_canonical_player_id(r.canonical_player_id) and cp.discord_id=d.ids[1]
  join mga_regular.room_assignments a on a.registration_id=r.id and a.event_id=r.event_id
  join mga_regular.rooms rm on rm.id=a.room_id and rm.event_id=a.event_id and rm.day_key=a.day_key
  join mga_regular.time_slots ts on ts.id=a.time_slot_id and ts.event_id=a.event_id and ts.day_key=a.day_key
  left join mga_regular.room_publications dp on dp.event_id=a.event_id and dp.day_key=a.day_key
  left join mga_regular.room_publication_rooms rp on rp.event_id=a.event_id and rp.room_id=a.room_id and rp.day_key=a.day_key
  where r.event_id=p_event_id and r.status='registered'
    and exists(select 1 from mga_regular.events e where e.id=p_event_id and e.event_key='mga-2026-regular' and e.is_test is false)
    and (dp.event_id is not null or rp.room_id is not null)
  order by ts.event_date,ts.slot_number;
$function$;

revoke all on function mga_api.guard_room_publication_assignment() from public,anon,authenticated,service_role;
revoke all on function mga_api.guard_room_publication_room() from public,anon,authenticated,service_role;


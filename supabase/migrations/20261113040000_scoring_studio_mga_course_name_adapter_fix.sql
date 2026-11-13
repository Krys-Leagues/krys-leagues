-- MGA time slots store the difficulty in course_name (for example, "Gardens of Babylon Easy").
-- Studio rounds store the base course and difficulty separately. Normalize that boundary so
-- published-room reads, player access checks, and the duplicate-room guard match the same round.

create or replace function public.scoring_studio_my_mga_published_rooms_v1(p_instance_id uuid)
returns table(room_id uuid,instance_id uuid,round_id uuid,round_number integer,round_date date,player_id uuid,
  screen_name text,room_name text,course_name text,difficulty text,starts_at timestamptz,time_zone text,
  room_roster text[],published_version integer,notification_pending boolean,room_source text)
language plpgsql stable security definer set search_path = '' as $function$
declare v_player uuid:=public.current_major_player_id(); v_source_event uuid; v_actor uuid:=auth.uid();
begin
  if v_actor is null or v_player is null then raise exception 'Sign in with your registered player identity' using errcode='42501'; end if;
  select i.source_event_id into v_source_event from public.scoring_studio_instances i
    where i.id=p_instance_id and i.source_kind='mga_regular' and i.status in ('live','complete');
  if v_source_event is null then return; end if;
  return query
  with mine as (
    select * from mga_api.my_published_rooms(v_source_event)
  ), joined as (
    select rm.id as room_id,rd.id as round_id,rd.round_number,ts.event_date as round_date,
      public.resolve_canonical_player_id(reg.canonical_player_id) as player_id,cp.screen_name,
      rm.room_name,ts.course_name,rd.difficulty,ts.starts_at,reg.player_time_zone,
      mine.published_at,
      array(
        select member_cp.screen_name
        from mga_regular.room_assignments ma
        join mga_regular.registrations mr on mr.id=ma.registration_id and mr.event_id=ma.event_id and mr.status='registered'
        join public.players member_cp on member_cp.id=public.resolve_canonical_player_id(mr.canonical_player_id)
        where ma.event_id=rm.event_id and ma.room_id=rm.id and ma.day_key=rm.day_key and ma.time_slot_id=rm.time_slot_id
        order by lower(member_cp.screen_name),member_cp.id
      ) as roster
    from mine
    join mga_regular.registrations reg on reg.id=mine.registration_id and reg.event_id=v_source_event and reg.status='registered'
    join mga_regular.room_assignments a on a.registration_id=reg.id and a.event_id=reg.event_id and a.day_key=mine.day_key
    join mga_regular.rooms rm on rm.id=a.room_id and rm.event_id=a.event_id and rm.day_key=a.day_key and rm.room_name=mine.room_name
    join mga_regular.time_slots ts on ts.id=a.time_slot_id and ts.event_id=a.event_id and ts.day_key=a.day_key
    join public.scoring_studio_rounds rd on rd.instance_id=p_instance_id and rd.round_date=ts.event_date
      and ts.course_name=concat(rd.course_name,' ',initcap(rd.difficulty))
    join public.players cp on cp.id=v_player
    where public.resolve_canonical_player_id(reg.canonical_player_id)=v_player
  )
  select j.room_id,p_instance_id,j.round_id,j.round_number,j.round_date,j.player_id,j.screen_name,j.room_name,j.course_name,j.difficulty,
    j.starts_at,coalesce(j.player_time_zone,'America/New_York'),j.roster,
    hashtext(concat_ws('|',j.published_at,j.room_name,j.starts_at,j.roster))::integer,
    not exists(select 1 from public.scoring_studio_external_room_acknowledgments a where a.instance_id=p_instance_id
      and a.round_id=j.round_id and a.room_source='mga_regular' and a.room_id=j.room_id and a.canonical_player_id=v_player
      and a.published_version=hashtext(concat_ws('|',j.published_at,j.room_name,j.starts_at,j.roster))::integer),
    'mga_regular'::text
  from joined j order by j.round_date,j.starts_at,j.room_name;
end;
$function$;

create or replace function public.scoring_studio_room_access_v1(
  p_instance_id uuid,p_round_id uuid,p_room_source text,p_room_id uuid,p_player_id uuid default null
) returns boolean language plpgsql stable security definer set search_path = '' as $function$
declare v_player_id uuid := public.current_major_player_id(); v_is_admin boolean;
begin
  if auth.uid() is null or p_room_source not in ('studio','mga_regular') then return false; end if;
  v_is_admin:=public.scoring_studio_is_admin(p_instance_id);
  if p_player_id is not null and p_player_id is distinct from v_player_id and not v_is_admin then return false; end if;
  if p_room_source='studio' then
    if not exists(select 1 from public.scoring_studio_rooms rm where rm.id=p_room_id and rm.instance_id=p_instance_id and rm.round_id=p_round_id) then return false; end if;
    if v_is_admin then return true; end if;
    if v_player_id is null or p_player_id is not null and p_player_id<>v_player_id then return false; end if;
    return exists(
      select 1 from public.scoring_studio_rooms rm
      join public.scoring_studio_room_members m on m.room_id=rm.id and m.instance_id=rm.instance_id and m.round_id=rm.round_id
      where rm.id=p_room_id and rm.instance_id=p_instance_id and rm.round_id=p_round_id
        and rm.published and rm.cancelled_at is null and m.canonical_player_id=v_player_id
    );
  end if;
  if not exists(
    select 1 from public.scoring_studio_instances i
    join public.scoring_studio_rounds sr on sr.id=p_round_id and sr.instance_id=i.id
    join mga_regular.rooms rm on rm.id=p_room_id and rm.event_id=i.source_event_id
    join mga_regular.time_slots ts on ts.event_id=rm.event_id and ts.id=rm.time_slot_id and ts.day_key=rm.day_key
    where i.id=p_instance_id and i.source_kind='mga_regular'
      and sr.round_date=ts.event_date and ts.course_name=concat(sr.course_name,' ',initcap(sr.difficulty))
  ) then return false; end if;
  if v_is_admin then return true; end if;
  if v_player_id is null or p_player_id is not null and p_player_id<>v_player_id then return false; end if;
  return exists(
    select 1
    from public.scoring_studio_instances i
    join public.scoring_studio_rounds sr on sr.id=p_round_id and sr.instance_id=i.id
    join mga_regular.registrations reg on reg.event_id=i.source_event_id and reg.status='registered'
    join mga_regular.room_assignments a on a.event_id=reg.event_id and a.registration_id=reg.id
    join mga_regular.rooms rm on rm.id=a.room_id and rm.event_id=a.event_id and rm.day_key=a.day_key
    join mga_regular.time_slots ts on ts.id=a.time_slot_id and ts.event_id=a.event_id and ts.day_key=a.day_key
    where i.id=p_instance_id and i.source_kind='mga_regular'
      and rm.id=p_room_id and sr.round_date=ts.event_date
      and ts.course_name=concat(sr.course_name,' ',initcap(sr.difficulty))
      and public.resolve_canonical_player_id(reg.canonical_player_id)=v_player_id
      and (
        exists(select 1 from mga_regular.room_publication_rooms rp where rp.event_id=rm.event_id and rp.room_id=rm.id and rp.day_key=rm.day_key)
        or exists(select 1 from mga_regular.room_publications dp where dp.event_id=rm.event_id and dp.day_key=rm.day_key)
      )
  );
end;
$function$;

create or replace function public.scoring_studio_guard_legacy_mga_room_duplicate()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare v_source_event uuid;
begin
  select i.source_event_id into v_source_event
  from public.scoring_studio_instances i where i.id=new.instance_id and i.source_kind='mga_regular';
  if v_source_event is null then return new; end if;
  if exists(
    select 1 from public.scoring_studio_rounds sr
    join mga_regular.time_slots ts on ts.event_id=v_source_event and ts.event_date=sr.round_date
      and ts.course_name=concat(sr.course_name,' ',initcap(sr.difficulty))
    join mga_regular.room_assignments a on a.event_id=ts.event_id and a.time_slot_id=ts.id and a.day_key=ts.day_key
    join mga_regular.registrations reg on reg.id=a.registration_id and reg.event_id=a.event_id and reg.status='registered'
    where sr.id=new.round_id and sr.instance_id=new.instance_id
      and public.resolve_canonical_player_id(reg.canonical_player_id)=new.canonical_player_id
  ) then
    raise exception 'This player already has an authoritative MGA room assignment. Manage the assignment in the existing MGA room system.'
      using errcode='23505';
  end if;
  return new;
end;
$function$;

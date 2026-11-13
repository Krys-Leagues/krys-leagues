-- Tighten room-card access to require an existing room record even for Admins.
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
      and sr.round_date=ts.event_date and sr.course_name=ts.course_name
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
      and rm.id=p_room_id and sr.round_date=ts.event_date and sr.course_name=ts.course_name
      and public.resolve_canonical_player_id(reg.canonical_player_id)=v_player_id
      and (
        exists(select 1 from mga_regular.room_publication_rooms rp where rp.event_id=rm.event_id and rp.room_id=rm.id and rp.day_key=rm.day_key)
        or exists(select 1 from mga_regular.room_publications dp where dp.event_id=rm.event_id and dp.day_key=rm.day_key)
      )
  );
end;
$function$;
revoke all on function public.scoring_studio_room_access_v1(uuid,uuid,text,uuid,uuid) from public,anon;
grant execute on function public.scoring_studio_room_access_v1(uuid,uuid,text,uuid,uuid) to authenticated;

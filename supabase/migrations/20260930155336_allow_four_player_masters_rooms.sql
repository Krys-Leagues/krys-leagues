begin;

create or replace function public.save_major_schedule_group(
  p_id uuid,p_major_event_id uuid,p_play_day_id uuid,p_time_slot_id uuid,p_group_label text,p_competition text,
  p_location text,p_instructions text,p_admin_notes text,p_is_finalized boolean,p_is_published boolean,p_entry_ids uuid[]
)
returns public.major_schedule_groups language plpgsql security definer set search_path to '' as $function$
declare saved public.major_schedule_groups%rowtype; member_id uuid;
begin
  if not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required.' using errcode='42501'; end if;
  if nullif(btrim(p_group_label),'') is null then raise exception 'A room/group label is required.'; end if;
  if p_competition not in ('qualifying','main','secondary') then raise exception 'Invalid room competition.'; end if;
  if cardinality(coalesce(p_entry_ids,array[]::uuid[])) not between 1 and 4 then
    raise exception 'Masters rooms require 1 to 4 players.' using errcode='22023';
  end if;
  if cardinality(p_entry_ids) <> (select count(distinct entry_id) from unnest(p_entry_ids) as entry_id) then
    raise exception 'A player may appear only once in a Masters room.' using errcode='22023';
  end if;
  if not exists(select 1 from public.major_play_days where id=p_play_day_id and major_event_id=p_major_event_id)
    or not exists(select 1 from public.major_time_slots where id=p_time_slot_id and play_day_id=p_play_day_id)
  then raise exception 'Room day and time must belong to the selected Major.'; end if;
  insert into public.major_schedule_groups(id,major_event_id,play_day_id,time_slot_id,group_label,competition,location,instructions,admin_notes,is_finalized,is_published)
  values(coalesce(p_id,gen_random_uuid()),p_major_event_id,p_play_day_id,p_time_slot_id,btrim(p_group_label),p_competition,nullif(btrim(p_location),''),nullif(btrim(p_instructions),''),nullif(btrim(p_admin_notes),''),coalesce(p_is_finalized,false),coalesce(p_is_published,false))
  on conflict(id) do update set play_day_id=excluded.play_day_id,time_slot_id=excluded.time_slot_id,group_label=excluded.group_label,
    competition=excluded.competition,location=excluded.location,instructions=excluded.instructions,admin_notes=excluded.admin_notes,
    is_finalized=excluded.is_finalized,is_published=excluded.is_published,updated_at=now()
  where public.major_schedule_groups.major_event_id=p_major_event_id returning * into saved;
  if saved.id is null then raise exception 'Room/group does not belong to this Major.'; end if;
  delete from public.major_schedule_group_members where group_id=saved.id;
  foreach member_id in array p_entry_ids loop
    if not exists(select 1 from public.major_entries e join public.major_entry_day_choices c on c.entry_id=e.id
      where e.id=member_id and e.major_event_id=p_major_event_id and c.play_day_id=p_play_day_id and c.time_slot_id=p_time_slot_id)
    then raise exception 'Every assigned player must be registered and currently selected for this room time.'; end if;
    if p_competition in ('main','secondary') and not exists(select 1 from public.major_entry_weekend_status ws where ws.entry_id=member_id and ws.competition_status=p_competition)
    then raise exception 'Weekend room assignments must match each player''s staged weekend-field status.'; end if;
    insert into public.major_schedule_group_members(group_id,major_event_id,play_day_id,time_slot_id,entry_id)
    values(saved.id,p_major_event_id,p_play_day_id,p_time_slot_id,member_id);
  end loop;
  return saved;
end $function$;

revoke all on function public.save_major_schedule_group(uuid,uuid,uuid,uuid,text,text,text,text,text,boolean,boolean,uuid[]) from public,anon,authenticated;
grant execute on function public.save_major_schedule_group(uuid,uuid,uuid,uuid,text,text,text,text,text,boolean,boolean,uuid[]) to authenticated;

commit;

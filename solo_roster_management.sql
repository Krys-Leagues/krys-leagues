create or replace function public.save_solo_roster(
  p_roster_version_id uuid, p_entries jsonb
) returns table(id uuid, player_id uuid, player_screen_name text, division text, display_order integer)
language plpgsql security definer set search_path to '' as $function$
declare v_roster public.solo_roster_versions%rowtype;
begin
  if auth.uid() is null or not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required' using errcode='42501'; end if;
  if p_entries is null or jsonb_typeof(p_entries) <> 'array' then raise exception 'Roster entries must be a JSON array'; end if;
  select * into v_roster from public.solo_roster_versions where solo_roster_versions.id=p_roster_version_id for update;
  if not found then raise exception 'Solo roster version was not found'; end if;
  if v_roster.status <> 'draft' then raise exception 'Only a draft Solo roster can be edited'; end if;
  perform 1 from public.solo_roster_entries where roster_version_id=v_roster.id for update;
  if exists(select 1 from jsonb_to_recordset(p_entries) as x(player_id uuid, division text, display_order integer)
    where x.player_id is null or x.division not in ('Master','Elite','League 1','League 2','League 3','League 4') or x.display_order is null or x.display_order <= 0) then raise exception 'Every Solo roster entry requires a valid player, division, and order'; end if;
  if exists(select 1 from jsonb_to_recordset(p_entries) as x(player_id uuid, division text, display_order integer) group by x.player_id having count(*)>1) then raise exception 'A player may appear only once in a Solo roster'; end if;
  if exists(select 1 from jsonb_to_recordset(p_entries) as x(player_id uuid, division text, display_order integer) group by x.division,x.display_order having count(*)>1) then raise exception 'Division display order values must be unique'; end if;
  if exists(select 1 from jsonb_to_recordset(p_entries) as x(player_id uuid, division text, display_order integer) left join public.players p on p.id=x.player_id where p.id is null) then raise exception 'One or more selected players do not exist'; end if;
  if exists(select 1 from jsonb_to_recordset(p_entries) as x(player_id uuid, division text, display_order integer) join public.players p on p.id=x.player_id where lower(btrim(p.screen_name))='bye') then raise exception 'BYE is not a Solo player identity'; end if;
  delete from public.solo_roster_entries where roster_version_id=v_roster.id;
  insert into public.solo_roster_entries(roster_version_id,season_id,player_id,player_screen_name,division,display_order)
  select v_roster.id,v_roster.season_id,x.player_id,p.screen_name,x.division,x.display_order
  from jsonb_to_recordset(p_entries) as x(player_id uuid, division text, display_order integer) join public.players p on p.id=x.player_id;
  return query select e.id,e.player_id,e.player_screen_name,e.division,e.display_order from public.solo_roster_entries e where e.roster_version_id=v_roster.id order by e.division,e.display_order;
end;
$function$;
revoke all on function public.save_solo_roster(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.save_solo_roster(uuid,jsonb) to authenticated;

create or replace function public.approve_solo_roster_version(p_roster_version_id uuid, p_approval_note text default null)
returns table(season_id uuid, roster_version_id uuid, roster_status text, populated_player_count integer)
language plpgsql security definer set search_path to '' as $function$
declare v_roster public.solo_roster_versions%rowtype; v_count integer;
begin
  if auth.uid() is null or not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required' using errcode='42501'; end if;
  select * into v_roster from public.solo_roster_versions where id=p_roster_version_id for update;
  if not found then raise exception 'Solo roster version was not found'; end if;
  perform 1 from public.seasons where id=v_roster.season_id and lower(btrim(league_type))='solo' for update;
  if not found then raise exception 'Roster does not belong to a Solo season'; end if;
  if v_roster.status <> 'draft' then raise exception 'Only a draft Solo roster can be approved'; end if;
  perform 1 from public.solo_roster_entries where roster_version_id=v_roster.id for update;
  select count(*) into v_count from public.solo_roster_entries where roster_version_id=v_roster.id;
  if v_count=0 then raise exception 'Add at least one player before approving the Solo roster'; end if;
  if (select count(distinct player_id) from public.solo_roster_entries where roster_version_id=v_roster.id) <> v_count then raise exception 'A player may appear only once in a Solo roster'; end if;
  update public.solo_roster_versions set status='approved',approved_at=now(),approved_by=auth.uid(),approval_note=nullif(btrim(p_approval_note),'') where id=v_roster.id;
  return query select v_roster.season_id,v_roster.id,'approved'::text,v_count;
end;
$function$;
revoke all on function public.approve_solo_roster_version(uuid,text) from public, anon, authenticated;
grant execute on function public.approve_solo_roster_version(uuid,text) to authenticated;

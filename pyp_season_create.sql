create or replace function public.create_pyp_season_with_roster(
  p_season_number integer, p_division_count integer,
  p_start_date date, p_due_date date, p_end_date date
)
returns table(season_id uuid, roster_version_id uuid, season_number integer, division_count integer, first_division_number integer)
language plpgsql security definer set search_path to ''
as $function$
declare v_season_id uuid; v_roster_id uuid;
begin
  if not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required'; end if;
  if p_season_number is null or p_season_number <= 0 then raise exception 'Season number must be greater than zero'; end if;
  if p_division_count is null or p_division_count not between 1 and 20 then raise exception 'Division count must be between 1 and 20'; end if;
  if p_start_date is null or p_due_date is null or p_end_date is null then raise exception 'Start date, due date, and end date are required'; end if;
  if p_end_date < p_start_date then raise exception 'End date cannot be before the start date'; end if;
  if exists(select 1 from public.seasons s where lower(btrim(s.league_type))='pyp' and s.season_number=p_season_number)
    then raise exception 'PYP Season % already exists',p_season_number using errcode='23505'; end if;
  insert into public.seasons(league_type,season_number,start_date,due_date,end_date,is_active,is_locked)
  values('pyp',p_season_number,p_start_date,p_due_date,p_end_date,false,false) returning id into v_season_id;
  insert into public.pyp_roster_versions(season_id,division_count,status,source_final_scorecard_id)
  values(v_season_id,p_division_count,'draft',null) returning id into v_roster_id;
  insert into public.pyp_division_roster_slots(roster_version_id,season_id,division_number,slot_number,player_id,player_screen_name,slot_status)
  select v_roster_id,v_season_id,d,s,null::uuid,null::text,'empty'
  from generate_series(1,p_division_count) d cross join generate_series(1,4) s;
  return query select v_season_id,v_roster_id,p_season_number,p_division_count,1;
end;$function$;
revoke all on function public.create_pyp_season_with_roster(integer,integer,date,date,date) from public;
revoke all on function public.create_pyp_season_with_roster(integer,integer,date,date,date) from anon;
revoke all on function public.create_pyp_season_with_roster(integer,integer,date,date,date) from authenticated;
grant execute on function public.create_pyp_season_with_roster(integer,integer,date,date,date) to authenticated;

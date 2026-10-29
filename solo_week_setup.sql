create or replace function public.update_solo_week(
  p_season_id uuid, p_week_number integer, p_course_name text, p_due_date date
) returns public.solo_weeks
language plpgsql security definer set search_path to '' as $function$
declare v_week public.solo_weeks%rowtype;
begin
  if auth.uid() is null or not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required' using errcode='42501'; end if;
  if p_week_number not between 1 and 4 then raise exception 'Solo week number must be between 1 and 4'; end if;
  perform 1 from public.seasons where id=p_season_id and lower(btrim(league_type))='solo' for update;
  if not found then raise exception 'Managed Solo season was not found'; end if;
  select * into v_week from public.solo_weeks where season_id=p_season_id and week_number=p_week_number for update;
  if not found then raise exception 'Solo week was not found'; end if;
  if v_week.status <> 'open' then raise exception 'A closed Solo week cannot be edited'; end if;
  update public.solo_weeks set course_name=nullif(btrim(p_course_name),''),due_date=p_due_date where id=v_week.id returning * into v_week;
  return v_week;
end;
$function$;
revoke all on function public.update_solo_week(uuid,integer,text,date) from public, anon, authenticated;
grant execute on function public.update_solo_week(uuid,integer,text,date) to authenticated;

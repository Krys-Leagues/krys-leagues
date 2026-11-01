create or replace function public.create_solo_season_with_roster(
  p_season_number integer, p_start_date date, p_end_date date
) returns table(season_id uuid, roster_version_id uuid)
language plpgsql security definer set search_path to '' as $function$
declare v_season_id uuid; v_roster_id uuid;
begin
  if auth.uid() is null or not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required' using errcode='42501'; end if;
  if p_season_number is null or p_season_number <= 0 then raise exception 'Season number must be greater than zero'; end if;
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then raise exception 'Valid start and end dates are required'; end if;
  if exists(select 1 from public.seasons where lower(btrim(league_type))='solo' and season_number=p_season_number) then raise exception 'Solo Season % already exists', p_season_number using errcode='23505'; end if;
  insert into public.seasons(league_type, season_number, start_date, due_date, end_date, is_active, is_locked)
  values('solo', p_season_number, p_start_date, p_end_date, p_end_date, false, false) returning id into v_season_id;
  insert into public.solo_roster_versions(season_id, version_number, status) values(v_season_id, 1, 'draft') returning id into v_roster_id;
  insert into public.solo_weeks(season_id, week_number, status)
  select v_season_id, week_number, 'open' from generate_series(1,4) as week_number;
  return query select v_season_id, v_roster_id;
end;
$function$;
revoke all on function public.create_solo_season_with_roster(integer,date,date) from public, anon, authenticated;
grant execute on function public.create_solo_season_with_roster(integer,date,date) to authenticated;

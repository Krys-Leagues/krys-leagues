create or replace function public.update_pyp_season_details(
  p_season_id uuid,
  p_start_date date,
  p_end_date date
)
returns table(
  season_id uuid,
  season_number integer,
  division_count integer,
  roster_status text,
  start_date date,
  due_date date,
  end_date date,
  schedule_changes_detected boolean,
  change_revision integer
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_season public.seasons%rowtype;
  v_roster public.pyp_roster_versions%rowtype;
  v_details_changed boolean;
  v_change_revision integer := 0;
begin
  if not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode = '42501';
  end if;

  if p_season_id is null then
    raise exception 'Season ID is required';
  end if;

  if p_start_date is null then
    raise exception 'Start date is required';
  end if;

  if p_end_date is null then
    raise exception 'End date is required';
  end if;

  if p_end_date < p_start_date then
    raise exception 'End date cannot be before the start date';
  end if;

  select roster.*
  into v_roster
  from public.pyp_roster_versions as roster
  where roster.season_id = p_season_id
    and roster.status in ('draft', 'approved')
  order by case roster.status when 'draft' then 1 else 2 end
  limit 1
  for update;

  if not found then
    if exists (
      select 1
      from public.pyp_roster_versions as locked_roster
      where locked_roster.season_id = p_season_id
        and locked_roster.status = 'locked'
    ) then
      raise exception 'A locked historical PYP season cannot be changed'
        using errcode = '42501';
    end if;

    raise exception 'No editable draft or approved PYP roster was found for this season';
  end if;

  select season.*
  into v_season
  from public.seasons as season
  where season.id = p_season_id
  for update;

  if not found then
    raise exception 'The requested season was not found';
  end if;

  if lower(btrim(v_season.league_type)) is distinct from 'pyp' then
    raise exception 'The requested season is not a PYP season';
  end if;

  if exists (
    select 1
    from public.pyp_roster_versions as locked_roster
    where locked_roster.season_id = p_season_id
      and locked_roster.status = 'locked'
  ) then
    raise exception 'A locked historical PYP season cannot be changed'
      using errcode = '42501';
  end if;

  if v_roster.status = 'approved' then
    select schedule_state.change_revision
    into v_change_revision
    from public.pyp_schedule_state as schedule_state
    where schedule_state.season_id = p_season_id
    for update;

    if not found then
      raise exception 'Approved PYP roster has no schedule workflow state';
    end if;
  end if;

  v_details_changed :=
    v_season.start_date is distinct from p_start_date
    or v_season.due_date is distinct from p_end_date
    or v_season.end_date is distinct from p_end_date;

  if v_details_changed then
    update public.seasons as season
    set start_date = p_start_date,
        due_date = p_end_date,
        end_date = p_end_date
    where season.id = p_season_id
    returning season.* into v_season;
  end if;

  if v_roster.status = 'approved' and v_details_changed then
    update public.pyp_schedule_state as schedule_state
    set change_revision = schedule_state.change_revision + 1
    where schedule_state.season_id = p_season_id
    returning schedule_state.change_revision into v_change_revision;

    if not found then
      raise exception 'Approved PYP roster has no schedule workflow state';
    end if;
  end if;

  return query
  select
    v_season.id,
    v_season.season_number,
    v_roster.division_count,
    v_roster.status,
    v_season.start_date,
    v_season.due_date,
    v_season.end_date,
    v_roster.status = 'approved' and v_details_changed,
    v_change_revision;
end;
$function$;

revoke all on function public.update_pyp_season_details(uuid, date, date) from public;
revoke all on function public.update_pyp_season_details(uuid, date, date) from anon;
revoke all on function public.update_pyp_season_details(uuid, date, date) from authenticated;
grant execute on function public.update_pyp_season_details(uuid, date, date) to authenticated;

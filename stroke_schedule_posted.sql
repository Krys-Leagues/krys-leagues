create or replace function public.mark_stroke_schedule_posted(
  p_season_id uuid
)
returns table(
  season_id uuid,
  roster_version_id uuid,
  change_revision integer,
  generated_revision integer,
  reviewed_revision integer,
  posted_revision integer,
  posted_at timestamptz,
  posted_by uuid
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_roster public.stroke_roster_versions%rowtype;
  v_state public.stroke_schedule_state%rowtype;
begin
  if not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required';
  end if;

  if p_season_id is null then
    raise exception 'Season ID is required';
  end if;

  select roster.*
  into v_roster
  from public.stroke_roster_versions as roster
  where roster.season_id = p_season_id
    and roster.status = 'approved'
  for update;

  if not found then
    raise exception 'Exactly one approved Stroke roster is required';
  end if;

  if exists (
    select 1
    from public.stroke_roster_versions as other_roster
    where other_roster.season_id = p_season_id
      and other_roster.status = 'approved'
      and other_roster.id <> v_roster.id
  ) then
    raise exception 'Exactly one approved Stroke roster is required';
  end if;

  perform 1
  from public.seasons as season
  where season.id = p_season_id
    and lower(btrim(season.league_type)) = 'stroke'
  for share;

  if not found then
    raise exception 'The requested season is not a Stroke season';
  end if;

  select schedule_state.*
  into v_state
  from public.stroke_schedule_state as schedule_state
  where schedule_state.season_id = p_season_id
  for update;

  if not found then
    raise exception 'Stroke schedule workflow state was not found';
  end if;

  if v_state.generated_revision <= 0
     or v_state.generated_revision <> v_state.change_revision
     or v_state.reviewed_revision <> v_state.change_revision then
    raise exception 'Only a current reviewed Stroke schedule can be marked posted';
  end if;

  if v_state.posted_revision = v_state.change_revision then
    raise exception 'This Stroke schedule revision was already posted to Discord';
  end if;

  update public.stroke_schedule_state as schedule_state
  set
    posted_revision = schedule_state.change_revision,
    posted_at = now(),
    posted_by = v_user_id
  where schedule_state.season_id = p_season_id
    and schedule_state.change_revision = v_state.change_revision
    and schedule_state.generated_revision = v_state.change_revision
    and schedule_state.reviewed_revision = v_state.change_revision
    and schedule_state.posted_revision <> v_state.change_revision
  returning schedule_state.* into v_state;

  if not found then
    raise exception 'Stroke schedule workflow changed before posting could be recorded';
  end if;

  return query
  select
    p_season_id,
    v_roster.id,
    v_state.change_revision,
    v_state.generated_revision,
    v_state.reviewed_revision,
    v_state.posted_revision,
    v_state.posted_at,
    v_state.posted_by;
end;
$function$;

revoke all on function public.mark_stroke_schedule_posted(uuid) from public;
revoke all on function public.mark_stroke_schedule_posted(uuid) from anon;
revoke all on function public.mark_stroke_schedule_posted(uuid) from authenticated;
grant execute on function public.mark_stroke_schedule_posted(uuid) to authenticated;

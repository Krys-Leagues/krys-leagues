-- Install after all_time_records_generic_course_import.sql.
-- Additive normal All-Time entry, card history, correction, and Climbers layer.
-- This file is intentionally not executed by the application.
begin;

alter table public.all_time_courses
  add column if not exists par integer,
  add column if not exists hole_pars jsonb;

alter table public.all_time_record_observations
  alter column batch_id drop not null,
  add column if not exists entry_type text not null default 'historical_import',
  add column if not exists hole_strokes jsonb,
  add column if not exists source_label text,
  add column if not exists provenance_reference text,
  add column if not exists notes text,
  add column if not exists recorded_by uuid references auth.users(id) on delete restrict,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists entry_key uuid default gen_random_uuid(),
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references auth.users(id) on delete restrict,
  add column if not exists void_reason text,
  add column if not exists corrected_at timestamptz,
  add column if not exists corrected_by uuid references auth.users(id) on delete restrict;

update public.all_time_record_observations
set entry_key = gen_random_uuid()
where entry_key is null;

alter table public.all_time_record_observations
  alter column entry_key set not null;

alter table public.all_time_record_observations
  drop constraint if exists all_time_observation_entry_type_check;
alter table public.all_time_record_observations
  add constraint all_time_observation_entry_type_check
  check (entry_type in ('historical_import','full_card','quick_score','authoritative_league_source'));

create unique index if not exists all_time_observation_entry_key_uidx
  on public.all_time_record_observations(entry_key);
create index if not exists all_time_observation_active_player_course_idx
  on public.all_time_record_observations(player_id,course_id,score,observed_at)
  where player_id is not null and voided_at is null;

create table if not exists public.all_time_correction_audit (
  id uuid primary key default gen_random_uuid(),
  observation_id uuid not null references public.all_time_record_observations(id) on delete restrict,
  course_id uuid not null references public.all_time_courses(id) on delete restrict,
  player_id uuid not null references public.players(id) on delete restrict,
  action text not null check (action in ('EDIT','VOID')),
  old_values jsonb not null,
  new_values jsonb,
  reason text not null check (btrim(reason) <> ''),
  changed_by uuid not null references auth.users(id) on delete restrict,
  changed_at timestamptz not null default now()
);
create index if not exists all_time_correction_audit_observation_idx
  on public.all_time_correction_audit(observation_id,changed_at desc);

create table if not exists public.climbers_seasons (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'upcoming' check (status in ('upcoming','active','awaiting_finalization','finalized')),
  finalized_at timestamptz,
  finalized_by uuid references auth.users(id) on delete restrict,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists climbers_seasons_status_dates_idx
  on public.climbers_seasons(status,starts_at,ends_at);

create table if not exists public.climbers_events (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.climbers_seasons(id) on delete restrict,
  observation_id uuid not null unique references public.all_time_record_observations(id) on delete restrict,
  player_id uuid not null references public.players(id) on delete restrict,
  course_id uuid not null references public.all_time_courses(id) on delete restrict,
  difficulty text not null check (difficulty in ('Easy','Hard')),
  old_pb_score integer,
  new_pb_score integer not null,
  points integer not null check (points >= 0),
  calculation_version text not null default 'climbers-v1',
  source_label text,
  provenance_reference text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references auth.users(id) on delete restrict,
  void_reason text
);
create index if not exists climbers_events_season_points_idx
  on public.climbers_events(season_id,points desc,player_id)
  where voided_at is null;

create table if not exists public.climbers_event_passes (
  event_id uuid not null references public.climbers_events(id) on delete restrict,
  passed_player_id uuid not null references public.players(id) on delete restrict,
  primary key (event_id,passed_player_id)
);

create or replace view public.climbers_standings as
select e.season_id,e.player_id,sum(e.points)::integer as points,count(*)::integer as event_count,
  rank() over (partition by e.season_id order by sum(e.points) desc) as rank
from public.climbers_events e
where e.voided_at is null
group by e.season_id,e.player_id;

create or replace view public.climbers_year_to_date as
select e.player_id,sum(e.points)::integer as points,count(*)::integer as event_count
from public.climbers_events e
where e.voided_at is null and e.created_at >= date_trunc('year',now())
group by e.player_id;

create or replace function public.refresh_all_time_best_record(p_course_id uuid,p_player_id uuid)
returns void language plpgsql security definer set search_path to '' as $function$
declare v_best public.all_time_record_observations%rowtype;
begin
  select * into v_best from public.all_time_record_observations o
  where o.course_id=p_course_id and o.player_id=p_player_id and o.identity_status='resolved' and o.voided_at is null
  order by o.score,o.observed_at,o.id limit 1;
  if not found then
    delete from public.all_time_best_records where course_id=p_course_id and player_id=p_player_id;
    return;
  end if;
  insert into public.all_time_best_records(course_id,player_id,best_observation_id,score,historical_player_name,first_recorded_at,updated_at)
  values(v_best.course_id,v_best.player_id,v_best.id,v_best.score,v_best.historical_player_name,v_best.observed_at,now())
  on conflict (player_id,course_id) do update set best_observation_id=excluded.best_observation_id,score=excluded.score,
    historical_player_name=excluded.historical_player_name,updated_at=now();
end;$function$;
revoke all on function public.refresh_all_time_best_record(uuid,uuid) from public,anon,authenticated;

-- A normal All-Time score must never create a Climbers season implicitly.
-- Seasons are explicit admin state; this helper is retained only for callers
-- that may already reference the earlier function name, but it no longer
-- creates a season automatically.
create or replace function public.ensure_active_climbers_season()
returns uuid language plpgsql security definer set search_path to '' as $function$
declare v_season_id uuid;
begin
  select id into v_season_id from public.climbers_seasons
  where status='active' and starts_at<=now() and ends_at>now()
  order by starts_at desc limit 1;
  return v_season_id;
end;$function$;
revoke all on function public.ensure_active_climbers_season() from public,anon,authenticated;

create or replace function public.record_all_time_normal_entry(
  p_course_id uuid,p_player_id uuid,p_entry_key uuid,p_fingerprint text,p_score integer,
  p_hole_strokes jsonb,p_entry_type text,p_source_label text,p_provenance_reference text,p_notes text
) returns jsonb language plpgsql security definer set search_path to '' as $function$
declare
  v_user_id uuid:=auth.uid(); v_course public.all_time_courses%rowtype; v_player public.players%rowtype;
  v_existing_score integer; v_existing_fingerprint text; v_classification text; v_score integer:=p_score; v_observation_id uuid;
  v_season_id uuid; v_event_id uuid; v_points integer:=0; v_passed uuid[]:=array[]::uuid[]; v_pars integer[]; v_strokes integer[];
begin
  if v_user_id is null or not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required' using errcode='42501'; end if;
  if p_entry_key is null or p_fingerprint is null or lower(p_fingerprint)!~'^[0-9a-f]{64}$' then raise exception 'Entry idempotency key and fingerprint are required'; end if;
  if p_entry_type not in ('full_card','quick_score') then raise exception 'Unsupported normal All-Time entry type'; end if;
  select * into v_course from public.all_time_courses where id=p_course_id and active and difficulty in ('Easy','Hard') for update;
  if not found then raise exception 'The selected Easy/Hard course is unavailable'; end if;
  select * into v_player from public.players where id=public.resolve_canonical_player_id(p_player_id);
  if not found then raise exception 'The selected canonical player is unavailable'; end if;
  if exists(select 1 from public.all_time_record_observations where entry_key=p_entry_key) then
    select id,score,fingerprint into v_observation_id,v_score,v_existing_fingerprint from public.all_time_record_observations where entry_key=p_entry_key;
    if v_existing_fingerprint<>lower(p_fingerprint) then raise exception 'This idempotency key is already bound to a different entry'; end if;
    return jsonb_build_object('action','already_saved','observation_id',v_observation_id,'current_best_score',v_score,'climbers_points',0);
  end if;
  select id,score into v_observation_id,v_score from public.all_time_record_observations where fingerprint=lower(p_fingerprint) limit 1;
  if found then
    return jsonb_build_object('action','already_saved','observation_id',v_observation_id,'current_best_score',v_score,'climbers_points',0);
  end if;
  if p_entry_type='full_card' then
    if p_hole_strokes is null or jsonb_typeof(p_hole_strokes)<>'array' or jsonb_array_length(p_hole_strokes)<>18 or v_course.par is null or v_course.hole_pars is null or jsonb_typeof(v_course.hole_pars)<>'array' or jsonb_array_length(v_course.hole_pars)<>18 then
      raise exception 'Full-card entry requires 18 hole scores and 18 authoritative hole pars';
    end if;
    if exists(select 1 from jsonb_array_elements(p_hole_strokes) value where jsonb_typeof(value)<>'number' or value::text !~ '^[0-9]+$' or value::text::integer<1) then raise exception 'Hole scores must be positive whole numbers'; end if;
    if exists(select 1 from jsonb_array_elements(v_course.hole_pars) value where jsonb_typeof(value)<>'number' or value::text !~ '^[0-9]+$' or value::text::integer<1) then raise exception 'Course hole pars must be positive whole numbers'; end if;
    if (select sum(value::text::integer) from jsonb_array_elements(v_course.hole_pars))<>v_course.par then raise exception 'Course hole pars must total the authoritative course par'; end if;
    v_score:=(select sum(value::text::integer) from jsonb_array_elements(p_hole_strokes)) - (select sum(value::text::integer) from jsonb_array_elements(v_course.hole_pars));
  elsif v_score is null then raise exception 'Quick Score requires a score relative to par'; end if;
  perform public.refresh_all_time_best_record(p_course_id,v_player.id);
  select score into v_existing_score from public.all_time_best_records where course_id=p_course_id and player_id=v_player.id for update;
  if not found then v_classification:='FIRST';
  elsif v_score<v_existing_score then v_classification:='BETTER';
  elsif v_score=v_existing_score then v_classification:='EQUAL';
  else v_classification:='WORSE'; end if;
  if v_classification='BETTER' then
    select coalesce(array_agg(best.player_id order by best.score,best.player_id),'{}'::uuid[]),count(*)::integer
    into v_passed,v_points from public.all_time_best_records best
    where best.course_id=p_course_id and best.player_id<>v_player.id and best.score > v_score;
  end if;
  insert into public.all_time_record_observations(batch_id,course_id,player_id,identity_status,historical_player_name,score,source_course_name,source_row,fingerprint,observed_at,metadata,entry_type,hole_strokes,source_label,provenance_reference,notes,recorded_by,entry_key)
  values(null,p_course_id,v_player.id,'resolved',v_player.screen_name,v_score,v_course.display_name,null,lower(p_fingerprint),now(),jsonb_build_object('entry_method',p_entry_type),p_entry_type,nullif(p_hole_strokes,'null'::jsonb),nullif(btrim(p_source_label),''),nullif(btrim(p_provenance_reference),''),nullif(btrim(p_notes),''),v_user_id,p_entry_key)
  returning id into v_observation_id;
  if v_classification in ('FIRST','BETTER') then perform public.refresh_all_time_best_record(p_course_id,v_player.id); end if;
  if v_classification in ('FIRST','BETTER') then
    -- A future active season may receive a PB event. With no active season,
    -- the All-Time observation is still saved and no Climbers season/event is
    -- created implicitly; the points effect remains zero for this entry.
    select id into v_season_id from public.climbers_seasons
    where status='active' and starts_at<=now() and ends_at>now()
    order by starts_at desc limit 1;
    if v_season_id is not null then
      insert into public.climbers_events(season_id,observation_id,player_id,course_id,difficulty,old_pb_score,new_pb_score,points,calculation_version,source_label,provenance_reference,created_by)
      values(v_season_id,v_observation_id,v.player_id,p_course_id,v_course.difficulty,v_existing_score,v_score,v_points,'climbers-v1',p_source_label,p_provenance_reference,v_user_id) returning id into v_event_id;
      insert into public.climbers_event_passes(event_id,passed_player_id) select v_event_id,passed from unnest(v_passed) passed;
    else
      v_points:=0;
    end if;
  end if;
  return jsonb_build_object('action',lower(v_classification),'observation_id',v_observation_id,'current_best_score',case when v_classification in ('FIRST','BETTER') then v_score else v_existing_score end,'climbers_points',v_points,'climbers_event_id',v_event_id,'passed_player_ids',to_jsonb(v_passed));
end;$function$;
revoke all on function public.record_all_time_normal_entry(uuid,uuid,uuid,text,integer,jsonb,text,text,text,text) from public,anon,authenticated;
grant execute on function public.record_all_time_normal_entry(uuid,uuid,uuid,text,integer,jsonb,text,text,text,text) to authenticated;

create or replace function public.correct_all_time_record_entry(
  p_observation_id uuid,p_expected_updated_at timestamptz,p_new_score integer,p_new_hole_strokes jsonb,p_reason text
) returns public.all_time_record_observations language plpgsql security definer set search_path to '' as $function$
declare v_user_id uuid:=auth.uid(); v_old public.all_time_record_observations%rowtype; v_result public.all_time_record_observations%rowtype; v_course public.all_time_courses%rowtype; v_new_score integer:=p_new_score; v_season_status text; v_event_id uuid; v_best_observation_id uuid; v_points integer; v_passed uuid[];
begin
  if v_user_id is null or not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required' using errcode='42501'; end if;
  if nullif(btrim(p_reason),'') is null then raise exception 'A correction reason is required'; end if;
  select * into v_old from public.all_time_record_observations where id=p_observation_id for update;
  if not found or v_old.voided_at is not null then raise exception 'Active All-Time observation was not found'; end if;
  if v_old.updated_at is distinct from p_expected_updated_at then raise exception 'This record changed before correction; reload and review again'; end if;
  select * into v_course from public.all_time_courses where id=v_old.course_id;
  if v_old.entry_type='full_card' then
    if p_new_hole_strokes is null or jsonb_typeof(p_new_hole_strokes)<>'array' or jsonb_array_length(p_new_hole_strokes)<>18 or v_course.par is null or v_course.hole_pars is null or jsonb_typeof(v_course.hole_pars)<>'array' or jsonb_array_length(v_course.hole_pars)<>18 then raise exception 'Corrected full card requires authoritative 18-hole pars'; end if;
    if exists(select 1 from jsonb_array_elements(p_new_hole_strokes) value where jsonb_typeof(value)<>'number' or value::text !~ '^[0-9]+$' or value::text::integer<1) then raise exception 'Corrected hole scores must be positive whole numbers'; end if;
    if exists(select 1 from jsonb_array_elements(v_course.hole_pars) value where jsonb_typeof(value)<>'number' or value::text !~ '^[0-9]+$' or value::text::integer<1) then raise exception 'Course hole pars must be positive whole numbers'; end if;
    if (select sum(value::text::integer) from jsonb_array_elements(v_course.hole_pars))<>v_course.par then raise exception 'Course hole pars must total the authoritative course par'; end if;
    v_new_score:=(select sum(value::text::integer) from jsonb_array_elements(p_new_hole_strokes)) - v_course.par;
  elsif v_new_score is null then raise exception 'Quick Score correction requires a score'; end if;
  select e.id,s.status into v_event_id,v_season_status from public.climbers_events e join public.climbers_seasons s on s.id=e.season_id where e.observation_id=v_old.id and e.voided_at is null;
  if v_season_status='finalized' then raise exception 'This record is linked to a finalized Climbers season and needs a separate reviewed correction'; end if;
  insert into public.all_time_correction_audit(observation_id,course_id,player_id,action,old_values,new_values,reason,changed_by)
  values(v_old.id,v_old.course_id,v_old.player_id,'EDIT',jsonb_build_object('score',v_old.score,'hole_strokes',v_old.hole_strokes),jsonb_build_object('score',v_new_score,'hole_strokes',p_new_hole_strokes),btrim(p_reason),v_user_id);
  update public.all_time_record_observations set score=v_new_score,hole_strokes=case when v_old.entry_type='full_card' then p_new_hole_strokes else hole_strokes end,corrected_at=now(),corrected_by=v_user_id,updated_at=now() where id=v_old.id returning * into v_result;
  perform public.refresh_all_time_best_record(v_old.course_id,v_old.player_id);
  if v_event_id is not null then
    select best_observation_id into v_best_observation_id from public.all_time_best_records where course_id=v_old.course_id and player_id=v_old.player_id;
    if v_best_observation_id=v_old.id then
      select coalesce(array_agg(best.player_id order by best.score,best.player_id),'{}'::uuid[]),count(*)::integer into v_passed,v_points
      from public.all_time_best_records best where best.course_id=v_old.course_id and best.player_id<>v_old.player_id and best.score>v_new_score;
      update public.climbers_events set new_pb_score=v_new_score,points=v_points,voided_at=null,voided_by=null,void_reason=null where id=v_event_id;
      delete from public.climbers_event_passes where event_id=v_event_id;
      insert into public.climbers_event_passes(event_id,passed_player_id) select v_event_id,passed from unnest(v_passed) passed;
    else
      update public.climbers_events set voided_at=now(),voided_by=v_user_id,void_reason='Linked All-Time entry corrected: '||btrim(p_reason) where id=v_event_id;
    end if;
  end if;
  return v_result;
end;$function$;
revoke all on function public.correct_all_time_record_entry(uuid,timestamptz,integer,jsonb,text) from public,anon,authenticated;
grant execute on function public.correct_all_time_record_entry(uuid,timestamptz,integer,jsonb,text) to authenticated;

create or replace function public.void_all_time_record_entry(p_observation_id uuid,p_expected_updated_at timestamptz,p_reason text)
returns public.all_time_record_observations language plpgsql security definer set search_path to '' as $function$
declare v_user_id uuid:=auth.uid(); v_old public.all_time_record_observations%rowtype; v_result public.all_time_record_observations%rowtype; v_season_status text;
begin
  if v_user_id is null or not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required' using errcode='42501'; end if;
  if nullif(btrim(p_reason),'') is null then raise exception 'A void reason is required'; end if;
  select * into v_old from public.all_time_record_observations where id=p_observation_id for update;
  if not found or v_old.voided_at is not null then raise exception 'Active All-Time observation was not found'; end if;
  if v_old.updated_at is distinct from p_expected_updated_at then raise exception 'This record changed before void; reload and review again'; end if;
  select s.status into v_season_status from public.climbers_events e join public.climbers_seasons s on s.id=e.season_id where e.observation_id=v_old.id and e.voided_at is null;
  if v_season_status='finalized' then raise exception 'This record is linked to a finalized Climbers season and needs a separate reviewed correction'; end if;
  insert into public.all_time_correction_audit(observation_id,course_id,player_id,action,old_values,new_values,reason,changed_by)
  values(v_old.id,v_old.course_id,v_old.player_id,'VOID',jsonb_build_object('score',v_old.score,'hole_strokes',v_old.hole_strokes),null,btrim(p_reason),v_user_id);
  update public.all_time_record_observations set voided_at=now(),voided_by=v_user_id,void_reason=btrim(p_reason),updated_at=now() where id=v_old.id returning * into v_result;
  update public.climbers_events set voided_at=now(),voided_by=v_user_id,void_reason='Linked All-Time entry voided: '||btrim(p_reason) where observation_id=v_old.id and voided_at is null;
  perform public.refresh_all_time_best_record(v_old.course_id,v_old.player_id);
  return v_result;
end;$function$;
revoke all on function public.void_all_time_record_entry(uuid,timestamptz,text) from public,anon,authenticated;
grant execute on function public.void_all_time_record_entry(uuid,timestamptz,text) to authenticated;

create or replace function public.create_climbers_season(p_label text,p_starts_at timestamptz,p_ends_at timestamptz)
returns public.climbers_seasons language plpgsql security definer set search_path to '' as $function$
declare v public.climbers_seasons%rowtype;
begin
  if auth.uid() is null or not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required' using errcode='42501'; end if;
  if nullif(btrim(p_label),'') is null or p_ends_at<=p_starts_at then raise exception 'Valid Climbers season dates are required'; end if;
  insert into public.climbers_seasons(label,starts_at,ends_at,status,created_by) values(btrim(p_label),p_starts_at,p_ends_at,case when p_starts_at<=now() and p_ends_at>now() then 'active' else 'upcoming' end,auth.uid()) returning * into v;
  return v;
end;$function$;
revoke all on function public.create_climbers_season(text,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.create_climbers_season(text,timestamptz,timestamptz) to authenticated;

create or replace function public.finalize_climbers_season(p_season_id uuid)
returns public.climbers_seasons language plpgsql security definer set search_path to '' as $function$
declare v public.climbers_seasons%rowtype;
begin
  if auth.uid() is null or not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required' using errcode='42501'; end if;
  update public.climbers_seasons set status='finalized',finalized_at=now(),finalized_by=auth.uid() where id=p_season_id and status in ('active','awaiting_finalization') returning * into v;
  if not found then raise exception 'Only an active or awaiting-finalization Climbers season can be finalized'; end if;
  return v;
end;$function$;
revoke all on function public.finalize_climbers_season(uuid) from public,anon,authenticated;
grant execute on function public.finalize_climbers_season(uuid) to authenticated;

alter table public.all_time_correction_audit enable row level security;
alter table public.climbers_seasons enable row level security;
alter table public.climbers_events enable row level security;
alter table public.climbers_event_passes enable row level security;
drop policy if exists all_time_correction_audit_admin_select on public.all_time_correction_audit;
create policy all_time_correction_audit_admin_select on public.all_time_correction_audit for select to authenticated using (public.is_current_user_site_admin());
drop policy if exists climbers_seasons_admin_select on public.climbers_seasons;
create policy climbers_seasons_admin_select on public.climbers_seasons for select to authenticated using (public.is_current_user_site_admin());
drop policy if exists climbers_events_admin_select on public.climbers_events;
create policy climbers_events_admin_select on public.climbers_events for select to authenticated using (public.is_current_user_site_admin());
drop policy if exists climbers_event_passes_admin_select on public.climbers_event_passes;
create policy climbers_event_passes_admin_select on public.climbers_event_passes for select to authenticated using (public.is_current_user_site_admin());
grant select on public.all_time_correction_audit,public.climbers_seasons,public.climbers_events,public.climbers_event_passes,public.climbers_standings,public.climbers_year_to_date to authenticated;
revoke insert,update,delete on public.all_time_correction_audit,public.climbers_seasons,public.climbers_events,public.climbers_event_passes from public,anon,authenticated;

commit;

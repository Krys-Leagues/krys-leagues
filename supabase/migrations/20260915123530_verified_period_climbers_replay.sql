-- Verified-period backlog entries are recorded with source-backed chronology
-- and replayed atomically. This migration is never run by the application.
begin;

do $$
begin
  if to_regclass('public.all_time_record_observations') is null
     or to_regclass('public.all_time_verified_period_audit') is null
     or to_regclass('public.climbers_events') is null
     or to_regclass('public.climbers_event_passes') is null
     or to_regclass('public.climbers_seasons') is null
     or to_regprocedure('public.is_current_user_site_admin()') is null
     or to_regprocedure('public.resolve_canonical_player_id(uuid)') is null
     or to_regprocedure('public.refresh_all_time_best_record(uuid,uuid)') is null then
    raise exception 'Install the existing All-Time, Climbers, and verified-period layers first';
  end if;
end;
$$;

alter table public.all_time_record_observations
  add column if not exists verified_source_batch_id uuid;

create index if not exists all_time_observations_verified_period_source_idx
  on public.all_time_record_observations(
    verified_period_id,authoritative_submitted_date,authoritative_submission_order,verified_source_batch_id,id
  ) where entry_type='verified_period' and voided_at is null;

alter table public.all_time_verified_period_audit
  add column if not exists authoritative_submitted_at timestamptz,
  add column if not exists authoritative_submitted_date date,
  add column if not exists authoritative_submission_order integer,
  add column if not exists authoritative_time_precision text,
  add column if not exists verified_source_batch_id uuid,
  add column if not exists passed_player_ids uuid[] not null default '{}'::uuid[],
  add column if not exists calculation_version text not null default 'climbers-verified-period-v2',
  add column if not exists calculated_at timestamptz;

alter table public.all_time_verified_period_audit
  drop constraint if exists all_time_verified_period_audit_climbers_points_check,
  drop constraint if exists all_time_verified_period_audit_climbers_status_check;
alter table public.all_time_verified_period_audit
  add constraint all_time_verified_period_audit_climbers_points_check check (climbers_points>=0),
  add constraint all_time_verified_period_audit_climbers_status_check
    check (climbers_status in ('pending_period_replay','replayed','blocked','voided'));

create or replace function public.sync_all_time_verified_period_audit()
returns trigger language plpgsql security definer set search_path to '' as $function$
begin
  if old.entry_type='verified_period' then
    update public.all_time_verified_period_audit
    set submitted_score=new.score,
        new_pb_score=null,
        passed_player_ids='{}'::uuid[],
        climbers_points=0,
        climbers_status=case when new.voided_at is null then 'pending_period_replay' else 'voided' end,
        calculated_at=null,
        updated_at=clock_timestamp()
    where observation_id=new.id;
  end if;
  return new;
end;
$function$;

create or replace function public.replay_climbers_verified_period(p_period_id uuid)
returns jsonb language plpgsql security definer set search_path to '' as $function$
declare
  v_user_id uuid:=auth.uid(); v_season public.climbers_seasons%rowtype;
  v_unit record; v_row record; v_effect record; v_old integer; v_classification text;
  v_event_id uuid; v_existing_points integer; v_passed uuid[]; v_points integer;
  v_replayed integer:=0; v_zero_effect integer:=0;
begin
  if v_user_id is null or not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode='42501';
  end if;
  select * into v_season from public.climbers_seasons where id=p_period_id for update;
  if not found then raise exception 'Climbers period was not found'; end if;
  if v_season.status='finalized' then raise exception 'A finalized Climbers period cannot be replayed'; end if;
  if v_season.ends_at>clock_timestamp() then raise exception 'Verified-period replay requires a completed Climbers period'; end if;

  if exists (
    select 1 from public.all_time_record_observations o
    where o.entry_type='verified_period' and o.verified_period_id=p_period_id and o.voided_at is null
      and (o.authoritative_time_precision not in ('exact','date_ordered')
        or o.authoritative_submitted_date is null or o.verified_source_batch_id is null
        or (o.authoritative_time_precision='exact' and o.authoritative_submitted_at is null)
        or (o.authoritative_time_precision='date_ordered' and coalesce(o.authoritative_submission_order,0)<1))
  ) then
    update public.all_time_verified_period_audit set climbers_status='blocked',updated_at=clock_timestamp()
    where verified_period_id=p_period_id and climbers_status<>'voided';
    raise exception 'Every verified-period entry needs source-backed chronology before replay';
  end if;
  if exists (
    select 1
    from public.all_time_record_observations a
    join public.all_time_record_observations b
      on a.id<b.id and a.verified_period_id=b.verified_period_id
     and a.authoritative_submitted_date=b.authoritative_submitted_date
     and a.authoritative_submission_order=b.authoritative_submission_order
     and a.verified_source_batch_id<>b.verified_source_batch_id
    where a.entry_type='verified_period' and b.entry_type='verified_period'
      and a.verified_period_id=p_period_id and a.voided_at is null and b.voided_at is null
      and a.authoritative_time_precision='date_ordered' and b.authoritative_time_precision='date_ordered'
  ) then
    raise exception 'Separate verified sources share the same date/order; correct the authoritative source order before replay';
  end if;
  if exists (
    select 1
    from public.all_time_record_observations verified
    join public.all_time_record_observations other
      on other.id<>verified.id
     and other.authoritative_submitted_date=verified.authoritative_submitted_date
     and other.authoritative_submission_order=verified.authoritative_submission_order
    where verified.entry_type='verified_period' and verified.verified_period_id=p_period_id
      and verified.voided_at is null and other.voided_at is null
      and verified.authoritative_time_precision='date_ordered' and other.authoritative_time_precision='date_ordered'
      and (other.entry_type<>'verified_period' or other.verified_source_batch_id<>verified.verified_source_batch_id)
  ) then
    raise exception 'Verified and existing sources share the same date/order; correct the authoritative source order before replay';
  end if;
  if exists (
    select 1
    from public.all_time_record_observations verified
    join public.all_time_record_observations other
      on other.id<>verified.id and other.authoritative_submitted_at=verified.authoritative_submitted_at
    where verified.entry_type='verified_period' and verified.verified_period_id=p_period_id
      and verified.voided_at is null and other.voided_at is null
      and verified.authoritative_time_precision='exact' and other.authoritative_time_precision='exact'
      and (other.entry_type<>'verified_period' or other.verified_source_batch_id<>verified.verified_source_batch_id)
  ) then
    raise exception 'Verified and existing sources share an exact timestamp without shared-card evidence';
  end if;
  if exists (
    select 1
    from public.all_time_record_observations verified
    join public.all_time_record_observations other
      on other.id<>verified.id
     and other.authoritative_submitted_date=verified.authoritative_submitted_date
    where verified.entry_type='verified_period' and verified.verified_period_id=p_period_id
      and verified.voided_at is null and other.voided_at is null
      and verified.authoritative_time_precision<>other.authoritative_time_precision
      and verified.authoritative_time_precision in ('exact','date_ordered')
      and other.authoritative_time_precision in ('exact','date_ordered')
  ) then
    raise exception 'Exact-time and date/order sources are mixed on one date; supply one authoritative chronology before replay';
  end if;

  create temp table verified_period_pb(
    course_id uuid,player_id uuid,score integer,primary key(course_id,player_id)
  ) on commit drop;
  insert into verified_period_pb(course_id,player_id,score)
  select o.course_id,o.player_id,min(o.score)
  from public.all_time_record_observations o
  where o.entry_type='historical_import' and o.identity_status='resolved'
    and o.player_id is not null and o.voided_at is null
  group by o.course_id,o.player_id;
  insert into verified_period_pb(course_id,player_id,score)
  select o.course_id,o.player_id,min(o.score)
  from public.all_time_record_observations o
  where o.entry_type<>'historical_import' and o.identity_status='resolved'
    and o.player_id is not null and o.voided_at is null
    and o.authoritative_submitted_date<v_season.starts_at::date
  group by o.course_id,o.player_id
  on conflict(course_id,player_id) do update set score=least(verified_period_pb.score,excluded.score);

  create temp table verified_period_units(
    unit_key text primary key,source_batch_id uuid,representative_id uuid,
    effective_date date not null,effective_at timestamptz,effective_order integer,
    effective_time_precision text not null
  ) on commit drop;
  insert into verified_period_units(unit_key,source_batch_id,representative_id,effective_date,effective_at,effective_order,effective_time_precision)
  select distinct on (case when o.entry_type='verified_period' then 'verified:'||o.verified_source_batch_id::text else 'observation:'||o.id::text end)
    case when o.entry_type='verified_period' then 'verified:'||o.verified_source_batch_id::text else 'observation:'||o.id::text end,
    case when o.entry_type='verified_period' then o.verified_source_batch_id else null end,o.id,
    o.authoritative_submitted_date,o.authoritative_submitted_at,o.authoritative_submission_order,o.authoritative_time_precision
  from public.all_time_record_observations o
  where o.voided_at is null and o.identity_status='resolved' and o.player_id is not null
    and o.authoritative_submitted_date>=v_season.starts_at::date
    and o.authoritative_submitted_date<v_season.ends_at::date
  order by case when o.entry_type='verified_period' then 'verified:'||o.verified_source_batch_id::text else 'observation:'||o.id::text end,o.id;

  create temp table verified_period_effects(
    observation_id uuid primary key,course_id uuid,player_id uuid,old_pb_score integer,
    submitted_score integer,classification text,new_pb_score integer,
    passed_player_ids uuid[],climbers_points integer
  ) on commit drop;

  for v_unit in select * from verified_period_units order by effective_date,
    case when effective_time_precision='exact' then 0 else 1 end,
    effective_at nulls last,effective_order nulls last,unit_key loop
    delete from verified_period_effects;
    for v_row in
      select o.* from public.all_time_record_observations o
      where o.voided_at is null and (
        (v_unit.source_batch_id is not null and o.entry_type='verified_period' and o.verified_period_id=p_period_id and o.verified_source_batch_id=v_unit.source_batch_id)
        or (v_unit.source_batch_id is null and o.id=v_unit.representative_id)
      ) order by o.id
    loop
      if v_row.entry_type<>'verified_period' or v_row.verified_period_id<>p_period_id then
        insert into verified_period_pb values(v_row.course_id,v_row.player_id,v_row.score)
        on conflict(course_id,player_id) do update set score=least(verified_period_pb.score,excluded.score);
        continue;
      end if;
      select score into v_old from verified_period_pb where course_id=v_row.course_id and player_id=v_row.player_id;
      if v_old is null then v_classification:='FIRST';
      elsif v_row.score<v_old then v_classification:='BETTER';
      elsif v_row.score=v_old then v_classification:='EQUAL';
      else v_classification:='WORSE'; end if;
      v_passed:='{}'::uuid[]; v_points:=0;
      if v_classification='BETTER' then
        select coalesce(array_agg(player_id order by score,player_id),'{}'::uuid[]),count(*)::integer
        into v_passed,v_points from verified_period_pb
        where course_id=v_row.course_id and player_id<>v_row.player_id and score>v_row.score;
      end if;
      insert into verified_period_effects values(
        v_row.id,v_row.course_id,v_row.player_id,v_old,v_row.score,v_classification,
        case when v_classification in ('FIRST','BETTER') then v_row.score else v_old end,
        v_passed,case when v_classification='BETTER' then v_points else 0 end
      );
    end loop;

    for v_effect in select * from verified_period_effects order by observation_id loop
      v_event_id:=null; v_existing_points:=null;
      select id,points into v_event_id,v_existing_points from public.climbers_events
      where observation_id=v_effect.observation_id;
      if v_event_id is not null and (
        v_effect.classification not in ('FIRST','BETTER') or v_effect.climbers_points<v_existing_points
      ) then
        raise exception 'Replay would reduce a previously earned Climbers event; no changes were saved';
      end if;
      if v_effect.classification in ('FIRST','BETTER') then
        if v_event_id is null then
          insert into public.climbers_events(
            season_id,observation_id,player_id,course_id,difficulty,old_pb_score,new_pb_score,points,
            calculation_version,source_label,provenance_reference,created_by,effective_at,effective_date,
            effective_order,effective_time_precision
          ) select p_period_id,v_effect.observation_id,v_effect.player_id,v_effect.course_id,c.difficulty,
            v_effect.old_pb_score,v_effect.submitted_score,v_effect.climbers_points,'climbers-verified-period-v2',
            o.source_label,o.provenance_reference,v_user_id,o.authoritative_submitted_at,
            o.authoritative_submitted_date,o.authoritative_submission_order,o.authoritative_time_precision
          from public.all_time_courses c join public.all_time_record_observations o on o.id=v_effect.observation_id
          where c.id=v_effect.course_id returning id into v_event_id;
        else
          update public.climbers_events e set season_id=p_period_id,old_pb_score=v_effect.old_pb_score,
            new_pb_score=v_effect.submitted_score,points=v_effect.climbers_points,
            calculation_version='climbers-verified-period-v2',voided_at=null,voided_by=null,void_reason=null,
            effective_at=o.authoritative_submitted_at,effective_date=o.authoritative_submitted_date,
            effective_order=o.authoritative_submission_order,effective_time_precision=o.authoritative_time_precision,
            source_label=o.source_label,provenance_reference=o.provenance_reference
          from public.all_time_record_observations o where e.id=v_event_id and o.id=v_effect.observation_id;
        end if;
        delete from public.climbers_event_passes where event_id=v_event_id;
        insert into public.climbers_event_passes(event_id,passed_player_id)
        select v_event_id,passed from unnest(v_effect.passed_player_ids) passed;
        v_replayed:=v_replayed+1;
      else
        v_zero_effect:=v_zero_effect+1;
      end if;
      update public.all_time_verified_period_audit set
        all_time_classification=v_effect.classification,current_pb_score=v_effect.old_pb_score,
        submitted_score=v_effect.submitted_score,new_pb_score=v_effect.new_pb_score,
        passed_player_ids=v_effect.passed_player_ids,climbers_points=v_effect.climbers_points,
        climbers_status='replayed',calculation_version='climbers-verified-period-v2',
        calculated_at=clock_timestamp(),updated_at=clock_timestamp()
      where observation_id=v_effect.observation_id;
      if v_effect.classification in ('FIRST','BETTER') then
        insert into verified_period_pb values(v_effect.course_id,v_effect.player_id,v_effect.submitted_score)
        on conflict(course_id,player_id) do update set score=least(verified_period_pb.score,excluded.score);
      end if;
    end loop;
  end loop;
  return jsonb_build_object('season_id',p_period_id,'replayed_entries',v_replayed,
    'zero_effect_entries',v_zero_effect,'calculation_version','climbers-verified-period-v2');
end;
$function$;
revoke all on function public.replay_climbers_verified_period(uuid) from public,anon,authenticated;
grant execute on function public.replay_climbers_verified_period(uuid) to authenticated;

create or replace function public.preview_all_time_verified_period_entry(
  p_period_id uuid,p_course_id uuid,p_player_id uuid,p_entry_key uuid,p_fingerprint text,p_score integer,
  p_hole_strokes jsonb,p_entry_type text,p_source_label text,p_provenance_reference text,p_notes text,
  p_authoritative_submitted_at timestamptz,p_authoritative_submitted_date date,
  p_authoritative_submission_order integer,p_authoritative_time_precision text,p_verified_source_batch_id uuid
) returns jsonb language plpgsql security definer set search_path to '' as $function$
declare
  v_user_id uuid:=auth.uid(); v_period public.climbers_seasons%rowtype;
  v_course public.all_time_courses%rowtype; v_player public.players%rowtype;
  v_current_pb integer; v_score integer:=p_score; v_classification text; v_token text; v_date date;
  v_existing record;
begin
  if v_user_id is null or not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required' using errcode='42501'; end if;
  if p_period_id is null or p_entry_key is null or p_verified_source_batch_id is null
     or p_fingerprint is null or lower(p_fingerprint)!~'^[0-9a-f]{64}$' then
    raise exception 'Period, source batch, entry idempotency key, and fingerprint are required';
  end if;
  if nullif(btrim(p_source_label),'') is null then raise exception 'A source or provenance label is required'; end if;
  if p_entry_type not in ('full_card','quick_score') then raise exception 'Unsupported verified All-Time entry type'; end if;
  select * into v_period from public.climbers_seasons
  where id=p_period_id and status<>'finalized' and ends_at<=clock_timestamp();
  if not found then raise exception 'The selected Climbers period is unavailable, active, or finalized'; end if;
  if p_authoritative_time_precision='exact' then
    if p_authoritative_submitted_at is null or p_authoritative_submission_order is not null then raise exception 'Exact source chronology requires an authoritative timestamp and no source-order number'; end if;
    v_date:=(p_authoritative_submitted_at at time zone 'UTC')::date;
    if p_authoritative_submitted_date is not null and p_authoritative_submitted_date<>v_date then raise exception 'Source timestamp and date disagree'; end if;
  elsif p_authoritative_time_precision='date_ordered' then
    if p_authoritative_submitted_at is not null or p_authoritative_submitted_date is null or coalesce(p_authoritative_submission_order,0)<1 then raise exception 'Date-ordered chronology requires a source date and positive source order'; end if;
    v_date:=p_authoritative_submitted_date;
  else raise exception 'Verified-period entries require exact or date-ordered source chronology'; end if;
  if v_date<v_period.starts_at::date or v_date>=v_period.ends_at::date then raise exception 'Source chronology is outside the selected Climbers period'; end if;
  select * into v_course from public.all_time_courses where id=p_course_id and active and difficulty in ('Easy','Hard');
  if not found then raise exception 'The selected Easy/Hard course is unavailable'; end if;
  select * into v_player from public.players where id=public.resolve_canonical_player_id(p_player_id) and active;
  if not found then raise exception 'The selected canonical player is unavailable'; end if;
  if p_score is null and p_entry_type='quick_score' then raise exception 'Quick Score requires a score relative to par'; end if;
  if p_entry_type='full_card' then
    if p_hole_strokes is null or jsonb_typeof(p_hole_strokes)<>'array' or jsonb_array_length(p_hole_strokes)<>18
       or v_course.par is null or v_course.hole_pars is null or jsonb_typeof(v_course.hole_pars)<>'array'
       or jsonb_array_length(v_course.hole_pars)<>18 then raise exception 'Full-card entry requires 18 hole scores and 18 authoritative hole pars'; end if;
    if exists(select 1 from jsonb_array_elements(p_hole_strokes) as hole(value)
      where jsonb_typeof(hole.value)<>'number' or cast(hole.value as text)!~'^[0-9]+$'
        or cast(cast(hole.value as text) as integer)<1) then raise exception 'Hole scores must be positive whole numbers'; end if;
    if exists(select 1 from jsonb_array_elements(v_course.hole_pars) as hole(value)
      where jsonb_typeof(hole.value)<>'number' or cast(hole.value as text)!~'^[0-9]+$'
        or cast(cast(hole.value as text) as integer)<1) then raise exception 'Course hole pars must be positive whole numbers'; end if;
    if (select sum(cast(cast(hole.value as text) as integer)) from jsonb_array_elements(v_course.hole_pars) as hole(value))<>v_course.par then raise exception 'Course hole pars must total the authoritative course par'; end if;
    v_score:=(select sum(cast(cast(hole.value as text) as integer)) from jsonb_array_elements(p_hole_strokes) as hole(value))-v_course.par;
  end if;
  select o.id,e.points,a.all_time_classification,a.new_pb_score,a.climbers_status into v_existing
  from public.all_time_record_observations o
  left join public.climbers_events e on e.observation_id=o.id and e.voided_at is null
  left join public.all_time_verified_period_audit a on a.observation_id=o.id
  where o.entry_key=p_entry_key or o.fingerprint=lower(p_fingerprint) order by (o.entry_key=p_entry_key) desc limit 1;
  if found then return jsonb_build_object('action','already_saved','observation_id',v_existing.id,
    'all_time_classification',v_existing.all_time_classification,'new_pb_score',v_existing.new_pb_score,
    'climbers_points',coalesce(v_existing.points,0),'climbers_status',v_existing.climbers_status); end if;
  select min(o.score) into v_current_pb from public.all_time_record_observations o
  where o.course_id=p_course_id and o.player_id=v_player.id and o.identity_status='resolved' and o.voided_at is null;
  if v_current_pb is null then v_classification:='FIRST'; elsif v_score<v_current_pb then v_classification:='BETTER';
  elsif v_score=v_current_pb then v_classification:='EQUAL'; else v_classification:='WORSE'; end if;
  v_token:=md5(concat_ws('|',p_period_id::text,p_entry_key::text,lower(p_fingerprint),p_course_id::text,
    v_player.id::text,v_score::text,p_authoritative_time_precision,coalesce(p_authoritative_submitted_at::text,''),
    v_date::text,coalesce(p_authoritative_submission_order::text,''),p_verified_source_batch_id::text,
    coalesce(v_current_pb::text,'FIRST'),v_classification));
  return jsonb_build_object('action',lower(v_classification),'period_id',v_period.id,
    'target_period_label',v_period.label,'target_period_status',v_period.status,'course_id',p_course_id,
    'player_id',v_player.id,'player_name',v_player.screen_name,'course_name',v_course.display_name,
    'difficulty',v_course.difficulty,'current_pb_score',v_current_pb,'all_time_classification',v_classification,
    'submitted_score',v_score,'new_pb_score',case when v_classification in ('FIRST','BETTER') then v_score else v_current_pb end,
    'climbers_points',null,'climbers_status','calculated_after_save','authoritative_submitted_at',p_authoritative_submitted_at,
    'authoritative_submitted_date',v_date,'authoritative_submission_order',p_authoritative_submission_order,
    'authoritative_time_precision',p_authoritative_time_precision,'confirmation_token',v_token);
end;
$function$;
revoke all on function public.preview_all_time_verified_period_entry(uuid,uuid,uuid,uuid,text,integer,jsonb,text,text,text,text,timestamptz,date,integer,text,uuid) from public,anon,authenticated;
grant execute on function public.preview_all_time_verified_period_entry(uuid,uuid,uuid,uuid,text,integer,jsonb,text,text,text,text,timestamptz,date,integer,text,uuid) to authenticated;

create or replace function public.record_all_time_verified_period_entry(
  p_period_id uuid,p_course_id uuid,p_player_id uuid,p_entry_key uuid,p_fingerprint text,p_score integer,
  p_hole_strokes jsonb,p_entry_type text,p_source_label text,p_provenance_reference text,p_notes text,p_confirmation_token text,
  p_authoritative_submitted_at timestamptz,p_authoritative_submitted_date date,
  p_authoritative_submission_order integer,p_authoritative_time_precision text,p_verified_source_batch_id uuid
) returns jsonb language plpgsql security definer set search_path to '' as $function$
declare
  v_user_id uuid:=auth.uid(); v_preview jsonb; v_observation_id uuid; v_recorded_at timestamptz;
  v_audit public.all_time_verified_period_audit%rowtype;
begin
  if v_user_id is null or not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required' using errcode='42501'; end if;
  v_preview:=public.preview_all_time_verified_period_entry(p_period_id,p_course_id,p_player_id,p_entry_key,p_fingerprint,
    p_score,p_hole_strokes,p_entry_type,p_source_label,p_provenance_reference,p_notes,p_authoritative_submitted_at,
    p_authoritative_submitted_date,p_authoritative_submission_order,p_authoritative_time_precision,p_verified_source_batch_id);
  if v_preview->>'action'='already_saved' then return v_preview; end if;
  if p_confirmation_token is null or p_confirmation_token<>v_preview->>'confirmation_token' then raise exception 'The preview changed or was not explicitly confirmed; review again before saving'; end if;
  v_recorded_at:=clock_timestamp();
  insert into public.all_time_record_observations(
    batch_id,course_id,player_id,identity_status,historical_player_name,score,source_course_name,source_row,
    fingerprint,observed_at,metadata,entry_type,hole_strokes,source_label,provenance_reference,notes,recorded_by,
    entry_key,recorded_at,authoritative_submitted_at,authoritative_submitted_date,authoritative_submission_order,
    authoritative_time_precision,verified_period_id,verified_source_batch_id
  ) values(
    null,p_course_id,(v_preview->>'player_id')::uuid,'resolved',v_preview->>'player_name',(v_preview->>'submitted_score')::integer,
    v_preview->>'course_name',null,lower(p_fingerprint),v_recorded_at,
    jsonb_build_object('entry_method',p_entry_type,'verified_period_id',p_period_id::text,'climbers_status','pending_period_replay'),
    'verified_period',nullif(p_hole_strokes,'null'::jsonb),nullif(btrim(p_source_label),''),
    nullif(btrim(p_provenance_reference),''),nullif(btrim(p_notes),''),v_user_id,p_entry_key,v_recorded_at,
    p_authoritative_submitted_at,(v_preview->>'authoritative_submitted_date')::date,p_authoritative_submission_order,
    p_authoritative_time_precision,p_period_id,p_verified_source_batch_id
  ) returning id into v_observation_id;
  perform public.refresh_all_time_best_record(p_course_id,(v_preview->>'player_id')::uuid);
  insert into public.all_time_verified_period_audit(
    observation_id,verified_period_id,course_id,player_id,recorded_at,recorded_by,source_label,provenance_reference,
    notes,all_time_classification,current_pb_score,submitted_score,new_pb_score,climbers_points,climbers_status,
    authoritative_submitted_at,authoritative_submitted_date,authoritative_submission_order,authoritative_time_precision,
    verified_source_batch_id,passed_player_ids,calculation_version
  ) values(
    v_observation_id,p_period_id,p_course_id,(v_preview->>'player_id')::uuid,v_recorded_at,v_user_id,p_source_label,
    nullif(btrim(p_provenance_reference),''),nullif(btrim(p_notes),''),v_preview->>'all_time_classification',
    nullif(v_preview->>'current_pb_score','')::integer,(v_preview->>'submitted_score')::integer,
    nullif(v_preview->>'new_pb_score','')::integer,0,'pending_period_replay',p_authoritative_submitted_at,
    (v_preview->>'authoritative_submitted_date')::date,p_authoritative_submission_order,p_authoritative_time_precision,
    p_verified_source_batch_id,'{}'::uuid[],'climbers-verified-period-v2'
  );
  perform public.replay_climbers_verified_period(p_period_id);
  select * into v_audit from public.all_time_verified_period_audit where observation_id=v_observation_id;
  return jsonb_build_object('action','saved','observation_id',v_observation_id,'recorded_at',v_recorded_at,
    'period_id',p_period_id,'target_period_label',v_preview->>'target_period_label',
    'all_time_classification',v_preview->>'all_time_classification','new_pb_score',v_preview->'new_pb_score',
    'climbers_classification',v_audit.all_time_classification,'climbers_points',v_audit.climbers_points,
    'passed_player_ids',to_jsonb(v_audit.passed_player_ids),'climbers_status',v_audit.climbers_status,
    'calculation_version',v_audit.calculation_version);
end;
$function$;
revoke all on function public.record_all_time_verified_period_entry(uuid,uuid,uuid,uuid,text,integer,jsonb,text,text,text,text,text,timestamptz,date,integer,text,uuid) from public,anon,authenticated;
grant execute on function public.record_all_time_verified_period_entry(uuid,uuid,uuid,uuid,text,integer,jsonb,text,text,text,text,text,timestamptz,date,integer,text,uuid) to authenticated;

-- The old signatures remain as explicit blockers so no client can continue
-- creating chronology-free, permanently zero-point verified entries.
create or replace function public.preview_all_time_verified_period_entry(
  p_period_id uuid,p_course_id uuid,p_player_id uuid,p_entry_key uuid,p_fingerprint text,p_score integer,
  p_hole_strokes jsonb,p_entry_type text,p_source_label text,p_provenance_reference text,p_notes text
) returns jsonb language plpgsql security definer set search_path to '' as $function$
begin
  if auth.uid() is null or not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required' using errcode='42501'; end if;
  raise exception 'Verified-period source chronology is required; reload the updated All-Time entry page';
end;
$function$;
create or replace function public.record_all_time_verified_period_entry(
  p_period_id uuid,p_course_id uuid,p_player_id uuid,p_entry_key uuid,p_fingerprint text,p_score integer,
  p_hole_strokes jsonb,p_entry_type text,p_source_label text,p_provenance_reference text,p_notes text,p_confirmation_token text
) returns jsonb language plpgsql security definer set search_path to '' as $function$
begin
  if auth.uid() is null or not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required' using errcode='42501'; end if;
  raise exception 'Verified-period source chronology is required; reload the updated All-Time entry page';
end;
$function$;
revoke all on function public.preview_all_time_verified_period_entry(uuid,uuid,uuid,uuid,text,integer,jsonb,text,text,text,text) from public,anon,authenticated;
grant execute on function public.preview_all_time_verified_period_entry(uuid,uuid,uuid,uuid,text,integer,jsonb,text,text,text,text) to authenticated;
revoke all on function public.record_all_time_verified_period_entry(uuid,uuid,uuid,uuid,text,integer,jsonb,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.record_all_time_verified_period_entry(uuid,uuid,uuid,uuid,text,integer,jsonb,text,text,text,text,text) to authenticated;

commit;

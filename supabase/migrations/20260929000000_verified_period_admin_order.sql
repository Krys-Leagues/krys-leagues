begin;

-- Ordinary protected historical entry is scorecard-backed. Keep the existing
-- RPC signatures for deployed clients, but derive chronology server-side.
alter function public.preview_all_time_verified_period_entry_v2(
  uuid,uuid,uuid,uuid,text,integer,jsonb,text,text,text,text,timestamptz,date,integer,text,uuid
) rename to _legacy_preview_all_time_verified_period_entry_v2;
alter function public.record_all_time_verified_period_entry_v2(
  uuid,uuid,uuid,uuid,text,integer,jsonb,text,text,text,text,text,timestamptz,date,integer,text,uuid
) rename to _legacy_record_all_time_verified_period_entry_v2;
revoke all on function public._legacy_preview_all_time_verified_period_entry_v2(
  uuid,uuid,uuid,uuid,text,integer,jsonb,text,text,text,text,timestamptz,date,integer,text,uuid
) from public,anon,authenticated,service_role;
revoke all on function public._legacy_record_all_time_verified_period_entry_v2(
  uuid,uuid,uuid,uuid,text,integer,jsonb,text,text,text,text,text,timestamptz,date,integer,text,uuid
) from public,anon,authenticated,service_role;

create or replace function public.preview_all_time_verified_period_entry_v2(
  p_period_id uuid,p_course_id uuid,p_player_id uuid,p_entry_key uuid,p_fingerprint text,p_score integer,
  p_hole_strokes jsonb,p_entry_type text,p_source_label text,p_provenance_reference text,p_notes text,
  p_authoritative_submitted_at timestamptz,p_authoritative_submitted_date date,
  p_authoritative_submission_order integer,p_authoritative_time_precision text,p_verified_source_batch_id uuid
) returns jsonb language plpgsql security definer set search_path to '' as $function$
declare
  v_user_id uuid:=auth.uid();
  v_period public.climbers_seasons%rowtype;
  v_date date;
  v_order integer;
  v_source_batch uuid:=coalesce(p_verified_source_batch_id,gen_random_uuid());
begin
  if v_user_id is null or not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required' using errcode='42501'; end if;
  select * into v_period from public.climbers_seasons
  where id=p_period_id and status<>'finalized' and ends_at<=clock_timestamp();
  if not found then raise exception 'The selected Climbers period is unavailable, active, or finalized'; end if;
  v_date:=v_period.starts_at::date;
  select max(o.authoritative_submission_order)
    into v_order
  from public.all_time_record_observations o
  where o.entry_type='verified_period' and o.verified_period_id=p_period_id
    and o.voided_at is null and o.authoritative_time_precision='date_ordered'
    and o.verified_source_batch_id=v_source_batch;
  if v_order is null then
    select coalesce(max(o.authoritative_submission_order),0)+1
      into v_order
    from public.all_time_record_observations o
    where o.entry_type='verified_period' and o.verified_period_id=p_period_id
      and o.voided_at is null and o.authoritative_time_precision='date_ordered';
  end if;
  return public._legacy_preview_all_time_verified_period_entry_v2(
    p_period_id,p_course_id,p_player_id,p_entry_key,p_fingerprint,p_score,p_hole_strokes,p_entry_type,
    'SCORECARD',null,null,null,v_date,v_order,'date_ordered',v_source_batch
  );
end;
$function$;
revoke all on function public.preview_all_time_verified_period_entry_v2(uuid,uuid,uuid,uuid,text,integer,jsonb,text,text,text,text,timestamptz,date,integer,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.preview_all_time_verified_period_entry_v2(uuid,uuid,uuid,uuid,text,integer,jsonb,text,text,text,text,timestamptz,date,integer,text,uuid) to authenticated;

create or replace function public.record_all_time_verified_period_entry_v2(
  p_period_id uuid,p_course_id uuid,p_player_id uuid,p_entry_key uuid,p_fingerprint text,p_score integer,
  p_hole_strokes jsonb,p_entry_type text,p_source_label text,p_provenance_reference text,p_notes text,p_confirmation_token text,
  p_authoritative_submitted_at timestamptz,p_authoritative_submitted_date date,
  p_authoritative_submission_order integer,p_authoritative_time_precision text,p_verified_source_batch_id uuid
) returns jsonb language plpgsql security definer set search_path to '' as $function$
declare
  v_user_id uuid:=auth.uid();
  v_period public.climbers_seasons%rowtype;
begin
  if v_user_id is null or not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required' using errcode='42501'; end if;
  -- The period row lock serializes next-order allocation for ADD AGAIN and
  -- concurrent admins. The legacy writer then reuses this transaction lock.
  select * into v_period from public.climbers_seasons where id=p_period_id for update;
  if not found then raise exception 'Climbers period was not found'; end if;
  return public._legacy_record_all_time_verified_period_entry_v2(
    p_period_id,p_course_id,p_player_id,p_entry_key,p_fingerprint,p_score,p_hole_strokes,p_entry_type,
    'SCORECARD',null,null,p_confirmation_token,null,v_period.starts_at::date,null,'date_ordered',
    coalesce(p_verified_source_batch_id,gen_random_uuid())
  );
end;
$function$;
revoke all on function public.record_all_time_verified_period_entry_v2(uuid,uuid,uuid,uuid,text,integer,jsonb,text,text,text,text,text,timestamptz,date,integer,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.record_all_time_verified_period_entry_v2(uuid,uuid,uuid,uuid,text,integer,jsonb,text,text,text,text,text,timestamptz,date,integer,text,uuid) to authenticated;

-- Source timestamps on other observations remain metadata. Verified-period
-- units are replayed by their period submission order, so exact timestamps do
-- not override the protected historical intake order.
create or replace function public.replay_climbers_verified_period_v2(p_period_id uuid)
returns jsonb language plpgsql security definer set search_path to '' as $function$
declare
  v_user_id uuid:=auth.uid(); v_season public.climbers_seasons%rowtype;
  v_unit record; v_row record; v_effect record; v_old integer; v_classification text;
  v_event_id uuid; v_existing_points integer; v_existing_version text;
  v_existing_player_id uuid; v_existing_course_id uuid; v_existing_season_id uuid;
  v_passed uuid[]; v_points integer; v_mode text;
  v_replayed integer:=0; v_zero_effect integer:=0;
begin
  if v_user_id is null or not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode='42501';
  end if;
  select * into v_season from public.climbers_seasons where id=p_period_id for update;
  if not found then raise exception 'Climbers period was not found'; end if;
  if v_season.status='finalized' then raise exception 'A finalized Climbers period cannot be replayed'; end if;
  if v_season.ends_at>clock_timestamp() then raise exception 'Verified-period replay requires a completed Climbers period'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('climbers-source-v2:'||p_period_id::text,0));
  v_mode:=public._verified_period_replay_mode_v2(p_period_id);
  if v_mode<>'SOURCE_V2' then
    raise exception 'This period contains legacy posting-order entries and cannot safely mix source-date replay without chronology reconciliation. Period: %',p_period_id;
  end if;
  if exists (select 1 from public.all_time_record_observations o
    where o.entry_type='verified_period' and o.verified_period_id=p_period_id and o.voided_at is null
      and (o.authoritative_time_precision not in ('exact','date_ordered') or o.authoritative_submitted_date is null
        or o.verified_source_batch_id is null or (o.authoritative_time_precision='exact' and o.authoritative_submitted_at is null)
        or (o.authoritative_time_precision='date_ordered' and coalesce(o.authoritative_submission_order,0)<1))) then
    raise exception 'Every verified-period entry needs source-backed chronology before replay';
  end if;
  if exists (select 1 from public.all_time_record_observations o
    where o.entry_type<>'historical_import' and o.voided_at is null and o.identity_status='resolved' and o.player_id is not null
      and o.entry_type<>'verified_period' and o.observed_at<v_season.starts_at
      and (o.authoritative_time_precision not in ('exact','date_ordered') or o.authoritative_submitted_date is null)) then
    raise exception 'Earlier score history lacks authoritative chronology; replay cannot invent its position';
  end if;
  if exists (select 1 from public.all_time_record_observations o
    where o.entry_type<>'historical_import' and o.entry_type<>'verified_period' and o.voided_at is null
      and o.identity_status='resolved' and o.player_id is not null
      and o.authoritative_submitted_date>=v_season.starts_at::date and o.authoritative_submitted_date<v_season.ends_at::date
      and (o.authoritative_time_precision not in ('exact','date_ordered') or o.authoritative_submitted_date is null
        or (o.authoritative_time_precision='exact' and o.authoritative_submitted_at is null)
        or (o.authoritative_time_precision='date_ordered' and coalesce(o.authoritative_submission_order,0)<1))) then
    raise exception 'An existing entry in this period lacks authoritative chronology; replay cannot invent its position';
  end if;
  if exists (select 1 from public.all_time_record_observations o
    where o.entry_type='verified_period' and o.verified_period_id=p_period_id and o.voided_at is null
    group by o.verified_source_batch_id
    having count(distinct row(o.authoritative_submitted_at,o.authoritative_submitted_date,o.authoritative_submission_order,o.authoritative_time_precision))<>1) then
    raise exception 'One verified source batch contains conflicting chronology';
  end if;
  if exists (select 1 from public.all_time_record_observations o
    where o.entry_type='verified_period' and o.verified_period_id=p_period_id and o.voided_at is null
    group by o.verified_source_batch_id having count(distinct o.course_id)<>1 or count(distinct o.player_id)<>count(*)) then
    raise exception 'One verified source batch must represent one course card with each canonical player listed once';
  end if;
  if exists (select 1 from public.all_time_record_observations o
    where o.entry_type<>'verified_period' and o.card_batch_id is not null and o.voided_at is null
      and o.authoritative_submitted_date>=v_season.starts_at::date and o.authoritative_submitted_date<v_season.ends_at::date
    group by o.card_batch_id
    having count(distinct row(o.authoritative_submitted_at,o.authoritative_submitted_date,o.authoritative_submission_order,o.authoritative_time_precision))<>1) then
    raise exception 'One existing scorecard batch contains conflicting chronology';
  end if;
  if exists (select 1 from public.all_time_record_observations a join public.all_time_record_observations b
    on a.id<b.id and a.verified_period_id=b.verified_period_id and a.authoritative_submitted_date=b.authoritative_submitted_date
      and a.authoritative_submission_order=b.authoritative_submission_order and a.verified_source_batch_id<>b.verified_source_batch_id
    where a.entry_type='verified_period' and b.entry_type='verified_period' and a.verified_period_id=p_period_id
      and a.voided_at is null and b.voided_at is null and a.authoritative_time_precision='date_ordered' and b.authoritative_time_precision='date_ordered') then
    raise exception 'Separate verified sources share the same date/order; correct the authoritative source order before replay';
  end if;
  if exists (select 1 from public.all_time_record_observations verified join public.all_time_record_observations other
    on other.id<>verified.id and other.authoritative_submitted_date=verified.authoritative_submitted_date
      and other.authoritative_submission_order=verified.authoritative_submission_order
    where verified.entry_type='verified_period' and verified.verified_period_id=p_period_id and verified.voided_at is null
      and other.voided_at is null and verified.authoritative_time_precision='date_ordered' and other.authoritative_time_precision='date_ordered'
      and (other.entry_type<>'verified_period' or other.verified_source_batch_id<>verified.verified_source_batch_id)) then
    raise exception 'Verified and existing sources share the same date/order; correct the authoritative source order before replay';
  end if;
  if exists (select 1 from public.all_time_record_observations verified join public.all_time_record_observations other
    on other.id<>verified.id and other.authoritative_submitted_at=verified.authoritative_submitted_at
    where verified.entry_type='verified_period' and verified.verified_period_id=p_period_id and verified.voided_at is null
      and other.voided_at is null and verified.authoritative_time_precision='exact' and other.authoritative_time_precision='exact'
      and (other.entry_type<>'verified_period' or other.verified_source_batch_id<>verified.verified_source_batch_id)) then
    raise exception 'Verified and existing sources share an exact timestamp without shared-card evidence';
  end if;

  create temp table if not exists pg_temp.verified_period_pb_v2(course_id uuid,player_id uuid,score integer,primary key(course_id,player_id)) on commit drop;
  truncate pg_temp.verified_period_pb_v2;
  insert into pg_temp.verified_period_pb_v2(course_id,player_id,score)
  select o.course_id,o.player_id,min(o.score) from public.all_time_record_observations o
  where o.entry_type='historical_import' and o.identity_status='resolved' and o.player_id is not null and o.voided_at is null group by o.course_id,o.player_id;
  insert into pg_temp.verified_period_pb_v2(course_id,player_id,score)
  select o.course_id,o.player_id,min(o.score) from public.all_time_record_observations o join public.climbers_seasons prior on prior.id=o.verified_period_id
  where o.entry_type='verified_period' and o.identity_status='resolved' and o.player_id is not null and o.voided_at is null and prior.ends_at<=v_season.starts_at
  group by o.course_id,o.player_id on conflict(course_id,player_id) do update set score=least(verified_period_pb_v2.score,excluded.score);
  insert into pg_temp.verified_period_pb_v2(course_id,player_id,score)
  select o.course_id,o.player_id,min(o.score) from public.all_time_record_observations o
  where o.entry_type not in ('historical_import','verified_period') and o.identity_status='resolved' and o.player_id is not null
    and o.voided_at is null and o.authoritative_submitted_date<v_season.starts_at::date
  group by o.course_id,o.player_id on conflict(course_id,player_id) do update set score=least(verified_period_pb_v2.score,excluded.score);

  create temp table if not exists pg_temp.verified_period_units_v2(
    unit_key text primary key,representative_id uuid,effective_date date not null,effective_at timestamptz,effective_order integer,effective_time_precision text not null
  ) on commit drop;
  truncate pg_temp.verified_period_units_v2;
  insert into pg_temp.verified_period_units_v2(unit_key,representative_id,effective_date,effective_at,effective_order,effective_time_precision)
  select distinct on (case when o.entry_type='verified_period' then 'verified:'||o.verified_source_batch_id::text when o.card_batch_id is not null then 'card:'||o.card_batch_id::text else 'observation:'||o.id::text end)
    case when o.entry_type='verified_period' then 'verified:'||o.verified_source_batch_id::text when o.card_batch_id is not null then 'card:'||o.card_batch_id::text else 'observation:'||o.id::text end,
    o.id,o.authoritative_submitted_date,
    case when o.entry_type='verified_period' then null else o.authoritative_submitted_at end,
    case when o.entry_type='verified_period' then o.authoritative_submission_order else o.authoritative_submission_order end,
    case when o.entry_type='verified_period' then 'date_ordered' else o.authoritative_time_precision end
  from public.all_time_record_observations o
  where o.voided_at is null and o.identity_status='resolved' and o.player_id is not null
    and (o.entry_type<>'verified_period' or o.verified_period_id=p_period_id)
    and o.authoritative_submitted_date>=v_season.starts_at::date and o.authoritative_submitted_date<v_season.ends_at::date
  order by case when o.entry_type='verified_period' then 'verified:'||o.verified_source_batch_id::text when o.card_batch_id is not null then 'card:'||o.card_batch_id::text else 'observation:'||o.id::text end,o.id;

  create temp table if not exists pg_temp.verified_period_effects_v2(
    observation_id uuid primary key,course_id uuid,player_id uuid,old_pb_score integer,submitted_score integer,classification text,new_pb_score integer,passed_player_ids uuid[],climbers_points integer
  ) on commit drop;
  truncate pg_temp.verified_period_effects_v2;
  for v_unit in select * from pg_temp.verified_period_units_v2 order by effective_date,case when unit_key like 'verified:%' then 1 when effective_time_precision='exact' then 0 else 1 end,effective_order nulls last,effective_at nulls last,unit_key loop
    truncate pg_temp.verified_period_effects_v2;
    for v_row in select o.* from public.all_time_record_observations o where o.voided_at is null and (
      (v_unit.unit_key like 'verified:%' and o.entry_type='verified_period' and o.verified_period_id=p_period_id and o.verified_source_batch_id=(substring(v_unit.unit_key from 10))::uuid)
      or (v_unit.unit_key like 'card:%' and o.entry_type<>'verified_period' and o.card_batch_id=(substring(v_unit.unit_key from 6))::uuid)
      or (v_unit.unit_key like 'observation:%' and o.id=v_unit.representative_id)
    ) order by o.id loop
      if v_row.entry_type<>'verified_period' or v_row.verified_period_id<>p_period_id then continue; end if;
      select score into v_old from pg_temp.verified_period_pb_v2 where course_id=v_row.course_id and player_id=v_row.player_id;
      if v_old is null then v_classification:='FIRST'; elsif v_row.score<v_old then v_classification:='BETTER'; elsif v_row.score=v_old then v_classification:='EQUAL'; else v_classification:='WORSE'; end if;
      v_passed:='{}'::uuid[]; v_points:=0;
      if v_classification='BETTER' then select coalesce(array_agg(player_id order by score,player_id),'{}'::uuid[]),count(*)::integer into v_passed,v_points from pg_temp.verified_period_pb_v2 where course_id=v_row.course_id and player_id<>v_row.player_id and score>v_row.score; end if;
      insert into pg_temp.verified_period_effects_v2 values(v_row.id,v_row.course_id,v_row.player_id,v_old,v_row.score,v_classification,case when v_classification in ('FIRST','BETTER') then v_row.score else v_old end,v_passed,case when v_classification='BETTER' then v_points else 0 end);
    end loop;
    for v_effect in select * from pg_temp.verified_period_effects_v2 order by observation_id loop
      v_event_id:=null; v_existing_points:=null; v_existing_version:=null; v_existing_player_id:=null; v_existing_course_id:=null; v_existing_season_id:=null;
      select id,points,calculation_version,player_id,course_id,season_id into v_event_id,v_existing_points,v_existing_version,v_existing_player_id,v_existing_course_id,v_existing_season_id from public.climbers_events where observation_id=v_effect.observation_id;
      if v_event_id is not null and (v_existing_version is distinct from 'climbers-verified-period-source-v2' or v_existing_player_id is distinct from v_effect.player_id or v_existing_course_id is distinct from v_effect.course_id or v_existing_season_id is distinct from p_period_id) then raise exception 'Replay found an existing event from another calculation path; no changes were saved'; end if;
      if v_event_id is not null and (v_effect.classification not in ('FIRST','BETTER') or v_effect.climbers_points<v_existing_points) then raise exception 'Replay would reduce a previously earned Climbers event; no changes were saved'; end if;
      if v_event_id is not null and exists (select 1 from public.climbers_event_passes old_pass where old_pass.event_id=v_event_id and not (old_pass.passed_player_id=any(v_effect.passed_player_ids))) then raise exception 'Replay would remove previously earned passed-player evidence; no changes were saved'; end if;
      if exists (select 1 from public.all_time_verified_period_audit a where a.observation_id=v_effect.observation_id and (a.climbers_points>v_effect.climbers_points or exists (select 1 from unnest(a.passed_player_ids) old_id where not (old_id=any(v_effect.passed_player_ids)))) then raise exception 'Replay would reduce a previously recorded audit result; no changes were saved'; end if;
      if v_effect.classification in ('FIRST','BETTER') then
        if v_event_id is null then
          insert into public.climbers_events(season_id,observation_id,player_id,course_id,difficulty,old_pb_score,new_pb_score,points,calculation_version,source_label,provenance_reference,created_by,effective_at,effective_date,effective_order,effective_time_precision)
          select p_period_id,v_effect.observation_id,v_effect.player_id,v_effect.course_id,c.difficulty,v_effect.old_pb_score,v_effect.submitted_score,v_effect.climbers_points,'climbers-verified-period-source-v2',o.source_label,o.provenance_reference,v_user_id,o.authoritative_submitted_at,o.authoritative_submitted_date,o.authoritative_submission_order,o.authoritative_time_precision from public.all_time_courses c join public.all_time_record_observations o on o.id=v_effect.observation_id where c.id=v_effect.course_id returning id into v_event_id;
        else
          update public.climbers_events e set season_id=p_period_id,old_pb_score=v_effect.old_pb_score,new_pb_score=v_effect.submitted_score,points=v_effect.climbers_points,calculation_version='climbers-verified-period-source-v2',voided_at=null,voided_by=null,void_reason=null,effective_at=o.authoritative_submitted_at,effective_date=o.authoritative_submitted_date,effective_order=o.authoritative_submission_order,effective_time_precision=o.authoritative_time_precision,source_label=o.source_label,provenance_reference=o.provenance_reference from public.all_time_record_observations o where e.id=v_event_id and o.id=v_effect.observation_id;
        end if;
        delete from public.climbers_event_passes where event_id=v_event_id;
        insert into public.climbers_event_passes(event_id,passed_player_id) select v_event_id,passed from unnest(v_effect.passed_player_ids) passed;
        v_replayed:=v_replayed+1;
      else v_zero_effect:=v_zero_effect+1; end if;
      update public.all_time_verified_period_audit set all_time_classification=v_effect.classification,current_pb_score=v_effect.old_pb_score,submitted_score=v_effect.submitted_score,new_pb_score=v_effect.new_pb_score,passed_player_ids=v_effect.passed_player_ids,climbers_points=v_effect.climbers_points,climbers_status='replayed',calculation_version='climbers-verified-period-source-v2',calculated_at=clock_timestamp(),updated_at=clock_timestamp() where observation_id=v_effect.observation_id;
    end loop;
    insert into pg_temp.verified_period_pb_v2(course_id,player_id,score)
    select o.course_id,o.player_id,min(o.score) from public.all_time_record_observations o where o.voided_at is null and ((v_unit.unit_key like 'verified:%' and o.entry_type='verified_period' and o.verified_period_id=p_period_id and o.verified_source_batch_id=(substring(v_unit.unit_key from 10))::uuid) or (v_unit.unit_key like 'card:%' and o.entry_type<>'verified_period' and o.card_batch_id=(substring(v_unit.unit_key from 6))::uuid) or (v_unit.unit_key like 'observation:%' and o.id=v_unit.representative_id)) group by o.course_id,o.player_id on conflict(course_id,player_id) do update set score=least(verified_period_pb_v2.score,excluded.score);
  end loop;
  return jsonb_build_object('season_id',p_period_id,'replayed_entries',v_replayed,'zero_effect_entries',v_zero_effect,'calculation_version','climbers-verified-period-source-v2');
end;
$function$;
revoke all on function public.replay_climbers_verified_period_v2(uuid) from public,anon,authenticated,service_role;
grant execute on function public.replay_climbers_verified_period_v2(uuid) to authenticated;
commit;

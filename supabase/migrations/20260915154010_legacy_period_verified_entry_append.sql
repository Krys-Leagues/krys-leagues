-- Permit source-backed append-only entries in an existing LEGACY_V1 verified
-- period without reinterpreting or modifying its protected posting history.
--
-- Installation is DDL-only. Persistent data changes occur only when an
-- authenticated site admin explicitly confirms record_all_time_verified_period_entry_v3.
begin;

do $preflight$
declare
  v_period_id uuid;
  v_observations integer;
  v_audits integer;
  v_events integer;
  v_points integer;
  v_passes integer;
begin
  if to_regclass('public.all_time_record_observations') is null
     or to_regclass('public.all_time_verified_period_audit') is null
     or to_regclass('public.climbers_events') is null
     or to_regclass('public.climbers_event_passes') is null
     or to_regclass('public.climbers_seasons') is null
     or to_regprocedure('public.is_current_user_site_admin()') is null
     or to_regprocedure('public.resolve_canonical_player_id(uuid)') is null
     or to_regprocedure('public.refresh_all_time_best_record(uuid,uuid)') is null
     or to_regprocedure('public.preview_all_time_verified_period_entry(uuid,uuid,uuid,uuid,text,integer,jsonb,text,text,text,text)') is null
     or to_regprocedure('public.preview_all_time_verified_period_entry_v2(uuid,uuid,uuid,uuid,text,integer,jsonb,text,text,text,text,timestamp with time zone,date,integer,text,uuid)') is null
     or to_regprocedure('public.record_all_time_verified_period_entry_v2(uuid,uuid,uuid,uuid,text,integer,jsonb,text,text,text,text,text,timestamp with time zone,date,integer,text,uuid)') is null then
    raise exception 'Install the reviewed legacy and SOURCE V2 verified-period layers first';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='all_time_record_observations'
      and column_name='verified_source_batch_id'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='all_time_verified_period_audit'
      and column_name='calculation_version'
  ) then
    raise exception 'The reviewed SOURCE V2 chronology columns are required first';
  end if;

  select season.id into v_period_id
  from public.climbers_seasons as season
  where season.starts_at=timestamptz '2026-08-15T00:00:00Z'
    and season.ends_at=timestamptz '2026-08-29T00:00:00Z';

  if v_period_id is not null then
    select count(*) into v_observations
    from public.all_time_record_observations as observation
    join public.all_time_verified_period_audit as audit
      on audit.observation_id=observation.id
    where observation.verified_period_id=v_period_id
      and observation.entry_type='verified_period'
      and observation.voided_at is null
      and audit.posting_sequence between 1 and 12;

    select count(*) into v_audits
    from public.all_time_verified_period_audit as audit
    where audit.verified_period_id=v_period_id
      and audit.climbers_status<>'voided'
      and audit.posting_sequence between 1 and 12;

    select count(*),coalesce(sum(event.points),0)
      into v_events,v_points
    from public.climbers_events as event
    join public.all_time_verified_period_audit as audit
      on audit.observation_id=event.observation_id
    where event.season_id=v_period_id
      and event.voided_at is null
      and audit.posting_sequence between 1 and 12;

    select count(*) into v_passes
    from public.climbers_event_passes as pass
    join public.climbers_events as event on event.id=pass.event_id
    join public.all_time_verified_period_audit as audit
      on audit.observation_id=event.observation_id
    where event.season_id=v_period_id
      and event.voided_at is null
      and audit.posting_sequence between 1 and 12;

    if v_observations<>12 or v_audits<>12 or v_events<>12
       or v_points<>281 or v_passes<>281 then
      raise exception 'The protected Aug 15-Aug 28 legacy 12/281 baseline changed; no functions were installed';
    end if;
  end if;
end;
$preflight$;

create or replace function public._verified_period_entry_route_v3(p_period_id uuid)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_total integer;
  v_legacy integer;
  v_source_v2 integer;
begin
  select count(*),
    count(*) filter (
      where audit.posting_sequence is not null
        and audit.climbers_status<>'voided'
        and (audit.calculation_version is null
          or audit.calculation_version='climbers-verified-period-posting-v1')
    ),
    count(*) filter (
      where observation.authoritative_time_precision in ('exact','date_ordered')
        and observation.authoritative_submitted_date is not null
        and observation.verified_source_batch_id is not null
        and audit.calculation_version='climbers-verified-period-source-v2'
        and audit.climbers_status<>'voided'
    )
    into v_total,v_legacy,v_source_v2
  from public.all_time_record_observations as observation
  left join public.all_time_verified_period_audit as audit
    on audit.observation_id=observation.id
  where observation.entry_type='verified_period'
    and observation.verified_period_id=p_period_id
    and observation.voided_at is null;

  if v_total=0 or v_source_v2=v_total then return 'SOURCE_V2'; end if;
  if v_legacy=v_total then return 'LEGACY_V1_APPEND'; end if;
  return 'MIXED_OR_INVALID';
end;
$function$;
revoke all on function public._verified_period_entry_route_v3(uuid)
  from public,anon,authenticated,service_role;

create or replace function public._preview_all_time_verified_period_legacy_append_v3(
  p_period_id uuid,p_course_id uuid,p_player_id uuid,p_entry_key uuid,p_fingerprint text,p_score integer,
  p_hole_strokes jsonb,p_entry_type text,p_source_label text,p_provenance_reference text,p_notes text,
  p_authoritative_submitted_date date,p_authoritative_submission_order integer,
  p_verified_source_batch_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid:=auth.uid();
  v_period public.climbers_seasons%rowtype;
  v_base jsonb;
  v_batch_count integer;
  v_batch_start integer;
  v_next_posting_sequence integer;
  v_expected_source_order integer;
  v_old_pb integer;
  v_classification text;
  v_passed uuid[]:='{}'::uuid[];
  v_points integer:=0;
  v_score integer;
  v_token text;
begin
  if v_user_id is null or not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode='42501';
  end if;
  if p_verified_source_batch_id is null then
    raise exception 'A verified scorecard/source batch id is required';
  end if;

  select * into v_period
  from public.climbers_seasons
  where id=p_period_id and status<>'finalized' and ends_at<=clock_timestamp();
  if not found then
    raise exception 'The selected Climbers period is unavailable, active, or finalized';
  end if;
  if public._verified_period_entry_route_v3(p_period_id)<>'LEGACY_V1_APPEND' then
    raise exception 'This entry is not eligible for the protected LEGACY_V1 append route';
  end if;
  if p_authoritative_submitted_date is null
     or p_authoritative_submitted_date<v_period.starts_at::date
     or p_authoritative_submitted_date>=v_period.ends_at::date then
    raise exception 'The source-post date must fall inside the selected Climbers period';
  end if;
  if coalesce(p_authoritative_submission_order,0)<1 then
    raise exception 'A positive source-backed period posting order is required';
  end if;

  -- Reuse the installed legacy validator for canonical identity, course, score,
  -- full-card pars, idempotency, and current All-Time PB classification.
  v_base:=public.preview_all_time_verified_period_entry(
    p_period_id,p_course_id,p_player_id,p_entry_key,p_fingerprint,p_score,p_hole_strokes,
    p_entry_type,p_source_label,p_provenance_reference,p_notes
  );
  if v_base->>'action'='already_saved' then
    return v_base || jsonb_build_object('replay_mode','LEGACY_V1_APPEND');
  end if;
  v_score:=(v_base->>'submitted_score')::integer;

  select count(*),min(audit.posting_sequence)
    into v_batch_count,v_batch_start
  from public.all_time_verified_period_audit as audit
  join public.all_time_record_observations as observation
    on observation.id=audit.observation_id
  where audit.verified_period_id=p_period_id
    and audit.verified_source_batch_id=p_verified_source_batch_id
    and audit.climbers_status<>'voided'
    and observation.voided_at is null;

  select coalesce(max(audit.posting_sequence),0)+1
    into v_next_posting_sequence
  from public.all_time_verified_period_audit as audit
  where audit.verified_period_id=p_period_id;

  if v_batch_count>0 then
    if exists (
      select 1
      from public.all_time_verified_period_audit as audit
      join public.all_time_record_observations as observation
        on observation.id=audit.observation_id
      where audit.verified_period_id=p_period_id
        and audit.verified_source_batch_id=p_verified_source_batch_id
        and audit.climbers_status<>'voided'
        and observation.voided_at is null
        and (audit.authoritative_submitted_date is distinct from p_authoritative_submitted_date
          or audit.authoritative_submission_order is distinct from p_authoritative_submission_order
          or audit.course_id is distinct from p_course_id
          or audit.calculation_version is distinct from 'climbers-verified-period-posting-v1')
    ) then
      raise exception 'ADD AGAIN SC must keep the same legacy period, course, source date, and source order';
    end if;
    if exists (
      select 1 from public.all_time_verified_period_audit as audit
      where audit.verified_period_id=p_period_id
        and audit.verified_source_batch_id=p_verified_source_batch_id
        and audit.player_id=(v_base->>'player_id')::uuid
        and audit.climbers_status<>'voided'
    ) then
      raise exception 'This canonical player is already present on the retained scorecard';
    end if;
    if exists (
      select 1 from public.all_time_verified_period_audit as later
      where later.verified_period_id=p_period_id
        and later.climbers_status<>'voided'
        and later.posting_sequence>(
          select max(current_batch.posting_sequence)
          from public.all_time_verified_period_audit as current_batch
          where current_batch.verified_period_id=p_period_id
            and current_batch.verified_source_batch_id=p_verified_source_batch_id
            and current_batch.climbers_status<>'voided'
        )
    ) then
      raise exception 'This retained scorecard is no longer the latest legacy source. Adding another player would require replaying later earned events, so nothing was saved';
    end if;
  else
    select greatest(
      coalesce(max(audit.posting_sequence) filter (
        where audit.authoritative_submission_order is null
      ),0),
      coalesce(max(audit.authoritative_submission_order),0)
    )+1 into v_expected_source_order
    from public.all_time_verified_period_audit as audit
    where audit.verified_period_id=p_period_id
      and audit.climbers_status<>'voided';

    if p_authoritative_submission_order<>v_expected_source_order then
      raise exception 'Legacy posting history is immutable. The next safe source-backed period order is %, but % was supplied. If this source belongs earlier, chronology reconciliation is required and nothing was saved',
        v_expected_source_order,p_authoritative_submission_order;
    end if;
    v_batch_start:=v_next_posting_sequence;
  end if;

  if exists (
    select 1
    from public.all_time_verified_period_audit as audit
    join public.all_time_record_observations as observation
      on observation.id=audit.observation_id
    where audit.verified_period_id=p_period_id
      and audit.climbers_status<>'voided'
      and observation.voided_at is null
      and observation.course_id=p_course_id
      and observation.player_id=(v_base->>'player_id')::uuid
      and observation.score=v_score
      and audit.authoritative_submitted_date=p_authoritative_submitted_date
      and audit.authoritative_submission_order=p_authoritative_submission_order
  ) then
    raise exception 'An equivalent verified-period source entry already exists';
  end if;

  if v_period.starts_at=timestamptz '2026-08-15T00:00:00Z'
     and v_period.ends_at=timestamptz '2026-08-29T00:00:00Z' then
    if (select count(*)
        from public.all_time_record_observations as observation
        join public.all_time_verified_period_audit as audit
          on audit.observation_id=observation.id
        where observation.verified_period_id=p_period_id
          and observation.entry_type='verified_period'
          and observation.voided_at is null
          and audit.posting_sequence between 1 and 12)<>12
       or (select count(*) from public.all_time_verified_period_audit
        where verified_period_id=p_period_id and posting_sequence between 1 and 12
          and climbers_status<>'voided')<>12
       or (select count(*)
           from public.climbers_events as event
           join public.all_time_verified_period_audit as audit
             on audit.observation_id=event.observation_id
           where event.season_id=p_period_id and event.voided_at is null
             and audit.posting_sequence between 1 and 12)<>12
       or (select coalesce(sum(event.points),0)
           from public.climbers_events as event
           join public.all_time_verified_period_audit as audit
             on audit.observation_id=event.observation_id
           where event.season_id=p_period_id and event.voided_at is null
             and audit.posting_sequence between 1 and 12)<>281
       or (select count(*)
           from public.climbers_event_passes as pass
           join public.climbers_events as event on event.id=pass.event_id
           join public.all_time_verified_period_audit as audit
             on audit.observation_id=event.observation_id
           where event.season_id=p_period_id and event.voided_at is null
             and audit.posting_sequence between 1 and 12)<>281 then
      raise exception 'The protected legacy 12/281 baseline changed; no backlog entry was saved';
    end if;
  end if;

  create temp table if not exists pg_temp.legacy_append_pb_v3(
    course_id uuid,player_id uuid,score integer,primary key(course_id,player_id)
  ) on commit drop;
  truncate pg_temp.legacy_append_pb_v3;

  insert into pg_temp.legacy_append_pb_v3(course_id,player_id,score)
  select observation.course_id,observation.player_id,min(observation.score)
  from public.all_time_record_observations as observation
  where observation.entry_type='historical_import'
    and observation.identity_status='resolved'
    and observation.player_id is not null and observation.voided_at is null
  group by observation.course_id,observation.player_id;

  insert into pg_temp.legacy_append_pb_v3(course_id,player_id,score)
  select observation.course_id,observation.player_id,min(observation.score)
  from public.all_time_record_observations as observation
  join public.climbers_seasons as prior
    on prior.id=observation.verified_period_id and prior.ends_at<=v_period.starts_at
  where observation.entry_type='verified_period'
    and observation.identity_status='resolved'
    and observation.player_id is not null and observation.voided_at is null
  group by observation.course_id,observation.player_id
  on conflict(course_id,player_id) do update
    set score=least(legacy_append_pb_v3.score,excluded.score);

  insert into pg_temp.legacy_append_pb_v3(course_id,player_id,score)
  select observation.course_id,observation.player_id,min(observation.score)
  from public.all_time_record_observations as observation
  where observation.entry_type not in ('historical_import','verified_period')
    and observation.observed_at<v_period.starts_at
    and observation.identity_status='resolved'
    and observation.player_id is not null and observation.voided_at is null
  group by observation.course_id,observation.player_id
  on conflict(course_id,player_id) do update
    set score=least(legacy_append_pb_v3.score,excluded.score);

  insert into pg_temp.legacy_append_pb_v3(course_id,player_id,score)
  select observation.course_id,observation.player_id,min(observation.score)
  from public.all_time_record_observations as observation
  join public.all_time_verified_period_audit as audit
    on audit.observation_id=observation.id
  where observation.entry_type='verified_period'
    and observation.verified_period_id=p_period_id
    and observation.identity_status='resolved'
    and observation.player_id is not null and observation.voided_at is null
    and audit.climbers_status<>'voided'
    and audit.posting_sequence<v_batch_start
  group by observation.course_id,observation.player_id
  on conflict(course_id,player_id) do update
    set score=least(legacy_append_pb_v3.score,excluded.score);

  select score into v_old_pb from pg_temp.legacy_append_pb_v3
  where course_id=p_course_id and player_id=(v_base->>'player_id')::uuid;
  if not found then v_classification:='FIRST';
  elsif v_score<v_old_pb then v_classification:='BETTER';
  elsif v_score=v_old_pb then v_classification:='EQUAL';
  else v_classification:='WORSE'; end if;

  if v_classification='BETTER' then
    select coalesce(array_agg(player_id order by score,player_id),'{}'::uuid[]),count(*)::integer
      into v_passed,v_points
    from pg_temp.legacy_append_pb_v3
    where course_id=p_course_id
      and player_id<>(v_base->>'player_id')::uuid
      and score>v_score;
  end if;

  v_token:=md5(concat_ws('|',v_base->>'confirmation_token',p_authoritative_submitted_date::text,
    p_authoritative_submission_order::text,p_verified_source_batch_id::text,v_next_posting_sequence::text,
    coalesce(v_old_pb::text,'FIRST'),v_classification,array_to_string(v_passed,','),v_points::text));

  return (v_base-'confirmation_token') || jsonb_build_object(
    'replay_mode','LEGACY_V1_APPEND',
    'authoritative_submitted_date',p_authoritative_submitted_date,
    'authoritative_submission_order',p_authoritative_submission_order,
    'authoritative_time_precision','legacy_posting_sequence',
    'next_posting_sequence',v_next_posting_sequence,
    'same_card_snapshot',v_batch_count>0,
    'legacy_old_pb_score',v_old_pb,
    'legacy_climbers_classification',v_classification,
    'legacy_new_pb_score',case when v_classification in ('FIRST','BETTER') then v_score else v_old_pb end,
    'legacy_passed_player_ids',to_jsonb(v_passed),
    'legacy_climbers_points',case when v_classification='BETTER' then v_points else 0 end,
    'climbers_points',null,
    'climbers_status','calculated_after_save',
    'confirmation_token',v_token
  );
end;
$function$;
revoke all on function public._preview_all_time_verified_period_legacy_append_v3(uuid,uuid,uuid,uuid,text,integer,jsonb,text,text,text,text,date,integer,uuid)
  from public,anon,authenticated,service_role;

create or replace function public.preview_all_time_verified_period_entry_v3(
  p_period_id uuid,p_course_id uuid,p_player_id uuid,p_entry_key uuid,p_fingerprint text,p_score integer,
  p_hole_strokes jsonb,p_entry_type text,p_source_label text,p_provenance_reference text,p_notes text,
  p_authoritative_submitted_at timestamptz,p_authoritative_submitted_date date,
  p_authoritative_submission_order integer,p_authoritative_time_precision text,p_verified_source_batch_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid:=auth.uid();
  v_route text;
begin
  if v_user_id is null or not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode='42501';
  end if;
  v_route:=public._verified_period_entry_route_v3(p_period_id);
  if v_route='SOURCE_V2' then
    return public.preview_all_time_verified_period_entry_v2(
      p_period_id,p_course_id,p_player_id,p_entry_key,p_fingerprint,p_score,p_hole_strokes,
      p_entry_type,p_source_label,p_provenance_reference,p_notes,p_authoritative_submitted_at,
      p_authoritative_submitted_date,p_authoritative_submission_order,p_authoritative_time_precision,
      p_verified_source_batch_id
    ) || jsonb_build_object('replay_mode','SOURCE_V2');
  elsif v_route='LEGACY_V1_APPEND' then
    if p_authoritative_submitted_at is not null or p_authoritative_time_precision<>'date_ordered' then
      raise exception 'LEGACY_V1 backlog requires a source date and immutable period-wide posting order';
    end if;
    return public._preview_all_time_verified_period_legacy_append_v3(
      p_period_id,p_course_id,p_player_id,p_entry_key,p_fingerprint,p_score,p_hole_strokes,
      p_entry_type,p_source_label,p_provenance_reference,p_notes,p_authoritative_submitted_date,
      p_authoritative_submission_order,p_verified_source_batch_id
    );
  end if;
  raise exception 'This period mixes incompatible replay models. Chronology reconciliation is required and nothing was saved';
end;
$function$;
revoke all on function public.preview_all_time_verified_period_entry_v3(uuid,uuid,uuid,uuid,text,integer,jsonb,text,text,text,text,timestamptz,date,integer,text,uuid)
  from public,anon,authenticated;
grant execute on function public.preview_all_time_verified_period_entry_v3(uuid,uuid,uuid,uuid,text,integer,jsonb,text,text,text,text,timestamptz,date,integer,text,uuid)
  to authenticated;

create or replace function public.record_all_time_verified_period_entry_v3(
  p_period_id uuid,p_course_id uuid,p_player_id uuid,p_entry_key uuid,p_fingerprint text,p_score integer,
  p_hole_strokes jsonb,p_entry_type text,p_source_label text,p_provenance_reference text,p_notes text,p_confirmation_token text,
  p_authoritative_submitted_at timestamptz,p_authoritative_submitted_date date,
  p_authoritative_submission_order integer,p_authoritative_time_precision text,p_verified_source_batch_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid:=auth.uid();
  v_period public.climbers_seasons%rowtype;
  v_preview jsonb;
  v_observation_id uuid;
  v_event_id uuid;
  v_recorded_at timestamptz;
  v_posting_sequence integer;
  v_classification text;
  v_passed uuid[];
  v_points integer;
begin
  if v_user_id is null or not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode='42501';
  end if;
  -- Match the installed posting-sequence trigger's lock order so concurrent
  -- legacy saves cannot deadlock or take the same immutable sequence.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'krys-leagues:verified-period-posting-sequence:'||p_period_id::text,
      0
    )
  );
  select * into v_period from public.climbers_seasons where id=p_period_id for update;
  if not found then raise exception 'Climbers period was not found'; end if;
  if v_period.status='finalized' then raise exception 'A finalized Climbers period cannot be changed'; end if;

  v_preview:=public.preview_all_time_verified_period_entry_v3(
    p_period_id,p_course_id,p_player_id,p_entry_key,p_fingerprint,p_score,p_hole_strokes,
    p_entry_type,p_source_label,p_provenance_reference,p_notes,p_authoritative_submitted_at,
    p_authoritative_submitted_date,p_authoritative_submission_order,p_authoritative_time_precision,
    p_verified_source_batch_id
  );
  if v_preview->>'action'='already_saved' then return v_preview; end if;
  if p_confirmation_token is null or p_confirmation_token<>v_preview->>'confirmation_token' then
    raise exception 'The preview changed or was not explicitly confirmed; review again before saving';
  end if;

  if v_preview->>'replay_mode'='SOURCE_V2' then
    return public.record_all_time_verified_period_entry_v2(
      p_period_id,p_course_id,p_player_id,p_entry_key,p_fingerprint,p_score,p_hole_strokes,
      p_entry_type,p_source_label,p_provenance_reference,p_notes,p_confirmation_token,
      p_authoritative_submitted_at,p_authoritative_submitted_date,p_authoritative_submission_order,
      p_authoritative_time_precision,p_verified_source_batch_id
    );
  end if;
  if v_preview->>'replay_mode'<>'LEGACY_V1_APPEND' then
    raise exception 'Unsupported verified-period replay route';
  end if;

  v_recorded_at:=clock_timestamp();
  insert into public.all_time_record_observations(
    batch_id,course_id,player_id,identity_status,historical_player_name,score,source_course_name,source_row,
    fingerprint,observed_at,metadata,entry_type,hole_strokes,source_label,provenance_reference,notes,recorded_by,
    entry_key,recorded_at,authoritative_submitted_at,authoritative_submitted_date,authoritative_submission_order,
    authoritative_time_precision,verified_period_id,verified_source_batch_id
  ) values(
    null,p_course_id,(v_preview->>'player_id')::uuid,'resolved',v_preview->>'player_name',
    (v_preview->>'submitted_score')::integer,v_preview->>'course_name',null,lower(p_fingerprint),v_recorded_at,
    jsonb_build_object('entry_method',p_entry_type,'verified_period_id',p_period_id::text,
      'climbers_status','pending_period_replay','legacy_source_submitted_date',p_authoritative_submitted_date,
      'legacy_source_posting_order',p_authoritative_submission_order,
      'verified_source_batch_id',p_verified_source_batch_id),
    'verified_period',nullif(p_hole_strokes,'null'::jsonb),nullif(btrim(p_source_label),''),
    nullif(btrim(p_provenance_reference),''),nullif(btrim(p_notes),''),v_user_id,p_entry_key,v_recorded_at,
    null,p_authoritative_submitted_date,p_authoritative_submission_order,'date_ordered',
    p_period_id,p_verified_source_batch_id
  ) returning id into v_observation_id;

  insert into public.all_time_verified_period_audit(
    observation_id,verified_period_id,course_id,player_id,recorded_at,recorded_by,source_label,provenance_reference,
    notes,all_time_classification,current_pb_score,submitted_score,new_pb_score,climbers_points,climbers_status,
    authoritative_submitted_at,authoritative_submitted_date,authoritative_submission_order,authoritative_time_precision,
    verified_source_batch_id,passed_player_ids,calculation_version
  ) values(
    v_observation_id,p_period_id,p_course_id,(v_preview->>'player_id')::uuid,v_recorded_at,v_user_id,p_source_label,
    nullif(btrim(p_provenance_reference),''),nullif(btrim(p_notes),''),v_preview->>'legacy_climbers_classification',
    nullif(v_preview->>'legacy_old_pb_score','')::integer,(v_preview->>'submitted_score')::integer,
    nullif(v_preview->>'legacy_new_pb_score','')::integer,0,'pending_period_replay',null,
    p_authoritative_submitted_date,p_authoritative_submission_order,'date_ordered',p_verified_source_batch_id,
    '{}'::uuid[],'climbers-verified-period-posting-v1'
  );

  select posting_sequence into v_posting_sequence
  from public.all_time_verified_period_audit where observation_id=v_observation_id;
  if v_posting_sequence is distinct from (v_preview->>'next_posting_sequence')::integer then
    raise exception 'Legacy posting order changed after preview; no rows were saved';
  end if;

  v_classification:=v_preview->>'legacy_climbers_classification';
  v_passed:=array(select jsonb_array_elements_text(v_preview->'legacy_passed_player_ids')::uuid);
  v_points:=case when v_classification='BETTER'
    then (v_preview->>'legacy_climbers_points')::integer else 0 end;

  if v_classification in ('FIRST','BETTER') then
    insert into public.climbers_events(
      season_id,observation_id,player_id,course_id,difficulty,old_pb_score,new_pb_score,points,
      calculation_version,source_label,provenance_reference,created_by,effective_at,effective_date,
      effective_order,effective_time_precision
    ) values(
      p_period_id,v_observation_id,(v_preview->>'player_id')::uuid,p_course_id,v_preview->>'difficulty',
      nullif(v_preview->>'legacy_old_pb_score','')::integer,
      (v_preview->>'submitted_score')::integer,v_points,'climbers-verified-period-posting-v1',
      p_source_label,nullif(btrim(p_provenance_reference),''),v_user_id,null,
      p_authoritative_submitted_date,p_authoritative_submission_order,'date_ordered'
    ) returning id into v_event_id;
    insert into public.climbers_event_passes(event_id,passed_player_id)
    select v_event_id,passed_player_id from unnest(v_passed) as passed(passed_player_id);
  end if;

  update public.all_time_verified_period_audit set
    all_time_classification=v_classification,
    current_pb_score=nullif(v_preview->>'legacy_old_pb_score','')::integer,
    submitted_score=(v_preview->>'submitted_score')::integer,
    new_pb_score=case when v_classification in ('FIRST','BETTER')
      then (v_preview->>'submitted_score')::integer else null end,
    passed_player_ids=v_passed,climbers_points=v_points,climbers_status='replayed',
    calculation_version='climbers-verified-period-posting-v1',calculated_at=clock_timestamp(),
    updated_at=clock_timestamp()
  where observation_id=v_observation_id;

  if v_preview->>'all_time_classification' in ('FIRST','BETTER') then
    perform public.refresh_all_time_best_record(p_course_id,(v_preview->>'player_id')::uuid);
  end if;

  return jsonb_build_object(
    'action','saved','observation_id',v_observation_id,'recorded_at',v_recorded_at,
    'period_id',p_period_id,'target_period_label',v_preview->>'target_period_label',
    'all_time_classification',v_preview->>'all_time_classification',
    'new_pb_score',v_preview->'new_pb_score','climbers_classification',v_classification,
    'climbers_points',v_points,'passed_player_ids',to_jsonb(v_passed),
    'climbers_status','replayed','calculation_version','climbers-verified-period-posting-v1',
    'replay_mode','LEGACY_V1_APPEND','posting_sequence',v_posting_sequence,
    'protected_legacy_baseline_untouched',true
  );
end;
$function$;
revoke all on function public.record_all_time_verified_period_entry_v3(uuid,uuid,uuid,uuid,text,integer,jsonb,text,text,text,text,text,timestamptz,date,integer,text,uuid)
  from public,anon,authenticated;
grant execute on function public.record_all_time_verified_period_entry_v3(uuid,uuid,uuid,uuid,text,integer,jsonb,text,text,text,text,text,timestamptz,date,integer,text,uuid)
  to authenticated;

commit;

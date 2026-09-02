-- Install after all_time_late_backfill.sql.
-- Verified Previous Period entries use the selected Climbers period as their
-- scope. They intentionally do not invent a played-at timestamp or order.
-- Climbers effect remains pending until a deterministic period replay is
-- separately authorized. The selected period must already have ended; this
-- path is intentionally not a replacement for current-period scoring.
begin;

do $$
begin
  if to_regclass('public.all_time_record_observations') is null
     or to_regclass('public.all_time_best_records') is null
     or to_regclass('public.all_time_courses') is null
     or to_regclass('public.players') is null
     or to_regclass('public.all_time_correction_audit') is null
     or to_regclass('public.climbers_seasons') is null
     or to_regprocedure('public.is_current_user_site_admin()') is null
     or to_regprocedure('public.refresh_all_time_best_record(uuid,uuid)') is null then
    raise exception 'Install the All-Time, Climbers, and late-backfill layers before verified period support';
  end if;
end;
$$;

alter table public.all_time_record_observations
  add column if not exists verified_period_id uuid references public.climbers_seasons(id) on delete restrict;

alter table public.all_time_record_observations
  drop constraint if exists all_time_observation_entry_type_check;
alter table public.all_time_record_observations
  add constraint all_time_observation_entry_type_check
  check (entry_type in ('historical_import','full_card','quick_score','authoritative_league_source','late_backfill','verified_period'));

alter table public.all_time_record_observations
  drop constraint if exists all_time_observation_verified_period_check;
alter table public.all_time_record_observations
  add constraint all_time_observation_verified_period_check
  check (
    (entry_type = 'verified_period' and verified_period_id is not null)
    or (entry_type <> 'verified_period' and verified_period_id is null)
  );

create index if not exists all_time_observations_verified_period_idx
  on public.all_time_record_observations(verified_period_id,recorded_at,id)
  where entry_type='verified_period' and voided_at is null;

create table if not exists public.all_time_verified_period_audit (
  id uuid primary key default gen_random_uuid(),
  observation_id uuid not null unique references public.all_time_record_observations(id) on delete restrict,
  verified_period_id uuid not null references public.climbers_seasons(id) on delete restrict,
  course_id uuid not null references public.all_time_courses(id) on delete restrict,
  player_id uuid not null references public.players(id) on delete restrict,
  recorded_at timestamptz not null,
  recorded_by uuid not null references auth.users(id) on delete restrict,
  source_label text not null check (btrim(source_label) <> ''),
  provenance_reference text,
  notes text,
  all_time_classification text not null check (all_time_classification in ('FIRST','BETTER','EQUAL','WORSE')),
  current_pb_score integer,
  submitted_score integer not null,
  new_pb_score integer,
  climbers_points integer not null default 0 check (climbers_points=0),
  climbers_status text not null check (climbers_status in ('pending_period_replay','voided')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists all_time_verified_period_audit_period_idx
  on public.all_time_verified_period_audit(verified_period_id,recorded_at,id);

create or replace function public.sync_all_time_verified_period_audit()
returns trigger language plpgsql security definer set search_path to '' as $function$
begin
  if old.entry_type='verified_period' then
    update public.all_time_verified_period_audit
    set submitted_score=new.score,
        new_pb_score=null,
        climbers_points=0,
        climbers_status=case when new.voided_at is null then 'pending_period_replay' else 'voided' end,
        updated_at=clock_timestamp()
    where observation_id=new.id;
  end if;
  return new;
end;
$function$;

drop trigger if exists all_time_verified_period_audit_sync on public.all_time_record_observations;
create trigger all_time_verified_period_audit_sync
after update on public.all_time_record_observations
for each row execute function public.sync_all_time_verified_period_audit();

create or replace function public.preview_all_time_verified_period_entry(
  p_period_id uuid,p_course_id uuid,p_player_id uuid,p_entry_key uuid,p_fingerprint text,p_score integer,
  p_hole_strokes jsonb,p_entry_type text,p_source_label text,p_provenance_reference text,p_notes text
) returns jsonb language plpgsql security definer set search_path to '' as $function$
declare
  v_user_id uuid:=auth.uid(); v_period public.climbers_seasons%rowtype;
  v_course public.all_time_courses%rowtype; v_player public.players%rowtype;
  v_current_pb integer; v_score integer:=p_score; v_classification text; v_token text;
begin
  if v_user_id is null or not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode='42501';
  end if;
  if p_period_id is null or p_entry_key is null or p_fingerprint is null
     or lower(p_fingerprint)!~'^[0-9a-f]{64}$' then
    raise exception 'Period, entry idempotency key, and fingerprint are required';
  end if;
  if nullif(btrim(p_source_label),'') is null then raise exception 'A source or provenance label is required'; end if;
  if p_entry_type not in ('full_card','quick_score') then raise exception 'Unsupported verified All-Time entry type'; end if;
  select * into v_period from public.climbers_seasons
  where id=p_period_id and status<>'finalized' and ends_at<=clock_timestamp();
  if not found then raise exception 'The selected Climbers period is unavailable or finalized'; end if;
  select * into v_course from public.all_time_courses where id=p_course_id and active and difficulty in ('Easy','Hard');
  if not found then raise exception 'The selected Easy/Hard course is unavailable'; end if;
  select * into v_player from public.players where id=public.resolve_canonical_player_id(p_player_id) and active;
  if not found then raise exception 'The selected canonical player is unavailable'; end if;
  if p_score is null and p_entry_type='quick_score' then raise exception 'Quick Score requires a score relative to par'; end if;
  if p_entry_type='full_card' then
    if p_hole_strokes is null or jsonb_typeof(p_hole_strokes)<>'array' or jsonb_array_length(p_hole_strokes)<>18
       or v_course.par is null or v_course.hole_pars is null or jsonb_typeof(v_course.hole_pars)<>'array'
       or jsonb_array_length(v_course.hole_pars)<>18 then
      raise exception 'Full-card entry requires 18 hole scores and 18 authoritative hole pars';
    end if;
    if exists(select 1 from jsonb_array_elements(p_hole_strokes) value
      where jsonb_typeof(value)<>'number' or value::text !~ '^[0-9]+$' or value::text::integer<1>) then
      raise exception 'Hole scores must be positive whole numbers';
    end if;
    if exists(select 1 from jsonb_array_elements(v_course.hole_pars) value
      where jsonb_typeof(value)<>'number' or value::text !~ '^[0-9]+$' or value::text::integer<1>) then
      raise exception 'Course hole pars must be positive whole numbers';
    end if;
    if (select sum(value::text::integer) from jsonb_array_elements(v_course.hole_pars))<>v_course.par then
      raise exception 'Course hole pars must total the authoritative course par';
    end if;
    v_score:=(select sum(value::text::integer) from jsonb_array_elements(p_hole_strokes))-v_course.par;
  end if;
  if exists(select 1 from public.all_time_record_observations where entry_key=p_entry_key) then
    if exists(select 1 from public.all_time_record_observations where entry_key=p_entry_key and fingerprint<>lower(p_fingerprint)) then
      raise exception 'This idempotency key is already bound to a different entry';
    end if;
    return jsonb_build_object('action','already_saved','fingerprint',lower(p_fingerprint));
  end if;
  if exists(select 1 from public.all_time_record_observations where fingerprint=lower(p_fingerprint)) then
    return jsonb_build_object('action','already_saved','fingerprint',lower(p_fingerprint));
  end if;
  select min(o.score) into v_current_pb
  from public.all_time_record_observations o
  where o.course_id=p_course_id and o.player_id=v_player.id and o.identity_status='resolved' and o.voided_at is null;
  if v_current_pb is null then v_classification:='FIRST';
  elsif v_score<v_current_pb then v_classification:='BETTER';
  elsif v_score=v_current_pb then v_classification:='EQUAL';
  else v_classification:='WORSE'; end if;
  v_token:=md5(concat_ws('|',p_period_id::text,p_entry_key::text,lower(p_fingerprint),p_course_id::text,
    v_player.id::text,v_score::text,coalesce(v_current_pb::text,'FIRST'),v_classification));
  return jsonb_build_object(
    'action',lower(v_classification),'period_id',v_period.id,'target_period_label',v_period.label,
    'target_period_status',v_period.status,'course_id',p_course_id,'player_id',v_player.id,
    'player_name',v_player.screen_name,'course_name',v_course.display_name,'difficulty',v_course.difficulty,
    'recorded_at','not yet recorded','authoritative_submitted_at',null,
    'authoritative_submitted_date',null,'authoritative_submission_order',null,
    'authoritative_time_precision','unknown','current_pb_score',v_current_pb,
    'all_time_classification',v_classification,'submitted_score',v_score,
    'new_pb_score',case when v_classification in ('FIRST','BETTER') then v_score else v_current_pb end,
    'climbers_points',0,'climbers_status','pending_period_replay',
    'historical_pb_status','not_determinable_without_intra_period_order',
    'confirmation_token',v_token);
end;
$function$;
revoke all on function public.preview_all_time_verified_period_entry(uuid,uuid,uuid,uuid,text,integer,jsonb,text,text,text,text) from public,anon,authenticated;
grant execute on function public.preview_all_time_verified_period_entry(uuid,uuid,uuid,uuid,text,integer,jsonb,text,text,text,text) to authenticated;

create or replace function public.record_all_time_verified_period_entry(
  p_period_id uuid,p_course_id uuid,p_player_id uuid,p_entry_key uuid,p_fingerprint text,p_score integer,
  p_hole_strokes jsonb,p_entry_type text,p_source_label text,p_provenance_reference text,p_notes text,p_confirmation_token text
) returns jsonb language plpgsql security definer set search_path to '' as $function$
declare
  v_user_id uuid:=auth.uid(); v_preview jsonb; v_observation_id uuid; v_recorded_at timestamptz;
begin
  if v_user_id is null or not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode='42501';
  end if;
  v_preview:=public.preview_all_time_verified_period_entry(p_period_id,p_course_id,p_player_id,p_entry_key,p_fingerprint,p_score,p_hole_strokes,p_entry_type,p_source_label,p_provenance_reference,p_notes);
  if v_preview->>'action'='already_saved' then return v_preview; end if;
  if p_confirmation_token is null or p_confirmation_token<>v_preview->>'confirmation_token' then
    raise exception 'The preview changed or was not explicitly confirmed; review again before saving';
  end if;
  v_recorded_at:=clock_timestamp();
  insert into public.all_time_record_observations(
    batch_id,course_id,player_id,identity_status,historical_player_name,score,source_course_name,source_row,
    fingerprint,observed_at,metadata,entry_type,hole_strokes,source_label,provenance_reference,notes,recorded_by,
    entry_key,recorded_at,authoritative_submitted_at,authoritative_submitted_date,authoritative_submission_order,
    authoritative_time_precision,verified_period_id
  ) values(
    null,p_course_id,(v_preview->>'player_id')::uuid,'resolved',v_preview->>'player_name',(v_preview->>'submitted_score')::integer,
    v_preview->>'course_name',null,lower(p_fingerprint),v_recorded_at,
    jsonb_build_object('entry_method',p_entry_type,'verified_period_id',p_period_id::text,
      'climbers_status','pending_period_replay','all_time_classification',v_preview->>'all_time_classification'),
    'verified_period',nullif(p_hole_strokes,'null'::jsonb),nullif(btrim(p_source_label),''),
    nullif(btrim(p_provenance_reference),''),nullif(btrim(p_notes),''),v_user_id,p_entry_key,v_recorded_at,
    null,null,null,'unknown',p_period_id
  ) returning id into v_observation_id;
  if v_preview->>'all_time_classification' in ('FIRST','BETTER') then
    perform public.refresh_all_time_best_record(p_course_id,(v_preview->>'player_id')::uuid);
  end if;
  insert into public.all_time_verified_period_audit(
    observation_id,verified_period_id,course_id,player_id,recorded_at,recorded_by,source_label,provenance_reference,
    notes,all_time_classification,current_pb_score,submitted_score,new_pb_score,climbers_points,climbers_status
  ) values(
    v_observation_id,p_period_id,p_course_id,(v_preview->>'player_id')::uuid,v_recorded_at,v_user_id,p_source_label,
    nullif(btrim(p_provenance_reference),''),nullif(btrim(p_notes),''),v_preview->>'all_time_classification',
    nullif(v_preview->>'current_pb_score','')::integer,(v_preview->>'submitted_score')::integer,
    nullif(v_preview->>'new_pb_score','')::integer,0,'pending_period_replay'
  );
  return jsonb_build_object('action','saved','observation_id',v_observation_id,'recorded_at',v_recorded_at,
    'authoritative_submitted_at',null,'authoritative_time_precision','unknown','period_id',p_period_id,
    'target_period_label',v_preview->>'target_period_label','all_time_classification',v_preview->>'all_time_classification',
    'climbers_points',0,'climbers_status','pending_period_replay');
end;
$function$;
revoke all on function public.record_all_time_verified_period_entry(uuid,uuid,uuid,uuid,text,integer,jsonb,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.record_all_time_verified_period_entry(uuid,uuid,uuid,uuid,text,integer,jsonb,text,text,text,text,text) to authenticated;

alter table public.all_time_verified_period_audit enable row level security;
drop policy if exists all_time_verified_period_audit_admin_select on public.all_time_verified_period_audit;
create policy all_time_verified_period_audit_admin_select on public.all_time_verified_period_audit
  for select to authenticated using (public.is_current_user_site_admin());

commit;

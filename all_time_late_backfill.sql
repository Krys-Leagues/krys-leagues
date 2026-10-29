-- Protected late/backfill entry support for legitimate submissions that were
-- made before data entry. This is not the historical workbook importer.
--
-- Install after all_time_normal_entry_climbers.sql and review at the SQL gate
-- before execution. The application must not execute this file automatically.
begin;

do $$
begin
  if to_regclass('public.all_time_record_observations') is null
     or to_regclass('public.all_time_correction_audit') is null
     or to_regclass('public.climbers_events') is null
     or to_regclass('public.climbers_seasons') is null
     or to_regclass('public.climbers_legacy_baseline_imports') is null then
    raise exception 'Install the normal All-Time, Climbers, and legacy baseline layers before late backfill support';
  end if;
end;
$$;

alter table public.all_time_record_observations
  add column if not exists recorded_at timestamptz,
  add column if not exists authoritative_submitted_at timestamptz,
  add column if not exists authoritative_submitted_date date,
  add column if not exists authoritative_submission_order integer,
  add column if not exists authoritative_time_precision text not null default 'unknown';

alter table public.all_time_record_observations
  drop constraint if exists all_time_observation_entry_type_check;
alter table public.all_time_record_observations
  add constraint all_time_observation_entry_type_check
  check (entry_type in ('historical_import','full_card','quick_score','authoritative_league_source','late_backfill'));

alter table public.all_time_record_observations
  drop constraint if exists all_time_observation_authoritative_time_check;
alter table public.all_time_record_observations
  add constraint all_time_observation_authoritative_time_check
  check (
    (authoritative_time_precision = 'unknown'
      and authoritative_submitted_at is null
      and authoritative_submitted_date is null
      and authoritative_submission_order is null)
    or (authoritative_time_precision = 'exact'
      and authoritative_submitted_at is not null
      and authoritative_submitted_date = (authoritative_submitted_at at time zone 'UTC')::date
      and authoritative_submission_order is null)
    or (authoritative_time_precision = 'date_ordered'
      and authoritative_submitted_at is null
      and authoritative_submitted_date is not null
      and authoritative_submission_order is not null
      and authoritative_submission_order > 0)
  );

create index if not exists all_time_observations_authoritative_time_idx
  on public.all_time_record_observations(authoritative_submitted_date,authoritative_submitted_at,authoritative_submission_order,id)
  where voided_at is null;

create or replace function public.set_all_time_observation_recorded_time()
returns trigger language plpgsql security definer set search_path to '' as $function$
begin
  if new.recorded_at is null then new.recorded_at := clock_timestamp(); end if;
  -- Normal live entries are authoritative at the server save instant. A
  -- historical import remains unknown, and a late entry must provide its own
  -- source-backed date/time or date/order pair.
  if new.entry_type in ('quick_score','full_card') and new.authoritative_time_precision = 'unknown' then
    new.authoritative_submitted_at := new.recorded_at;
    new.authoritative_submitted_date := (new.recorded_at at time zone 'UTC')::date;
    new.authoritative_time_precision := 'exact';
  end if;
  if new.entry_type = 'late_backfill' and new.authoritative_time_precision = 'unknown' then
    raise exception 'Late/backfill entries require an authoritative source timestamp or date/order';
  end if;
  return new;
end;
$function$;
drop trigger if exists all_time_observation_recorded_time on public.all_time_record_observations;
create trigger all_time_observation_recorded_time
before insert on public.all_time_record_observations
for each row execute function public.set_all_time_observation_recorded_time();

create or replace function public.guard_late_backfill_mutation()
returns trigger language plpgsql security definer set search_path to '' as $function$
begin
  if old.entry_type = 'late_backfill'
     and current_setting('krys.late_backfill_mutation', true) is distinct from 'on'
     and (
       new.score is distinct from old.score
       or new.authoritative_submitted_at is distinct from old.authoritative_submitted_at
       or new.authoritative_submitted_date is distinct from old.authoritative_submitted_date
       or new.authoritative_submission_order is distinct from old.authoritative_submission_order
       or new.voided_at is distinct from old.voided_at
       or new.void_reason is distinct from old.void_reason
     ) then
    raise exception 'Late/backfill entries require the protected late correction or void workflow';
  end if;
  return new;
end;
$function$;
drop trigger if exists late_backfill_mutation_guard on public.all_time_record_observations;
create trigger late_backfill_mutation_guard
before update on public.all_time_record_observations
for each row execute function public.guard_late_backfill_mutation();

alter table public.climbers_events
  add column if not exists effective_at timestamptz,
  add column if not exists effective_date date,
  add column if not exists effective_order integer,
  add column if not exists effective_time_precision text not null default 'exact';

update public.climbers_events
set effective_at = coalesce(effective_at,created_at),
    effective_date = coalesce(effective_date,(coalesce(effective_at,created_at) at time zone 'UTC')::date),
    effective_time_precision = coalesce(effective_time_precision,'exact')
where effective_at is null or effective_date is null or effective_time_precision is null;

alter table public.climbers_events
  alter column effective_date set not null;

alter table public.climbers_events
  drop constraint if exists climbers_events_effective_time_check;
alter table public.climbers_events
  add constraint climbers_events_effective_time_check
  check (
    (effective_time_precision = 'exact' and effective_at is not null and effective_order is null)
    or (effective_time_precision = 'date_ordered' and effective_at is null and effective_order is not null and effective_order > 0)
  );

create table if not exists public.all_time_late_backfill_audit (
  id uuid primary key default gen_random_uuid(),
  observation_id uuid not null unique references public.all_time_record_observations(id) on delete restrict,
  entry_key uuid not null unique,
  course_id uuid not null references public.all_time_courses(id) on delete restrict,
  player_id uuid not null references public.players(id) on delete restrict,
  authoritative_submitted_at timestamptz,
  authoritative_submitted_date date not null,
  authoritative_submission_order integer,
  authoritative_time_precision text not null check (authoritative_time_precision in ('exact','date_ordered')),
  recorded_at timestamptz not null,
  recorded_by uuid not null references auth.users(id) on delete restrict,
  source_label text not null check (btrim(source_label) <> ''),
  provenance_reference text,
  notes text,
  classification text not null check (classification in ('FIRST','BETTER','EQUAL','WORSE')),
  old_pb_score integer,
  submitted_score integer not null,
  new_pb_score integer,
  passed_player_ids uuid[] not null default '{}'::uuid[],
  climbers_points integer not null default 0 check (climbers_points >= 0),
  target_season_id uuid references public.climbers_seasons(id) on delete restrict,
  target_season_label text not null,
  status text not null check (status in ('pending_season','pending_replay','replayed','blocked','voided')),
  calculation_version text not null default 'climbers-late-backfill-v1',
  confirmation_token text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  calculated_at timestamptz
);
create index if not exists all_time_late_backfill_period_idx
  on public.all_time_late_backfill_audit(authoritative_submitted_date,status,target_season_id);

alter table public.all_time_late_backfill_audit enable row level security;
drop policy if exists all_time_late_backfill_audit_admin_select on public.all_time_late_backfill_audit;
create policy all_time_late_backfill_audit_admin_select on public.all_time_late_backfill_audit
for select to authenticated using (public.is_current_user_site_admin());
grant select on public.all_time_late_backfill_audit to authenticated;
revoke insert,update,delete on public.all_time_late_backfill_audit from public,anon,authenticated;

create or replace view public.climbers_year_to_date as
select e.player_id,sum(e.points)::integer as points,count(*)::integer as event_count
from public.climbers_events e
where e.voided_at is null
  and e.effective_date >= make_date(extract(year from (now() at time zone 'UTC'))::integer,1,1)
  and e.effective_date < make_date((extract(year from (now() at time zone 'UTC'))::integer + 1),1,1)
group by e.player_id;

create or replace function public.late_backfill_target_period()
returns table(starts_at timestamptz,ends_at timestamptz,label text)
language sql stable security definer set search_path to '' as $function$
select cutoff_at,cutoff_at + interval '14 days','Aug 15–Aug 28, 2026'
from public.climbers_legacy_baseline_imports
where import_key='all_time_leaderboard_2026_08_14'
limit 1
$function$;
revoke all on function public.late_backfill_target_period() from public,anon,authenticated;

create or replace function public.replay_climbers_late_backfill_season(p_season_id uuid)
returns jsonb language plpgsql security definer set search_path to '' as $function$
declare
  v_user_id uuid:=auth.uid(); v_season public.climbers_seasons%rowtype; v_period record;
  v_row record; v_old integer; v_classification text; v_points integer; v_passed uuid[];
  v_event_id uuid; v_audit public.all_time_late_backfill_audit%rowtype;
  v_blocked text; v_replayed integer:=0; v_voided integer:=0;
begin
  if v_user_id is null or not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required' using errcode='42501'; end if;
  select * into v_season from public.climbers_seasons where id=p_season_id for update;
  if not found then raise exception 'Climbers season was not found'; end if;
  select * into v_period from public.late_backfill_target_period();
  if not found or v_season.starts_at<>v_period.starts_at or v_season.ends_at<>v_period.ends_at then
    raise exception 'Only the fixed Aug 15–Aug 28, 2026 backfill period can be replayed';
  end if;
  if v_season.status='finalized' then raise exception 'A finalized Climbers season cannot be replayed'; end if;

  if exists (
    select 1 from public.all_time_record_observations o
    where o.entry_type in ('quick_score','full_card','authoritative_league_source')
      and o.voided_at is null and o.authoritative_time_precision='unknown'
  ) then
    v_blocked:='Existing non-import observations lack authoritative timestamps';
  end if;
  if exists (
    select 1 from public.all_time_record_observations o
    where o.entry_type='late_backfill' and o.voided_at is null
      and o.authoritative_submitted_date>=v_period.starts_at::date
      and o.authoritative_submitted_date<v_period.ends_at::date
      and o.authoritative_time_precision not in ('exact','date_ordered')
  ) then
    v_blocked:=coalesce(v_blocked||'; ','')||'Late entries need exact time or date/order evidence';
  end if;
  if v_blocked is not null then
    update public.all_time_late_backfill_audit a set status='blocked',updated_at=clock_timestamp()
    where a.observation_id in (select o.id from public.all_time_record_observations o where o.entry_type='late_backfill' and o.voided_at is null);
    raise exception '%',v_blocked;
  end if;

  create temp table late_backfill_pb(course_id uuid,player_id uuid,score integer,primary key(course_id,player_id)) on commit drop;
  insert into late_backfill_pb(course_id,player_id,score)
  select o.course_id,o.player_id,min(o.score)
  from public.all_time_record_observations o
  where o.entry_type='historical_import' and o.identity_status='resolved' and o.player_id is not null and o.voided_at is null
  group by o.course_id,o.player_id;

  for v_row in
    select o.* from public.all_time_record_observations o
    where o.voided_at is null
      and (
        o.entry_type='late_backfill'
        or o.entry_type in ('quick_score','full_card','authoritative_league_source')
      )
      and o.authoritative_submitted_date>=v_period.starts_at::date
      and o.authoritative_submitted_date<v_period.ends_at::date
    order by o.authoritative_submitted_date,
      case when o.authoritative_time_precision='exact' then 0 else 1 end,
      o.authoritative_submitted_at nulls last,
      o.authoritative_submission_order nulls last,
      o.id
  loop
    if v_row.entry_type<>'late_backfill' then
      insert into late_backfill_pb values(v_row.course_id,v_row.player_id,v_row.score)
      on conflict(course_id,player_id) do update set score=least(late_backfill_pb.score,excluded.score);
      continue;
    end if;
    select score into v_old from late_backfill_pb where course_id=v_row.course_id and player_id=v_row.player_id;
    if v_old is null then v_classification:='FIRST';
    elsif v_row.score<v_old then v_classification:='BETTER';
    elsif v_row.score=v_old then v_classification:='EQUAL';
    else v_classification:='WORSE'; end if;
    v_passed:='{}'::uuid[]; v_points:=0;
    if v_classification='BETTER' then
      select coalesce(array_agg(player_id order by score,player_id),'{}'::uuid[]),count(*)::integer
      into v_passed,v_points from late_backfill_pb
      where course_id=v_row.course_id and player_id<>v_row.player_id and score>v_row.score;
    end if;
    select id into v_event_id from public.climbers_events where observation_id=v_row.id and season_id=p_season_id;
    if v_classification in ('FIRST','BETTER') then
      if v_event_id is null then
        insert into public.climbers_events(
          season_id,observation_id,player_id,course_id,difficulty,old_pb_score,new_pb_score,points,
          calculation_version,source_label,provenance_reference,created_by,effective_at,effective_date,
          effective_order,effective_time_precision
        ) values(
          p_season_id,v_row.id,v_row.player_id,v_row.course_id,
          (select difficulty from public.all_time_courses where id=v_row.course_id),v_old,v_row.score,v_points,
          'climbers-late-backfill-v1',v_row.source_label,v_row.provenance_reference,v_user_id,
          v_row.authoritative_submitted_at,v_row.authoritative_submitted_date,v_row.authoritative_submission_order,
          v_row.authoritative_time_precision
        ) returning id into v_event_id;
      else
        update public.climbers_events set old_pb_score=v_old,new_pb_score=v_row.score,points=v_points,
          calculation_version='climbers-late-backfill-v1',source_label=v_row.source_label,
          provenance_reference=v_row.provenance_reference,effective_at=v_row.authoritative_submitted_at,
          effective_date=v_row.authoritative_submitted_date,effective_order=v_row.authoritative_submission_order,
          effective_time_precision=v_row.authoritative_time_precision,voided_at=null,voided_by=null,void_reason=null
        where id=v_event_id;
      end if;
      delete from public.climbers_event_passes where event_id=v_event_id;
      insert into public.climbers_event_passes(event_id,passed_player_id)
      select v_event_id,passed from unnest(v_passed) passed;
      insert into public.all_time_late_backfill_audit(
        observation_id,entry_key,course_id,player_id,authoritative_submitted_at,authoritative_submitted_date,
        authoritative_submission_order,authoritative_time_precision,recorded_at,recorded_by,source_label,
        provenance_reference,notes,classification,old_pb_score,submitted_score,new_pb_score,passed_player_ids,
        climbers_points,target_season_id,target_season_label,status,confirmation_token,calculated_at
      ) select v_row.id,v_row.entry_key,v_row.course_id,v_row.player_id,v_row.authoritative_submitted_at,
        v_row.authoritative_submitted_date,v_row.authoritative_submission_order,v_row.authoritative_time_precision,
        v_row.recorded_at,v_row.recorded_by,coalesce(v_row.source_label,'Unknown source'),v_row.provenance_reference,
        v_row.notes,v_classification,v_old,v_row.score,v_row.score,v_passed,v_points,p_season_id,v_period.label,
        'replayed',coalesce(v_row.metadata->>'confirmation_token','replay'),clock_timestamp()
      on conflict(observation_id) do update set classification=excluded.classification,old_pb_score=excluded.old_pb_score,
        submitted_score=excluded.submitted_score,new_pb_score=excluded.new_pb_score,passed_player_ids=excluded.passed_player_ids,
        climbers_points=excluded.climbers_points,target_season_id=p_season_id,target_season_label=excluded.target_season_label,
        status='replayed',calculated_at=clock_timestamp(),updated_at=clock_timestamp();
      v_replayed:=v_replayed+1;
      insert into late_backfill_pb values(v_row.course_id,v_row.player_id,v_row.score)
      on conflict(course_id,player_id) do update set score=least(late_backfill_pb.score,excluded.score);
    else
      if v_event_id is not null then
        update public.climbers_events set voided_at=clock_timestamp(),voided_by=v_user_id,
          void_reason='Backfill replay: submission did not establish a PB' where id=v_event_id;
      end if;
      insert into public.all_time_late_backfill_audit(
        observation_id,entry_key,course_id,player_id,authoritative_submitted_at,authoritative_submitted_date,
        authoritative_submission_order,authoritative_time_precision,recorded_at,recorded_by,source_label,
        provenance_reference,notes,classification,old_pb_score,submitted_score,new_pb_score,passed_player_ids,
        climbers_points,target_season_id,target_season_label,status,confirmation_token,calculated_at
      ) select v_row.id,v_row.entry_key,v_row.course_id,v_row.player_id,v_row.authoritative_submitted_at,
        v_row.authoritative_submitted_date,v_row.authoritative_submission_order,v_row.authoritative_time_precision,
        v_row.recorded_at,v_row.recorded_by,coalesce(v_row.source_label,'Unknown source'),v_row.provenance_reference,
        v_row.notes,v_classification,v_old,v_row.score,null,v_passed,0,p_season_id,v_period.label,'replayed',
        coalesce(v_row.metadata->>'confirmation_token','replay'),clock_timestamp()
      on conflict(observation_id) do update set classification=excluded.classification,old_pb_score=excluded.old_pb_score,
        submitted_score=excluded.submitted_score,new_pb_score=null,passed_player_ids='{}'::uuid[],climbers_points=0,
        target_season_id=p_season_id,target_season_label=excluded.target_season_label,status='replayed',
        calculated_at=clock_timestamp(),updated_at=clock_timestamp();
      v_voided:=v_voided+1;
    end if;
  end loop;
  return jsonb_build_object('season_id',p_season_id,'replayed_entries',v_replayed,'zero_effect_entries',v_voided,'calculation_version','climbers-late-backfill-v1');
end;
$function$;
revoke all on function public.replay_climbers_late_backfill_season(uuid) from public,anon,authenticated;
grant execute on function public.replay_climbers_late_backfill_season(uuid) to authenticated;

create or replace function public.preview_all_time_late_backfill_entry(
  p_course_id uuid,p_player_id uuid,p_entry_key uuid,p_fingerprint text,p_score integer,
  p_authoritative_submitted_at timestamptz,p_authoritative_submitted_date date,
  p_authoritative_submission_order integer,p_authoritative_time_precision text,
  p_source_label text,p_provenance_reference text,p_notes text
) returns jsonb language plpgsql security definer set search_path to '' as $function$
declare
  v_user_id uuid:=auth.uid(); v_course public.all_time_courses%rowtype; v_player public.players%rowtype;
  v_period record; v_starts date; v_ends date; v_date date; v_old integer; v_classification text;
  v_points integer:=0; v_passed uuid[]:='{}'::uuid[]; v_row record; v_season_id uuid; v_season_status text;
  v_season_count integer; v_ordering_issue text; v_token text;
begin
  if v_user_id is null or not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required' using errcode='42501'; end if;
  if p_entry_key is null or p_fingerprint is null or lower(p_fingerprint)!~'^[0-9a-f]{64}$' then raise exception 'Entry key and fingerprint are required'; end if;
  if p_score is null then raise exception 'A final score is required'; end if;
  if nullif(btrim(p_source_label),'') is null then raise exception 'A source or provenance label is required'; end if;
  select * into v_course from public.all_time_courses where id=p_course_id and active and difficulty in ('Easy','Hard');
  if not found then raise exception 'The selected Easy/Hard course is unavailable'; end if;
  select * into v_player from public.players where id=public.resolve_canonical_player_id(p_player_id) and active;
  if not found then raise exception 'The selected canonical player is unavailable'; end if;
  select * into v_period from public.late_backfill_target_period();
  if not found then raise exception 'The installed legacy baseline cutoff is unavailable'; end if;
  if p_authoritative_time_precision='exact' then
    if p_authoritative_submitted_at is null then raise exception 'Exact late submissions require an authoritative timestamp'; end if;
    v_date:=(p_authoritative_submitted_at at time zone 'UTC')::date;
    if p_authoritative_submitted_date is not null and p_authoritative_submitted_date<>v_date then raise exception 'Timestamp and authoritative date disagree'; end if;
  elsif p_authoritative_time_precision='date_ordered' then
    if p_authoritative_submitted_at is not null or p_authoritative_submitted_date is null or p_authoritative_submission_order is null or p_authoritative_submission_order<1 then
      raise exception 'Date-only late submissions require an authoritative date and source-backed order';
    end if;
    v_date:=p_authoritative_submitted_date;
  else
    raise exception 'Late submissions require exact time or date/order evidence';
  end if;
  if v_date<v_period.starts_at::date or v_date>=v_period.ends_at::date then raise exception 'Late submission is outside Aug 15–Aug 28, 2026'; end if;
  if exists(select 1 from public.all_time_record_observations where entry_key=p_entry_key and fingerprint<>lower(p_fingerprint)) then raise exception 'Entry key is already bound to a different entry'; end if;
  if exists(select 1 from public.all_time_record_observations where fingerprint=lower(p_fingerprint)) then return jsonb_build_object('action','already_saved','fingerprint',lower(p_fingerprint)); end if;
  if exists(select 1 from public.all_time_record_observations o where o.entry_type='late_backfill' and o.voided_at is null and o.course_id=p_course_id and o.player_id=v_player.id and o.score=p_score and o.authoritative_time_precision=p_authoritative_time_precision and o.authoritative_submitted_at is not distinct from p_authoritative_submitted_at and o.authoritative_submitted_date=v_date and o.authoritative_submission_order is not distinct from p_authoritative_submission_order and o.source_label is not distinct from nullif(btrim(p_source_label),'')) then raise exception 'An equivalent late/backfill submission already exists'; end if;
  if exists(select 1 from public.all_time_record_observations o where o.entry_type in ('quick_score','full_card','authoritative_league_source') and o.voided_at is null and o.authoritative_time_precision='unknown') then v_ordering_issue:='Existing non-import observations lack authoritative timestamps'; end if;
  if exists(select 1 from public.all_time_record_observations o where o.entry_type<>'historical_import' and o.voided_at is null and o.authoritative_submitted_date=v_date and ((p_authoritative_time_precision='exact' and o.authoritative_time_precision='date_ordered') or (p_authoritative_time_precision='date_ordered' and o.authoritative_time_precision='exact'))) then v_ordering_issue:=coalesce(v_ordering_issue||'; ','')||'Exact-time and date/order evidence are mixed on the same date'; end if;
  if p_authoritative_time_precision='exact' and p_authoritative_submission_order is null and exists(select 1 from public.all_time_record_observations o where o.entry_type='late_backfill' and o.voided_at is null and o.authoritative_time_precision='exact' and o.authoritative_submitted_at=p_authoritative_submitted_at and o.authoritative_submission_order is null) then v_ordering_issue:=coalesce(v_ordering_issue||'; ','')||'Multiple exact submissions share a timestamp without authoritative order'; end if;
  if p_authoritative_time_precision='date_ordered' and exists(select 1 from public.all_time_record_observations o where o.entry_type='late_backfill' and o.voided_at is null and o.authoritative_time_precision='date_ordered' and o.authoritative_submitted_date=v_date and o.authoritative_submission_order=p_authoritative_submission_order) then v_ordering_issue:=coalesce(v_ordering_issue||'; ','')||'Submission order is already used on this date'; end if;
  select count(*) into v_season_count from public.climbers_seasons where starts_at=v_period.starts_at and ends_at=v_period.ends_at and status<>'finalized';
  if v_season_count>1 then v_ordering_issue:=coalesce(v_ordering_issue||'; ','')||'More than one target Climbers season exists'; end if;
  if exists(select 1 from public.climbers_seasons where starts_at=v_period.starts_at and ends_at=v_period.ends_at and status='finalized') then v_ordering_issue:=coalesce(v_ordering_issue||'; ','')||'The target Climbers season is finalized'; end if;
  select id,status into v_season_id,v_season_status from public.climbers_seasons where starts_at=v_period.starts_at and ends_at=v_period.ends_at and status<>'finalized' order by created_at limit 1;

  create temp table late_preview_pb(course_id uuid,player_id uuid,score integer,primary key(course_id,player_id)) on commit drop;
  insert into late_preview_pb select o.course_id,o.player_id,min(o.score) from public.all_time_record_observations o where o.entry_type='historical_import' and o.identity_status='resolved' and o.player_id is not null and o.voided_at is null group by o.course_id,o.player_id;
  for v_row in
    select o.* from public.all_time_record_observations o
    where o.voided_at is null and (o.entry_type='late_backfill' or o.entry_type in ('quick_score','full_card','authoritative_league_source'))
      and o.authoritative_submitted_date>=v_period.starts_at::date and o.authoritative_submitted_date<v_date
    order by o.authoritative_submitted_date,case when o.authoritative_time_precision='exact' then 0 else 1 end,o.authoritative_submitted_at nulls last,o.authoritative_submission_order nulls last,o.id
  loop
    insert into late_preview_pb values(v_row.course_id,v_row.player_id,v_row.score) on conflict(course_id,player_id) do update set score=least(late_preview_pb.score,excluded.score);
  end loop;
  if p_authoritative_time_precision='exact' then
    for v_row in select o.* from public.all_time_record_observations o where o.voided_at is null and o.entry_type='late_backfill' and o.authoritative_time_precision='exact' and o.authoritative_submitted_at<p_authoritative_submitted_at order by o.authoritative_submitted_at,o.id loop
      insert into late_preview_pb values(v_row.course_id,v_row.player_id,v_row.score) on conflict(course_id,player_id) do update set score=least(late_preview_pb.score,excluded.score);
    end loop;
  else
    for v_row in select o.* from public.all_time_record_observations o where o.voided_at is null and o.entry_type='late_backfill' and o.authoritative_time_precision='date_ordered' and (o.authoritative_submitted_date<v_date or (o.authoritative_submitted_date=v_date and o.authoritative_submission_order<p_authoritative_submission_order)) order by o.authoritative_submitted_date,o.authoritative_submission_order,o.id loop
      insert into late_preview_pb values(v_row.course_id,v_row.player_id,v_row.score) on conflict(course_id,player_id) do update set score=least(late_preview_pb.score,excluded.score);
    end loop;
  end if;
  select score into v_old from late_preview_pb where course_id=p_course_id and player_id=v_player.id;
  if v_old is null then v_classification:='FIRST'; elsif p_score<v_old then v_classification:='BETTER'; elsif p_score=v_old then v_classification:='EQUAL'; else v_classification:='WORSE'; end if;
  if v_classification='BETTER' then select coalesce(array_agg(player_id order by score,player_id),'{}'::uuid[]),count(*)::integer into v_passed,v_points from late_preview_pb where course_id=p_course_id and player_id<>v_player.id and score>p_score; end if;
  v_token:=md5(concat_ws('|',p_entry_key::text,lower(p_fingerprint),p_course_id::text,v_player.id::text,p_score::text,v_date::text,coalesce(p_authoritative_submitted_at::text,''),coalesce(p_authoritative_submission_order::text,''),p_authoritative_time_precision,coalesce(v_old::text,'FIRST'),v_classification,array_to_json(v_passed)::text,v_points,coalesce(v_season_id::text,''),coalesce(v_ordering_issue,'')));
  return jsonb_build_object('action',lower(v_classification),'course_id',p_course_id,'player_id',v_player.id,'player_name',v_player.screen_name,'course_name',v_course.display_name,'difficulty',v_course.difficulty,'authoritative_submitted_at',p_authoritative_submitted_at,'authoritative_submitted_date',v_date,'authoritative_submission_order',p_authoritative_submission_order,'authoritative_time_precision',p_authoritative_time_precision,'recorded_at','not yet recorded','old_pb_score',v_old,'submitted_score',p_score,'classification',v_classification,'new_pb_score',case when v_classification in ('FIRST','BETTER') then p_score else v_old end,'passed_player_ids',to_jsonb(v_passed),'climbers_points',case when v_ordering_issue is null then v_points else 0 end,'target_season_id',v_season_id,'target_season_status',coalesce(v_season_status,'not_created'),'target_season_label',v_period.label,'ordering_status',case when v_ordering_issue is null then 'deterministic' else 'review_required' end,'ordering_issue',v_ordering_issue,'confirmation_token',v_token);
end;
$function$;
revoke all on function public.preview_all_time_late_backfill_entry(uuid,uuid,uuid,text,integer,timestamptz,date,integer,text,text,text,text) from public,anon,authenticated;
grant execute on function public.preview_all_time_late_backfill_entry(uuid,uuid,uuid,text,integer,timestamptz,date,integer,text,text,text,text) to authenticated;

create or replace function public.record_all_time_late_backfill_entry(
  p_course_id uuid,p_player_id uuid,p_entry_key uuid,p_fingerprint text,p_score integer,
  p_authoritative_submitted_at timestamptz,p_authoritative_submitted_date date,
  p_authoritative_submission_order integer,p_authoritative_time_precision text,
  p_source_label text,p_provenance_reference text,p_notes text,p_confirmation_token text
) returns jsonb language plpgsql security definer set search_path to '' as $function$
declare v_user_id uuid:=auth.uid(); v_preview jsonb; v_observation_id uuid; v_recorded_at timestamptz; v_season_id uuid; v_period record; v_result jsonb;
begin
  if v_user_id is null or not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required' using errcode='42501'; end if;
  v_preview:=public.preview_all_time_late_backfill_entry(p_course_id,p_player_id,p_entry_key,p_fingerprint,p_score,p_authoritative_submitted_at,p_authoritative_submitted_date,p_authoritative_submission_order,p_authoritative_time_precision,p_source_label,p_provenance_reference,p_notes);
  if v_preview->>'action'='already_saved' then return v_preview; end if;
  if v_preview->>'ordering_status'<>'deterministic' then raise exception 'Backfill cannot be saved until chronology evidence is deterministic: %',v_preview->>'ordering_issue'; end if;
  if p_confirmation_token is null or p_confirmation_token<>v_preview->>'confirmation_token' then raise exception 'The preview changed or was not explicitly confirmed; review again before saving'; end if;
  v_recorded_at:=clock_timestamp();
  insert into public.all_time_record_observations(batch_id,course_id,player_id,identity_status,historical_player_name,score,source_course_name,source_row,fingerprint,observed_at,metadata,entry_type,hole_strokes,source_label,provenance_reference,notes,recorded_by,entry_key,recorded_at,authoritative_submitted_at,authoritative_submitted_date,authoritative_submission_order,authoritative_time_precision)
  values(null,p_course_id,(v_preview->>'player_id')::uuid,'resolved',v_preview->>'player_name',p_score,v_preview->>'course_name',null,lower(p_fingerprint),v_recorded_at,jsonb_build_object('entry_method','late_backfill','confirmation_token',p_confirmation_token,'target_period',v_preview->>'target_season_label'),'late_backfill',null,p_source_label,nullif(btrim(p_provenance_reference),''),nullif(btrim(p_notes),''),v_user_id,p_entry_key,v_recorded_at,p_authoritative_submitted_at,(v_preview->>'authoritative_submitted_date')::date,p_authoritative_submission_order,p_authoritative_time_precision)
  returning id into v_observation_id;
  select * into v_period from public.late_backfill_target_period();
  v_season_id:=nullif(v_preview->>'target_season_id','')::uuid;
  insert into public.all_time_late_backfill_audit(observation_id,entry_key,course_id,player_id,authoritative_submitted_at,authoritative_submitted_date,authoritative_submission_order,authoritative_time_precision,recorded_at,recorded_by,source_label,provenance_reference,notes,classification,old_pb_score,submitted_score,new_pb_score,passed_player_ids,climbers_points,target_season_id,target_season_label,status,confirmation_token)
  values(v_observation_id,p_entry_key,p_course_id,(v_preview->>'player_id')::uuid,p_authoritative_submitted_at,(v_preview->>'authoritative_submitted_date')::date,p_authoritative_submission_order,p_authoritative_time_precision,v_recorded_at,v_user_id,p_source_label,nullif(btrim(p_provenance_reference),''),nullif(btrim(p_notes),''),v_preview->>'classification',nullif(v_preview->>'old_pb_score','')::integer,p_score,nullif(v_preview->>'new_pb_score','')::integer,array(select jsonb_array_elements_text(v_preview->'passed_player_ids')::uuid),(v_preview->>'climbers_points')::integer,v_season_id,v_preview->>'target_season_label',case when v_season_id is null then 'pending_season' else 'pending_replay' end,p_confirmation_token);
  if v_season_id is not null then v_result:=public.replay_climbers_late_backfill_season(v_season_id); end if;
  return jsonb_build_object('action','saved','observation_id',v_observation_id,'recorded_at',v_recorded_at,'authoritative_submitted_at',p_authoritative_submitted_at,'authoritative_submitted_date',(v_preview->>'authoritative_submitted_date')::date,'target_season_id',v_season_id,'target_season_label',v_preview->>'target_season_label','climbers_points',coalesce((select climbers_points from public.all_time_late_backfill_audit where observation_id=v_observation_id),(v_preview->>'climbers_points')::integer),'replay',v_result);
end;
$function$;
revoke all on function public.record_all_time_late_backfill_entry(uuid,uuid,uuid,text,integer,timestamptz,date,integer,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.record_all_time_late_backfill_entry(uuid,uuid,uuid,text,integer,timestamptz,date,integer,text,text,text,text,text) to authenticated;

create or replace function public.correct_all_time_late_backfill_entry(
  p_observation_id uuid,p_expected_updated_at timestamptz,p_new_score integer,
  p_authoritative_submitted_at timestamptz,p_authoritative_submitted_date date,
  p_authoritative_submission_order integer,p_authoritative_time_precision text,p_reason text
) returns public.all_time_record_observations language plpgsql security definer set search_path to '' as $function$
declare v_user_id uuid:=auth.uid(); v_old public.all_time_record_observations%rowtype; v_result public.all_time_record_observations%rowtype; v_season_id uuid; v_period record;
begin
  if v_user_id is null or not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required' using errcode='42501'; end if;
  if nullif(btrim(p_reason),'') is null then raise exception 'A correction reason is required'; end if;
  select * into v_old from public.all_time_record_observations where id=p_observation_id and entry_type='late_backfill' and voided_at is null for update;
  if not found then raise exception 'Active late/backfill observation was not found'; end if;
  if v_old.updated_at is distinct from p_expected_updated_at then raise exception 'This record changed before correction; reload and review again'; end if;
  insert into public.all_time_correction_audit(observation_id,course_id,player_id,action,old_values,new_values,reason,changed_by)
  values(v_old.id,v_old.course_id,v_old.player_id,'EDIT',jsonb_build_object('score',v_old.score,'authoritative_submitted_at',v_old.authoritative_submitted_at,'authoritative_submitted_date',v_old.authoritative_submitted_date,'authoritative_submission_order',v_old.authoritative_submission_order,'authoritative_time_precision',v_old.authoritative_time_precision),jsonb_build_object('score',p_new_score,'authoritative_submitted_at',p_authoritative_submitted_at,'authoritative_submitted_date',p_authoritative_submitted_date,'authoritative_submission_order',p_authoritative_submission_order,'authoritative_time_precision',p_authoritative_time_precision),btrim(p_reason),v_user_id);
  perform set_config('krys.late_backfill_mutation','on',true);
  update public.all_time_record_observations set score=p_new_score,authoritative_submitted_at=p_authoritative_submitted_at,authoritative_submitted_date=p_authoritative_submitted_date,authoritative_submission_order=p_authoritative_submission_order,authoritative_time_precision=p_authoritative_time_precision,corrected_at=clock_timestamp(),corrected_by=v_user_id,updated_at=clock_timestamp() where id=v_old.id returning * into v_result;
  select * into v_period from public.late_backfill_target_period();
  select id into v_season_id from public.climbers_seasons where starts_at=v_period.starts_at and ends_at=v_period.ends_at and status<>'finalized' order by created_at limit 1;
  if v_season_id is not null then perform public.replay_climbers_late_backfill_season(v_season_id); end if;
  return v_result;
end;
$function$;
revoke all on function public.correct_all_time_late_backfill_entry(uuid,timestamptz,integer,timestamptz,date,integer,text,text) from public,anon,authenticated;
grant execute on function public.correct_all_time_late_backfill_entry(uuid,timestamptz,integer,timestamptz,date,integer,text,text) to authenticated;

create or replace function public.void_all_time_late_backfill_entry(p_observation_id uuid,p_expected_updated_at timestamptz,p_reason text)
returns public.all_time_record_observations language plpgsql security definer set search_path to '' as $function$
declare v_user_id uuid:=auth.uid(); v_old public.all_time_record_observations%rowtype; v_result public.all_time_record_observations%rowtype; v_period record; v_season_id uuid;
begin
  if v_user_id is null or not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required' using errcode='42501'; end if;
  if nullif(btrim(p_reason),'') is null then raise exception 'A void reason is required'; end if;
  select * into v_old from public.all_time_record_observations where id=p_observation_id and entry_type='late_backfill' and voided_at is null for update;
  if not found then raise exception 'Active late/backfill observation was not found'; end if;
  if v_old.updated_at is distinct from p_expected_updated_at then raise exception 'This record changed before void; reload and review again'; end if;
  insert into public.all_time_correction_audit(observation_id,course_id,player_id,action,old_values,new_values,reason,changed_by)
  values(v_old.id,v_old.course_id,v_old.player_id,'VOID',jsonb_build_object('score',v_old.score,'authoritative_submitted_at',v_old.authoritative_submitted_at,'authoritative_submitted_date',v_old.authoritative_submitted_date,'authoritative_submission_order',v_old.authoritative_submission_order),null,btrim(p_reason),v_user_id);
  perform set_config('krys.late_backfill_mutation','on',true);
  update public.all_time_record_observations set voided_at=clock_timestamp(),voided_by=v_user_id,void_reason=btrim(p_reason),updated_at=clock_timestamp() where id=v_old.id returning * into v_result;
  update public.all_time_late_backfill_audit set status='voided',updated_at=clock_timestamp() where observation_id=v_old.id;
  select * into v_period from public.late_backfill_target_period();
  select id into v_season_id from public.climbers_seasons where starts_at=v_period.starts_at and ends_at=v_period.ends_at and status<>'finalized' order by created_at limit 1;
  if v_season_id is not null then perform public.replay_climbers_late_backfill_season(v_season_id); end if;
  return v_result;
end;
$function$;
revoke all on function public.void_all_time_late_backfill_entry(uuid,timestamptz,text) from public,anon,authenticated;
grant execute on function public.void_all_time_late_backfill_entry(uuid,timestamptz,text) to authenticated;

create or replace function public.create_climbers_season(p_label text,p_starts_at timestamptz,p_ends_at timestamptz)
returns public.climbers_seasons language plpgsql security definer set search_path to '' as $function$
declare v public.climbers_seasons%rowtype;
begin
  if auth.uid() is null or not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required' using errcode='42501'; end if;
  if nullif(btrim(p_label),'') is null or p_ends_at<=p_starts_at then raise exception 'Valid Climbers season dates are required'; end if;
  if exists(select 1 from public.climbers_seasons where status<>'finalized' and starts_at<p_ends_at and ends_at>p_starts_at) then raise exception 'The requested Climbers season overlaps an existing non-finalized season'; end if;
  insert into public.climbers_seasons(label,starts_at,ends_at,status,created_by)
  values(btrim(p_label),p_starts_at,p_ends_at,case when p_ends_at<=now() then 'awaiting_finalization' when p_starts_at<=now() then 'active' else 'upcoming' end,auth.uid()) returning * into v;
  return v;
end;
$function$;
revoke all on function public.create_climbers_season(text,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.create_climbers_season(text,timestamptz,timestamptz) to authenticated;

create or replace function public.finalize_climbers_season(p_season_id uuid)
returns public.climbers_seasons language plpgsql security definer set search_path to '' as $function$
declare v public.climbers_seasons%rowtype; v_period record;
begin
  if auth.uid() is null or not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required' using errcode='42501'; end if;
  select * into v from public.climbers_seasons where id=p_season_id for update;
  if not found or v.status not in ('active','awaiting_finalization') then raise exception 'Only an active or awaiting-finalization Climbers season can be finalized'; end if;
  select * into v_period from public.late_backfill_target_period();
  if v_period.starts_at is not null and v.starts_at=v_period.starts_at and v.ends_at=v_period.ends_at and exists(
    select 1 from public.all_time_late_backfill_audit a join public.all_time_record_observations o on o.id=a.observation_id
    where o.entry_type='late_backfill' and o.voided_at is null and a.status<>'replayed'
  ) then raise exception 'The Aug 15–Aug 28 backfill period still has entries pending deterministic replay'; end if;
  update public.climbers_seasons set status='finalized',finalized_at=clock_timestamp(),finalized_by=auth.uid() where id=p_season_id returning * into v;
  return v;
end;
$function$;
revoke all on function public.finalize_climbers_season(uuid) from public,anon,authenticated;
grant execute on function public.finalize_climbers_season(uuid) to authenticated;

commit;

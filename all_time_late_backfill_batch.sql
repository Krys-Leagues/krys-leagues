-- Atomic multi-player late/backdated scorecard support.
-- This file is intentionally not executed by the application.
-- Apply only after Production review. It extends all_time_late_backfill.sql.
begin;

create table if not exists public.all_time_late_backfill_batches (
  id uuid primary key,
  course_id uuid not null references public.all_time_courses(id) on delete restrict,
  authoritative_submitted_at timestamptz,
  authoritative_submitted_date date not null,
  authoritative_submission_order integer,
  authoritative_time_precision text not null check (authoritative_time_precision in ('exact','date_ordered')),
  source_label text not null check (btrim(source_label) <> ''),
  provenance_reference text,
  notes text,
  recorded_at timestamptz not null,
  recorded_by uuid not null references auth.users(id) on delete restrict,
  player_count integer not null check (player_count > 0),
  batch_fingerprint text not null unique check (batch_fingerprint ~ '^[0-9a-f]{64}$'),
  status text not null default 'pending_season' check (status in ('pending_season','pending_replay','replayed','blocked','voided')),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (
    (authoritative_time_precision = 'exact'
      and authoritative_submitted_at is not null
      and authoritative_submitted_date = (authoritative_submitted_at at time zone 'UTC')::date
      and authoritative_submission_order is null)
    or
    (authoritative_time_precision = 'date_ordered'
      and authoritative_submitted_at is null
      and authoritative_submission_order is not null
      and authoritative_submission_order > 0)
  )
);

alter table public.all_time_late_backfill_batches
  add column if not exists course_id uuid references public.all_time_courses(id) on delete restrict,
  add column if not exists authoritative_submitted_at timestamptz,
  add column if not exists authoritative_submitted_date date,
  add column if not exists authoritative_submission_order integer,
  add column if not exists authoritative_time_precision text,
  add column if not exists source_label text,
  add column if not exists provenance_reference text,
  add column if not exists notes text,
  add column if not exists recorded_at timestamptz,
  add column if not exists recorded_by uuid references auth.users(id) on delete restrict,
  add column if not exists player_count integer,
  add column if not exists batch_fingerprint text,
  add column if not exists status text default 'pending_season',
  add column if not exists created_at timestamptz default clock_timestamp(),
  add column if not exists updated_at timestamptz default clock_timestamp();

alter table public.all_time_record_observations
  add column if not exists card_batch_id uuid references public.all_time_late_backfill_batches(id) on delete restrict;

alter table public.all_time_late_backfill_audit
  add column if not exists card_batch_id uuid references public.all_time_late_backfill_batches(id) on delete restrict;

create index if not exists all_time_observation_card_batch_idx
  on public.all_time_record_observations(card_batch_id,authoritative_submitted_date,authoritative_submitted_at);
create index if not exists all_time_late_backfill_audit_card_batch_idx
  on public.all_time_late_backfill_audit(card_batch_id,authoritative_submitted_date);

alter table public.all_time_late_backfill_batches enable row level security;
drop policy if exists all_time_late_backfill_batches_admin_select on public.all_time_late_backfill_batches;
create policy all_time_late_backfill_batches_admin_select on public.all_time_late_backfill_batches
  for select to authenticated using (public.is_current_user_site_admin());
grant select on public.all_time_late_backfill_batches to authenticated;
revoke insert,update,delete on public.all_time_late_backfill_batches from public,anon,authenticated;

create or replace function public.replay_climbers_late_backfill_season(p_season_id uuid)
returns jsonb language plpgsql security definer set search_path to '' as $function$
declare
  v_user_id uuid:=auth.uid(); v_season public.climbers_seasons%rowtype; v_period record;
  v_unit record; v_row record; v_effect record; v_old integer; v_classification text;
  v_event_id uuid; v_passed uuid[]; v_points integer; v_blocked text;
  v_replayed integer:=0; v_zero_effect integer:=0;
begin
  if v_user_id is null or not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode='42501';
  end if;
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
  ) then v_blocked:='Existing non-import observations lack authoritative timestamps'; end if;
  if exists (
    select 1 from public.all_time_record_observations o
    where o.entry_type='late_backfill' and o.voided_at is null
      and o.authoritative_submitted_date>=v_period.starts_at::date
      and o.authoritative_submitted_date<v_period.ends_at::date
      and o.authoritative_time_precision not in ('exact','date_ordered')
  ) then v_blocked:=coalesce(v_blocked||'; ','')||'Late entries need exact time or date/order evidence'; end if;
  if exists (
    select 1
    from public.all_time_record_observations o1
    join public.all_time_record_observations o2
      on o1.id<o2.id
     and o1.entry_type<>'historical_import' and o2.entry_type<>'historical_import'
     and o1.voided_at is null and o2.voided_at is null
     and o1.authoritative_time_precision='exact' and o2.authoritative_time_precision='exact'
     and o1.authoritative_submitted_at=o2.authoritative_submitted_at
     and coalesce(o1.card_batch_id,o1.id)<>coalesce(o2.card_batch_id,o2.id)
  ) then v_blocked:=coalesce(v_blocked||'; ','')||'Separate cards share an exact timestamp without authoritative ordering'; end if;
  if exists (
    select 1
    from public.all_time_record_observations o1
    join public.all_time_record_observations o2
      on o1.id<o2.id
     and o1.entry_type<>'historical_import' and o2.entry_type<>'historical_import'
     and o1.voided_at is null and o2.voided_at is null
     and o1.authoritative_time_precision='date_ordered' and o2.authoritative_time_precision='date_ordered'
     and o1.authoritative_submitted_date=o2.authoritative_submitted_date
     and o1.authoritative_submission_order=o2.authoritative_submission_order
     and coalesce(o1.card_batch_id,o1.id)<>coalesce(o2.card_batch_id,o2.id)
  ) then v_blocked:=coalesce(v_blocked||'; ','')||'Separate cards share a date/order without authoritative ordering'; end if;
  if v_blocked is not null then
    update public.all_time_late_backfill_batches b set status='blocked',updated_at=clock_timestamp()
    where exists(select 1 from public.all_time_record_observations o where o.card_batch_id=b.id and o.entry_type='late_backfill' and o.voided_at is null);
    update public.all_time_late_backfill_audit a set status='blocked',updated_at=clock_timestamp()
    where exists(select 1 from public.all_time_record_observations o where o.id=a.observation_id and o.entry_type='late_backfill' and o.voided_at is null);
    raise exception '%',v_blocked;
  end if;

  create temp table late_batch_pb(course_id uuid,player_id uuid,score integer,primary key(course_id,player_id)) on commit drop;
  insert into late_batch_pb(course_id,player_id,score)
  select o.course_id,o.player_id,min(o.score)
  from public.all_time_record_observations o
  where o.entry_type='historical_import' and o.identity_status='resolved' and o.player_id is not null and o.voided_at is null
  group by o.course_id,o.player_id;

  create temp table late_batch_units(
    unit_key text primary key, card_batch_id uuid, representative_id uuid,
    effective_date date not null, effective_at timestamptz, effective_order integer,
    effective_time_precision text not null
  ) on commit drop;
  insert into late_batch_units(unit_key,card_batch_id,representative_id,effective_date,effective_at,effective_order,effective_time_precision)
  select distinct on (coalesce(o.card_batch_id::text,o.id::text))
    coalesce(o.card_batch_id::text,o.id::text),o.card_batch_id,o.id,o.authoritative_submitted_date,
    o.authoritative_submitted_at,o.authoritative_submission_order,o.authoritative_time_precision
  from public.all_time_record_observations o
  where o.voided_at is null
    and o.entry_type in ('late_backfill','quick_score','full_card','authoritative_league_source')
    and o.authoritative_submitted_date>=v_period.starts_at::date
    and o.authoritative_submitted_date<v_period.ends_at::date
  order by coalesce(o.card_batch_id::text,o.id::text),o.id;

  create temp table late_batch_effects(
    observation_id uuid primary key, course_id uuid, player_id uuid, old_pb_score integer,
    submitted_score integer, classification text, new_pb_score integer, passed_player_ids uuid[],
    climbers_points integer
  ) on commit drop;

  for v_unit in select * from late_batch_units order by effective_date,
    case when effective_time_precision='exact' then 0 else 1 end,
    effective_at nulls last,effective_order nulls last,unit_key loop
    delete from late_batch_effects;
    for v_row in
      select o.* from public.all_time_record_observations o
      where o.voided_at is null
        and coalesce(o.card_batch_id::text,o.id::text)=v_unit.unit_key
      order by o.id
    loop
      if v_row.entry_type<>'late_backfill' then
        insert into late_batch_pb values(v_row.course_id,v_row.player_id,v_row.score)
        on conflict(course_id,player_id) do update set score=least(late_batch_pb.score,excluded.score);
        continue;
      end if;
      select score into v_old from late_batch_pb where course_id=v_row.course_id and player_id=v_row.player_id;
      if v_old is null then v_classification:='FIRST';
      elsif v_row.score<v_old then v_classification:='BETTER';
      elsif v_row.score=v_old then v_classification:='EQUAL';
      else v_classification:='WORSE'; end if;
      v_passed:='{}'::uuid[]; v_points:=0;
      if v_classification='BETTER' then
        select coalesce(array_agg(player_id order by score,player_id),'{}'::uuid[]),count(*)::integer
        into v_passed,v_points from late_batch_pb
        where course_id=v_row.course_id and player_id<>v_row.player_id and score>v_row.score;
      end if;
      insert into late_batch_effects(observation_id,course_id,player_id,old_pb_score,submitted_score,classification,new_pb_score,passed_player_ids,climbers_points)
      values(v_row.id,v_row.course_id,v_row.player_id,v_old,v_row.score,v_classification,
        case when v_classification in ('FIRST','BETTER') then v_row.score else v_old end,v_passed,
        case when v_classification='BETTER' then v_points else 0 end);
    end loop;

    -- Every effect in this unit was calculated before any unit PB was changed.
    for v_effect in select * from late_batch_effects order by observation_id loop
      select id into v_event_id from public.climbers_events where observation_id=v_effect.observation_id and season_id=p_season_id;
      if v_effect.classification in ('FIRST','BETTER') then
        if v_event_id is null then
          insert into public.climbers_events(
            season_id,observation_id,player_id,course_id,difficulty,old_pb_score,new_pb_score,points,
            calculation_version,source_label,provenance_reference,created_by,effective_at,effective_date,
            effective_order,effective_time_precision
          ) select p_season_id,v_effect.observation_id,v_effect.player_id,v_effect.course_id,c.difficulty,
            v_effect.old_pb_score,v_effect.submitted_score,v_effect.climbers_points,'climbers-late-backfill-v2',o.source_label,
            o.provenance_reference,v_user_id,o.authoritative_submitted_at,o.authoritative_submitted_date,
            o.authoritative_submission_order,o.authoritative_time_precision
          from public.all_time_courses c join public.all_time_record_observations o on o.id=v_effect.observation_id
          where c.id=v_effect.course_id returning id into v_event_id;
        else
          update public.climbers_events e set old_pb_score=v_effect.old_pb_score,new_pb_score=v_effect.submitted_score,
            points=v_effect.climbers_points,calculation_version='climbers-late-backfill-v2',voided_at=null,
            voided_by=null,void_reason=null,effective_at=o.authoritative_submitted_at,effective_date=o.authoritative_submitted_date,
            effective_order=o.authoritative_submission_order,effective_time_precision=o.authoritative_time_precision,
            source_label=o.source_label,provenance_reference=o.provenance_reference
          from public.all_time_record_observations o where e.id=v_event_id and o.id=v_effect.observation_id;
        end if;
        delete from public.climbers_event_passes where event_id=v_event_id;
        insert into public.climbers_event_passes(event_id,passed_player_id)
        select v_event_id,passed from unnest(v_effect.passed_player_ids) passed;
        update public.all_time_late_backfill_audit a set classification=v_effect.classification,old_pb_score=v_effect.old_pb_score,
          submitted_score=v_effect.submitted_score,new_pb_score=v_effect.new_pb_score,passed_player_ids=v_effect.passed_player_ids,
          climbers_points=v_effect.climbers_points,target_season_id=p_season_id,target_season_label=v_period.label,
          status='replayed',calculated_at=clock_timestamp(),updated_at=clock_timestamp()
        where a.observation_id=v_effect.observation_id;
        v_replayed:=v_replayed+1;
      else
        if v_event_id is not null then
          update public.climbers_events set voided_at=clock_timestamp(),voided_by=v_user_id,
            void_reason='Backfill replay: submission did not establish a PB',points=0 where id=v_event_id;
        end if;
        update public.all_time_late_backfill_audit a set classification=v_effect.classification,old_pb_score=v_effect.old_pb_score,
          submitted_score=v_effect.submitted_score,new_pb_score=null,passed_player_ids='{}'::uuid[],climbers_points=0,
          target_season_id=p_season_id,target_season_label=v_period.label,status='replayed',calculated_at=clock_timestamp(),updated_at=clock_timestamp()
        where a.observation_id=v_effect.observation_id;
        v_zero_effect:=v_zero_effect+1;
      end if;
      if v_effect.classification in ('FIRST','BETTER') then
        insert into late_batch_pb values(v_effect.course_id,v_effect.player_id,v_effect.submitted_score)
        on conflict(course_id,player_id) do update set score=least(late_batch_pb.score,excluded.score);
      end if;
    end loop;
  end loop;
  update public.all_time_late_backfill_batches b set status='replayed',updated_at=clock_timestamp()
  where exists(select 1 from public.all_time_record_observations o where o.card_batch_id=b.id and o.entry_type='late_backfill')
    and not exists(select 1 from public.all_time_late_backfill_audit a where a.card_batch_id=b.id and a.status<>'replayed');
  return jsonb_build_object('season_id',p_season_id,'replayed_entries',v_replayed,'zero_effect_entries',v_zero_effect,'calculation_version','climbers-late-backfill-v2','same_card_snapshot',true);
end;
$function$;
revoke all on function public.replay_climbers_late_backfill_season(uuid) from public,anon,authenticated;
grant execute on function public.replay_climbers_late_backfill_season(uuid) to authenticated;

create or replace function public.preview_all_time_late_backfill_batch(
  p_card_batch_id uuid,p_batch_fingerprint text,p_course_id uuid,p_players jsonb,
  p_authoritative_submitted_at timestamptz,p_authoritative_submitted_date date,
  p_authoritative_submission_order integer,p_authoritative_time_precision text,
  p_source_label text,p_provenance_reference text,p_notes text
) returns jsonb language plpgsql security definer set search_path to '' as $function$
declare
  v_user_id uuid:=auth.uid(); v_course public.all_time_courses%rowtype; v_period record;
  v_date date; v_season_id uuid; v_season_status text; v_old integer; v_classification text;
  v_input record; v_row record; v_passed uuid[]; v_points integer; v_issue text; v_token text;
  v_hole_stats boolean; v_existing_batch record; v_duplicate_count integer;
begin
  if v_user_id is null or not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required' using errcode='42501'; end if;
  if p_card_batch_id is null or p_batch_fingerprint is null or lower(p_batch_fingerprint)!~'^[0-9a-f]{64}$' then raise exception 'Card batch id and fingerprint are required'; end if;
  if jsonb_typeof(p_players)<>'array' or jsonb_array_length(p_players)<1 then raise exception 'At least one player is required'; end if;
  if nullif(btrim(p_source_label),'') is null then raise exception 'A source or provenance label is required'; end if;
  select * into v_course from public.all_time_courses where id=p_course_id and active and difficulty in ('Easy','Hard');
  if not found then raise exception 'The selected Easy/Hard course is unavailable'; end if;
  if v_course.par is null then raise exception 'This course has no authoritative total par; raw card capture is not yet saveable'; end if;
  select * into v_period from public.late_backfill_target_period();
  if p_authoritative_time_precision='exact' then
    if p_authoritative_submitted_at is null then raise exception 'Exact cards require an authoritative timestamp'; end if;
    v_date:=(p_authoritative_submitted_at at time zone 'UTC')::date;
    if p_authoritative_submitted_date is not null and p_authoritative_submitted_date<>v_date then raise exception 'Timestamp and authoritative date disagree'; end if;
  elsif p_authoritative_time_precision='date_ordered' then
    if p_authoritative_submitted_at is not null or p_authoritative_submitted_date is null or p_authoritative_submission_order is null or p_authoritative_submission_order<1 then raise exception 'Date-only cards require an authoritative date and positive source-backed order'; end if;
    v_date:=p_authoritative_submitted_date;
  else raise exception 'Cards require exact time or date/order evidence'; end if;
  if v_date<v_period.starts_at::date or v_date>=v_period.ends_at::date then raise exception 'Card is outside Aug 15–Aug 28, 2026'; end if;

  select * into v_existing_batch from public.all_time_late_backfill_batches where id=p_card_batch_id;
  if found then
    if v_existing_batch.batch_fingerprint<>lower(p_batch_fingerprint) then raise exception 'Card batch id is already bound to a different card'; end if;
    return jsonb_build_object('action','already_saved','card_batch_id',p_card_batch_id,'batch_fingerprint',lower(p_batch_fingerprint));
  end if;
  if exists(select 1 from public.all_time_late_backfill_batches where batch_fingerprint=lower(p_batch_fingerprint)) then
    return jsonb_build_object('action','already_saved','batch_fingerprint',lower(p_batch_fingerprint));
  end if;

  create temp table late_card_input(ordinal integer,player_id uuid,hole_strokes jsonb,entry_key uuid,fingerprint text,total_strokes integer,score integer,hio_count integer) on commit drop;
  insert into late_card_input(ordinal,player_id,hole_strokes,entry_key,fingerprint)
  select row_number() over ()::integer,x.player_id,x.hole_strokes,x.entry_key,x.fingerprint
  from jsonb_to_recordset(p_players) as x(player_id uuid,hole_strokes jsonb,entry_key uuid,fingerprint text);
  if exists(select 1 from late_card_input where player_id is null or entry_key is null or fingerprint is null or lower(fingerprint)!~'^[0-9a-f]{64}$') then raise exception 'Every card player needs a canonical player, entry key, and fingerprint'; end if;
  update late_card_input set player_id=public.resolve_canonical_player_id(player_id) where player_id is not null;
  if exists(select 1 from late_card_input i join public.players p on p.id=i.player_id where p.id is null or not p.active) then raise exception 'Every card player must be an active canonical Global Player'; end if;
  if exists(select 1 from late_card_input group by player_id having count(*)>1) then raise exception 'A card cannot contain the same canonical player more than once'; end if;
  if exists(select 1 from late_card_input where jsonb_typeof(hole_strokes)<>'array' or jsonb_array_length(hole_strokes)<>18) then raise exception 'Every player needs exactly 18 hole scores'; end if;
  if exists(select 1 from late_card_input,jsonb_array_elements(hole_strokes) value where jsonb_typeof(value)<>'number' or value::text !~ '^[0-9]+$' or value::text::integer<1) then raise exception 'Hole scores must be positive whole numbers'; end if;
  if exists(select 1 from late_card_input i join public.all_time_record_observations o on o.entry_key=i.entry_key) then raise exception 'A player entry key is already saved; review the existing card before retrying'; end if;
  if exists(select 1 from late_card_input i join public.all_time_record_observations o on o.fingerprint=lower(i.fingerprint)) then raise exception 'A player fingerprint is already saved; review the existing card before retrying'; end if;
  update late_card_input set total_strokes=(select sum(value::text::integer) from jsonb_array_elements(hole_strokes) value),score=(select sum(value::text::integer) from jsonb_array_elements(hole_strokes) value)-v_course.par,hio_count=(select count(*) from jsonb_array_elements(hole_strokes) value where value::text='1') where total_strokes is null;

  if exists(select 1 from public.all_time_record_observations o where o.entry_type in ('quick_score','full_card','authoritative_league_source') and o.voided_at is null and o.authoritative_time_precision='unknown') then v_issue:='Existing non-import observations lack authoritative timestamps'; end if;
  if exists(select 1 from public.all_time_record_observations o where o.entry_type<>'historical_import' and o.voided_at is null and o.authoritative_submitted_date=v_date and ((p_authoritative_time_precision='exact' and o.authoritative_time_precision='date_ordered') or (p_authoritative_time_precision='date_ordered' and o.authoritative_time_precision='exact'))) then v_issue:=coalesce(v_issue||'; ','')||'Exact-time and date/order evidence are mixed on this date'; end if;
  if p_authoritative_time_precision='exact' and exists(select 1 from public.all_time_record_observations o where o.entry_type<>'historical_import' and o.voided_at is null and o.authoritative_time_precision='exact' and o.authoritative_submitted_at=p_authoritative_submitted_at and o.card_batch_id is distinct from p_card_batch_id) then v_issue:=coalesce(v_issue||'; ','')||'Another card already uses this exact timestamp without authoritative ordering'; end if;
  if p_authoritative_time_precision='date_ordered' and exists(select 1 from public.all_time_record_observations o where o.entry_type<>'historical_import' and o.voided_at is null and o.authoritative_time_precision='date_ordered' and o.authoritative_submitted_date=v_date and o.authoritative_submission_order=p_authoritative_submission_order and o.card_batch_id is distinct from p_card_batch_id) then v_issue:=coalesce(v_issue||'; ','')||'Another card already uses this date/order'; end if;
  select id,status into v_season_id,v_season_status from public.climbers_seasons where starts_at=v_period.starts_at and ends_at=v_period.ends_at and status<>'finalized' order by created_at limit 1;
  v_hole_stats:=jsonb_typeof(v_course.hole_pars)='array' and jsonb_array_length(v_course.hole_pars)=18
    and not exists(select 1 from jsonb_array_elements(v_course.hole_pars) value where jsonb_typeof(value)<>'number' or value::text !~ '^[0-9]+$' or value::text::integer<1)
    and (select sum(value::text::integer) from jsonb_array_elements(v_course.hole_pars) value)=v_course.par;

  create temp table late_card_pb(course_id uuid,player_id uuid,score integer,primary key(course_id,player_id)) on commit drop;
  insert into late_card_pb select o.course_id,o.player_id,min(o.score) from public.all_time_record_observations o where o.entry_type='historical_import' and o.identity_status='resolved' and o.player_id is not null and o.voided_at is null group by o.course_id,o.player_id;
  insert into late_card_pb
  select o.course_id,o.player_id,min(o.score) from public.all_time_record_observations o
  where o.voided_at is null and o.entry_type in ('late_backfill','quick_score','full_card','authoritative_league_source')
    and o.authoritative_submitted_date>=v_period.starts_at::date and o.authoritative_submitted_date<v_date
  group by o.course_id,o.player_id
  on conflict(course_id,player_id) do update set score=least(late_card_pb.score,excluded.score);
  if p_authoritative_time_precision='exact' then
    for v_row in select o.* from public.all_time_record_observations o where o.voided_at is null and o.entry_type in ('late_backfill','quick_score','full_card','authoritative_league_source') and o.authoritative_time_precision='exact' and o.authoritative_submitted_date=v_date and o.authoritative_submitted_at<p_authoritative_submitted_at order by o.authoritative_submitted_at,o.id loop
      insert into late_card_pb values(v_row.course_id,v_row.player_id,v_row.score) on conflict(course_id,player_id) do update set score=least(late_card_pb.score,excluded.score);
    end loop;
  else
    for v_row in select o.* from public.all_time_record_observations o where o.voided_at is null and o.entry_type in ('late_backfill','quick_score','full_card','authoritative_league_source') and o.authoritative_time_precision='date_ordered' and (o.authoritative_submitted_date<v_date or (o.authoritative_submitted_date=v_date and o.authoritative_submission_order<p_authoritative_submission_order)) order by o.authoritative_submitted_date,o.authoritative_submission_order,o.id loop
      insert into late_card_pb values(v_row.course_id,v_row.player_id,v_row.score) on conflict(course_id,player_id) do update set score=least(late_card_pb.score,excluded.score);
    end loop;
  end if;

  create temp table late_card_effects(ordinal integer,player_id uuid,hole_strokes jsonb,total_strokes integer,score integer,old_pb_score integer,classification text,new_pb_score integer,passed_player_ids uuid[],climbers_points integer,entry_key uuid,fingerprint text) on commit drop;
  for v_input in select * from late_card_input order by ordinal loop
    select score into v_old from late_card_pb where course_id=p_course_id and player_id=v_input.player_id;
    if v_old is null then v_classification:='FIRST'; elsif v_input.score<v_old then v_classification:='BETTER'; elsif v_input.score=v_old then v_classification:='EQUAL'; else v_classification:='WORSE'; end if;
    v_passed:='{}'::uuid[]; v_points:=0;
    if v_classification='BETTER' then select coalesce(array_agg(player_id order by score,player_id),'{}'::uuid[]),count(*)::integer into v_passed,v_points from late_card_pb where course_id=p_course_id and player_id<>v_input.player_id and score>v_input.score; end if;
    insert into late_card_effects values(v_input.ordinal,v_input.player_id,v_input.hole_strokes,v_input.total_strokes,v_input.score,v_old,v_classification,case when v_classification in ('FIRST','BETTER') then v_input.score else v_old end,v_passed,case when v_issue is null and v_classification='BETTER' then v_points else 0 end,v_input.entry_key,lower(v_input.fingerprint));
  end loop;
  v_token:=md5(concat_ws('|',p_card_batch_id::text,lower(p_batch_fingerprint),p_course_id::text,v_date::text,coalesce(p_authoritative_submitted_at::text,''),coalesce(p_authoritative_submission_order::text,''),p_authoritative_time_precision,(select jsonb_agg(to_jsonb(e) order by ordinal) from late_card_effects),coalesce(v_season_id::text,''),coalesce(v_issue,'')));
  return jsonb_build_object('action',case when v_issue is null then 'preview' else 'review_required' end,'card_batch_id',p_card_batch_id,'batch_fingerprint',lower(p_batch_fingerprint),'course_id',p_course_id,'course_name',v_course.display_name,'difficulty',v_course.difficulty,'authoritative_submitted_at',p_authoritative_submitted_at,'authoritative_submitted_date',v_date,'authoritative_submission_order',p_authoritative_submission_order,'authoritative_time_precision',p_authoritative_time_precision,'target_season_id',v_season_id,'target_season_status',coalesce(v_season_status,'not_created'),'target_season_label',v_period.label,'source_label',p_source_label,'provenance_reference',p_provenance_reference,'player_count',jsonb_array_length(p_players),'hole_par_stats_available',v_hole_stats,'ordering_status',case when v_issue is null then 'deterministic' else 'review_required' end,'ordering_issue',v_issue,'same_card_snapshot',true,'players',(select jsonb_agg(jsonb_build_object('ordinal',ordinal,'player_id',player_id,'hole_strokes',hole_strokes,'total_strokes',total_strokes,'hio_count',hio_count,'submitted_score',score,'old_pb_score',old_pb_score,'classification',classification,'new_pb_score',new_pb_score,'passed_player_ids',to_jsonb(passed_player_ids),'climbers_points',climbers_points,'entry_key',entry_key,'fingerprint',fingerprint) order by ordinal) from late_card_effects),'confirmation_token',v_token);
end;
$function$;
revoke all on function public.preview_all_time_late_backfill_batch(uuid,text,uuid,jsonb,timestamptz,date,integer,text,text,text,text) from public,anon,authenticated;
grant execute on function public.preview_all_time_late_backfill_batch(uuid,text,uuid,jsonb,timestamptz,date,integer,text,text,text,text) to authenticated;

create or replace function public.record_all_time_late_backfill_batch(
  p_card_batch_id uuid,p_batch_fingerprint text,p_course_id uuid,p_players jsonb,
  p_authoritative_submitted_at timestamptz,p_authoritative_submitted_date date,
  p_authoritative_submission_order integer,p_authoritative_time_precision text,
  p_source_label text,p_provenance_reference text,p_notes text,p_confirmation_token text
) returns jsonb language plpgsql security definer set search_path to '' as $function$
declare
  v_user_id uuid:=auth.uid(); v_preview jsonb; v_player jsonb; v_recorded_at timestamptz:=clock_timestamp();
  v_observation_id uuid; v_period record; v_season_id uuid; v_result jsonb;
begin
  if v_user_id is null or not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('all-time-late-card:'||p_course_id::text,0));
  v_preview:=public.preview_all_time_late_backfill_batch(p_card_batch_id,p_batch_fingerprint,p_course_id,p_players,p_authoritative_submitted_at,p_authoritative_submitted_date,p_authoritative_submission_order,p_authoritative_time_precision,p_source_label,p_provenance_reference,p_notes);
  if v_preview->>'action'='already_saved' then return v_preview; end if;
  if v_preview->>'ordering_status'<>'deterministic' then raise exception 'Card cannot be saved until chronology is deterministic: %',v_preview->>'ordering_issue'; end if;
  if p_confirmation_token is null or p_confirmation_token<>v_preview->>'confirmation_token' then raise exception 'The card preview changed or was not explicitly confirmed'; end if;
  select * into v_period from public.late_backfill_target_period();
  v_season_id:=nullif(v_preview->>'target_season_id','')::uuid;
  insert into public.all_time_late_backfill_batches(id,course_id,authoritative_submitted_at,authoritative_submitted_date,authoritative_submission_order,authoritative_time_precision,source_label,provenance_reference,notes,recorded_at,recorded_by,player_count,batch_fingerprint,status)
  values(p_card_batch_id,p_course_id,p_authoritative_submitted_at,(v_preview->>'authoritative_submitted_date')::date,p_authoritative_submission_order,p_authoritative_time_precision,p_source_label,nullif(btrim(p_provenance_reference),''),nullif(btrim(p_notes),''),v_recorded_at,v_user_id,(v_preview->>'player_count')::integer,lower(p_batch_fingerprint),case when v_season_id is null then 'pending_season' else 'pending_replay' end);
  for v_player in select value from jsonb_array_elements(v_preview->'players') loop
    insert into public.all_time_record_observations(batch_id,card_batch_id,course_id,player_id,identity_status,historical_player_name,score,source_course_name,source_row,fingerprint,observed_at,metadata,entry_type,hole_strokes,source_label,provenance_reference,notes,recorded_by,entry_key,recorded_at,authoritative_submitted_at,authoritative_submitted_date,authoritative_submission_order,authoritative_time_precision)
    values(null,p_card_batch_id,p_course_id,(v_player->>'player_id')::uuid,'resolved',(select screen_name from public.players where id=(v_player->>'player_id')::uuid),(v_player->>'submitted_score')::integer,(v_preview->>'course_name'),null,v_player->>'fingerprint',v_recorded_at,jsonb_build_object('entry_method','late_backfill_batch','card_batch_id',p_card_batch_id,'confirmation_token',p_confirmation_token,'total_strokes',(v_player->>'total_strokes')::integer,'hio_count',(v_player->>'hio_count')::integer,'hole_par_stats_available',(v_preview->>'hole_par_stats_available')::boolean,'target_period',v_period.label),'late_backfill',(v_player->'hole_strokes'),p_source_label,nullif(btrim(p_provenance_reference),''),nullif(btrim(p_notes),''),v_user_id,(v_player->>'entry_key')::uuid,v_recorded_at,p_authoritative_submitted_at,(v_preview->>'authoritative_submitted_date')::date,p_authoritative_submission_order,p_authoritative_time_precision)
    returning id into v_observation_id;
    insert into public.all_time_late_backfill_audit(observation_id,card_batch_id,entry_key,course_id,player_id,authoritative_submitted_at,authoritative_submitted_date,authoritative_submission_order,authoritative_time_precision,recorded_at,recorded_by,source_label,provenance_reference,notes,classification,old_pb_score,submitted_score,new_pb_score,passed_player_ids,climbers_points,target_season_id,target_season_label,status,confirmation_token)
    values(v_observation_id,p_card_batch_id,(v_player->>'entry_key')::uuid,p_course_id,(v_player->>'player_id')::uuid,p_authoritative_submitted_at,(v_preview->>'authoritative_submitted_date')::date,p_authoritative_submission_order,p_authoritative_time_precision,v_recorded_at,v_user_id,p_source_label,nullif(btrim(p_provenance_reference),''),nullif(btrim(p_notes),''),v_player->>'classification',nullif(v_player->>'old_pb_score','')::integer,(v_player->>'submitted_score')::integer,nullif(v_player->>'new_pb_score','')::integer,array(select jsonb_array_elements_text(v_player->'passed_player_ids')::uuid),(v_player->>'climbers_points')::integer,v_season_id,v_period.label,case when v_season_id is null then 'pending_season' else 'pending_replay' end,p_confirmation_token);
  end loop;
  for v_player in select value from jsonb_array_elements(v_preview->'players') loop perform public.refresh_all_time_best_record(p_course_id,(v_player->>'player_id')::uuid); end loop;
  if v_season_id is not null then v_result:=public.replay_climbers_late_backfill_season(v_season_id); end if;
  return jsonb_build_object('action','saved','card_batch_id',p_card_batch_id,'recorded_at',v_recorded_at,'authoritative_submitted_at',p_authoritative_submitted_at,'authoritative_submitted_date',(v_preview->>'authoritative_submitted_date')::date,'player_count',(v_preview->>'player_count')::integer,'target_season_id',v_season_id,'target_season_label',v_period.label,'replay',v_result);
end;
$function$;
revoke all on function public.record_all_time_late_backfill_batch(uuid,text,uuid,jsonb,timestamptz,date,integer,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.record_all_time_late_backfill_batch(uuid,text,uuid,jsonb,timestamptz,date,integer,text,text,text,text,text) to authenticated;

create or replace function public.correct_all_time_late_backfill_batch_entry(
  p_observation_id uuid,p_expected_updated_at timestamptz,p_new_hole_strokes jsonb,p_reason text
) returns public.all_time_record_observations language plpgsql security definer set search_path to '' as $function$
declare
  v_user_id uuid:=auth.uid(); v_old public.all_time_record_observations%rowtype; v_result public.all_time_record_observations%rowtype;
  v_course public.all_time_courses%rowtype; v_new_score integer; v_season_id uuid; v_period record;
begin
  if v_user_id is null or not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required' using errcode='42501'; end if;
  if nullif(btrim(p_reason),'') is null then raise exception 'A correction reason is required'; end if;
  select * into v_old from public.all_time_record_observations where id=p_observation_id and entry_type='late_backfill' and card_batch_id is not null and voided_at is null for update;
  if not found then raise exception 'Active late/backfill card observation was not found'; end if;
  if v_old.updated_at is distinct from p_expected_updated_at then raise exception 'This record changed before correction; reload and review again'; end if;
  select * into v_course from public.all_time_courses where id=v_old.course_id;
  if v_course.par is null or jsonb_typeof(p_new_hole_strokes)<>'array' or jsonb_array_length(p_new_hole_strokes)<>18 then raise exception 'Card correction requires 18 hole scores and authoritative total par'; end if;
  if exists(select 1 from jsonb_array_elements(p_new_hole_strokes) value where jsonb_typeof(value)<>'number' or value::text !~ '^[0-9]+$' or value::text::integer<1) then raise exception 'Corrected hole scores must be positive whole numbers'; end if;
  v_new_score:=(select sum(value::text::integer) from jsonb_array_elements(p_new_hole_strokes) value)-v_course.par;
  insert into public.all_time_correction_audit(observation_id,course_id,player_id,action,old_values,new_values,reason,changed_by)
  values(v_old.id,v_old.course_id,v_old.player_id,'EDIT',jsonb_build_object('score',v_old.score,'hole_strokes',v_old.hole_strokes,'card_batch_id',v_old.card_batch_id),jsonb_build_object('score',v_new_score,'hole_strokes',p_new_hole_strokes,'card_batch_id',v_old.card_batch_id),btrim(p_reason),v_user_id);
  perform set_config('krys.late_backfill_mutation','on',true);
  update public.all_time_record_observations set score=v_new_score,hole_strokes=p_new_hole_strokes,metadata=metadata||jsonb_build_object('total_strokes',(select sum(value::text::integer) from jsonb_array_elements(p_new_hole_strokes) value),'hio_count',(select count(*) from jsonb_array_elements(p_new_hole_strokes) value where value::text='1')),corrected_at=clock_timestamp(),corrected_by=v_user_id,updated_at=clock_timestamp() where id=v_old.id returning * into v_result;
  select * into v_period from public.late_backfill_target_period();
  select id into v_season_id from public.climbers_seasons where starts_at=v_period.starts_at and ends_at=v_period.ends_at and status<>'finalized' order by created_at limit 1;
  if v_season_id is not null then perform public.replay_climbers_late_backfill_season(v_season_id); end if;
  return v_result;
end;
$function$;
revoke all on function public.correct_all_time_late_backfill_batch_entry(uuid,timestamptz,jsonb,text) from public,anon,authenticated;
grant execute on function public.correct_all_time_late_backfill_batch_entry(uuid,timestamptz,jsonb,text) to authenticated;

commit;

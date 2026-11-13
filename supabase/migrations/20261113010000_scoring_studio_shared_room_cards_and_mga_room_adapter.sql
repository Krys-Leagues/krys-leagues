-- Shared room scorecards and read-only adapter for authoritative MGA publications.
-- Adds only Studio metadata; it does not import or mutate MGA room records.

create table public.scoring_studio_shared_room_cards (
  instance_id uuid not null,
  round_id uuid not null,
  room_source text not null check (room_source in ('studio','mga_regular')),
  room_id uuid not null,
  evidence_path text not null unique,
  uploaded_by uuid not null references auth.users(id),
  uploaded_by_player_id uuid not null references public.players(id),
  updated_at timestamptz not null default now(),
  primary key(instance_id,round_id,room_source,room_id),
  foreign key(round_id,instance_id) references public.scoring_studio_rounds(id,instance_id) on delete cascade
);

create table public.scoring_studio_external_room_acknowledgments (
  instance_id uuid not null,
  round_id uuid not null,
  room_source text not null check (room_source='mga_regular'),
  room_id uuid not null,
  canonical_player_id uuid not null references public.players(id),
  published_version integer not null,
  acknowledged_at timestamptz not null default now(),
  primary key(instance_id,round_id,room_source,room_id,canonical_player_id,published_version),
  foreign key(round_id,instance_id) references public.scoring_studio_rounds(id,instance_id) on delete cascade
);

alter table public.scoring_studio_shared_room_cards enable row level security;
alter table public.scoring_studio_external_room_acknowledgments enable row level security;
revoke all on public.scoring_studio_shared_room_cards,public.scoring_studio_external_room_acknowledgments from public,anon,authenticated;

create function public.scoring_studio_room_access_v1(
  p_instance_id uuid,p_round_id uuid,p_room_source text,p_room_id uuid,p_player_id uuid default null
) returns boolean language plpgsql stable security definer set search_path = '' as $function$
declare v_player_id uuid := public.current_major_player_id();
begin
  if auth.uid() is null or p_room_source not in ('studio','mga_regular') then return false; end if;
  if p_player_id is not null and p_player_id is distinct from v_player_id
     and not public.scoring_studio_is_admin(p_instance_id) then return false; end if;
  if public.scoring_studio_is_admin(p_instance_id) then return true; end if;
  if v_player_id is null or p_player_id is not null and p_player_id<>v_player_id then return false; end if;
  if p_room_source='studio' then
    return exists(
      select 1 from public.scoring_studio_rooms rm
      join public.scoring_studio_room_members m on m.room_id=rm.id and m.instance_id=rm.instance_id and m.round_id=rm.round_id
      where rm.id=p_room_id and rm.instance_id=p_instance_id and rm.round_id=p_round_id
        and rm.published and rm.cancelled_at is null and m.canonical_player_id=v_player_id
    );
  end if;
  return exists(
    select 1
    from public.scoring_studio_instances i
    join public.scoring_studio_rounds sr on sr.id=p_round_id and sr.instance_id=i.id
    join mga_regular.registrations reg on reg.event_id=i.source_event_id and reg.status='registered'
    join mga_regular.room_assignments a on a.event_id=reg.event_id and a.registration_id=reg.id
    join mga_regular.rooms rm on rm.id=a.room_id and rm.event_id=a.event_id and rm.day_key=a.day_key
    join mga_regular.time_slots ts on ts.id=a.time_slot_id and ts.event_id=a.event_id and ts.day_key=a.day_key
    where i.id=p_instance_id and i.source_kind='mga_regular'
      and p_room_id=rm.id and sr.round_date=ts.event_date and sr.course_name=ts.course_name
      and public.resolve_canonical_player_id(reg.canonical_player_id)=v_player_id
      and (
        exists(select 1 from mga_regular.room_publication_rooms rp where rp.event_id=rm.event_id and rp.room_id=rm.id and rp.day_key=rm.day_key)
        or exists(select 1 from mga_regular.room_publications dp where dp.event_id=rm.event_id and dp.day_key=rm.day_key)
      )
  );
end;
$function$;

create function public.scoring_studio_can_read_shared_card_v1(p_path text)
returns boolean language plpgsql stable security definer set search_path = '' as $function$
declare v_instance uuid; v_round uuid; v_source text; v_room uuid;
begin
  if cardinality(string_to_array(p_path,'/'))<>4 or split_part(p_path,'/',3) not like 'room:%' then return false; end if;
  begin
    v_instance:=split_part(p_path,'/',1)::uuid;
    v_round:=split_part(p_path,'/',2)::uuid;
    v_source:=split_part(split_part(p_path,'/',3),':',2);
    v_room:=split_part(split_part(p_path,'/',3),':',3)::uuid;
  exception when others then return false;
  end;
  return exists(
    select 1 from public.scoring_studio_shared_room_cards c
    where c.instance_id=v_instance and c.round_id=v_round and c.room_source=v_source
      and c.room_id=v_room and c.evidence_path=p_path
      and public.scoring_studio_room_access_v1(v_instance,v_round,v_source,v_room,null)
  );
end;
$function$;

create function public.scoring_studio_register_shared_room_card_v1(
  p_instance_id uuid,p_round_id uuid,p_room_source text,p_room_id uuid,p_evidence_path text
) returns void language plpgsql security definer set search_path = '' as $function$
declare v_player_id uuid := public.current_major_player_id(); v_old jsonb;
begin
  if auth.uid() is null or v_player_id is null then raise exception 'Sign in with a canonical Global Player identity' using errcode='42501'; end if;
  if not public.scoring_studio_room_access_v1(p_instance_id,p_round_id,p_room_source,p_room_id,null) then
    raise exception 'Only an assigned player or authorized Admin can attach a room scorecard' using errcode='42501';
  end if;
  if p_evidence_path is null
     or split_part(p_evidence_path,'/',1)<>p_instance_id::text
     or split_part(p_evidence_path,'/',2)<>p_round_id::text
     or split_part(p_evidence_path,'/',3)<>'room:'||p_room_source||':'||p_room_id::text
     or not exists(select 1 from storage.objects o where o.bucket_id='scoring-studio-evidence' and o.name=p_evidence_path) then
    raise exception 'Shared room scorecard evidence path is invalid';
  end if;
  select to_jsonb(c) into v_old from public.scoring_studio_shared_room_cards c
    where c.instance_id=p_instance_id and c.round_id=p_round_id and c.room_source=p_room_source and c.room_id=p_room_id for update;
  insert into public.scoring_studio_shared_room_cards(instance_id,round_id,room_source,room_id,evidence_path,uploaded_by,uploaded_by_player_id)
  values(p_instance_id,p_round_id,p_room_source,p_room_id,p_evidence_path,auth.uid(),v_player_id)
  on conflict(instance_id,round_id,room_source,room_id) do update
    set evidence_path=excluded.evidence_path,uploaded_by=excluded.uploaded_by,uploaded_by_player_id=excluded.uploaded_by_player_id,updated_at=now();
  insert into public.scoring_studio_audit_log(instance_id,round_id,canonical_player_id,entity_type,entity_id,action,before_state,after_state,actor_user_id)
  values(p_instance_id,p_round_id,v_player_id,'room',p_room_id,'shared_scorecard_uploaded',v_old,
    jsonb_build_object('room_source',p_room_source,'evidence_path',p_evidence_path),auth.uid());
end;
$function$;

create function public.scoring_studio_submit_room_score_v1(
  p_submission_id uuid,p_instance_id uuid,p_round_id uuid,p_room_source text,p_room_id uuid,p_hole_strokes integer[]
) returns uuid language plpgsql security definer set search_path = '' as $function$
declare v_player_id uuid:=public.current_major_player_id(); v_par integer[]; v_total integer; v_to_par integer; v_path text; v_result uuid;
begin
  if auth.uid() is null or v_player_id is null then raise exception 'Sign in with your registered player identity' using errcode='42501'; end if;
  if p_submission_id is null or not public.scoring_studio_room_access_v1(p_instance_id,p_round_id,p_room_source,p_room_id,v_player_id) then
    raise exception 'You are not assigned to this published room for the selected round' using errcode='42501';
  end if;
  if not public.scoring_studio_holes_valid(p_hole_strokes,false) then raise exception 'Enter strokes for all 18 holes'; end if;
  select c.evidence_path into v_path from public.scoring_studio_shared_room_cards c
    where c.instance_id=p_instance_id and c.round_id=p_round_id and c.room_source=p_room_source and c.room_id=p_room_id;
  if v_path is null then raise exception 'Your room has not received a shared scorecard image yet'; end if;
  select r.par_by_hole into v_par from public.scoring_studio_rounds r where r.id=p_round_id and r.instance_id=p_instance_id;
  if not found then raise exception 'Tournament round not found'; end if;
  v_total:=public.scoring_studio_array_sum(p_hole_strokes);
  v_to_par:=public.scoring_studio_hole_to_par(v_total,p_hole_strokes,v_par);
  insert into public.scoring_studio_submissions(id,instance_id,round_id,canonical_player_id,submitted_by,total_strokes,hole_strokes,evidence_path)
  values(p_submission_id,p_instance_id,p_round_id,v_player_id,auth.uid(),v_total,p_hole_strokes,v_path);
  insert into public.scoring_studio_scores(instance_id,round_id,canonical_player_id,score_kind,source,hole_strokes,total_strokes,score_to_par,submission_id,updated_by)
  values(p_instance_id,p_round_id,v_player_id,'provisional','player_submission',p_hole_strokes,v_total,v_to_par,p_submission_id,auth.uid())
  on conflict(round_id,canonical_player_id,score_kind) do update
    set source=excluded.source,hole_strokes=excluded.hole_strokes,total_strokes=excluded.total_strokes,
      score_to_par=excluded.score_to_par,submission_id=excluded.submission_id,updated_by=auth.uid(),updated_at=now()
    where public.scoring_studio_scores.source<>'admin_live';
  insert into public.scoring_studio_audit_log(instance_id,round_id,canonical_player_id,entity_type,entity_id,action,after_state,actor_user_id)
  values(p_instance_id,p_round_id,v_player_id,'submission',p_submission_id,'room_score_submitted',
    jsonb_build_object('room_id',p_room_id,'room_source',p_room_source,'strokes',p_hole_strokes,'evidence_path',v_path),auth.uid());
  return p_submission_id;
end;
$function$;

create function public.scoring_studio_my_mga_published_rooms_v1(p_instance_id uuid)
returns table(room_id uuid,instance_id uuid,round_id uuid,round_number integer,round_date date,player_id uuid,
  screen_name text,room_name text,course_name text,difficulty text,starts_at timestamptz,time_zone text,
  room_roster text[],published_version integer,notification_pending boolean,room_source text)
language plpgsql stable security definer set search_path = '' as $function$
declare v_player uuid:=public.current_major_player_id(); v_source_event uuid; v_actor uuid:=auth.uid();
begin
  if v_actor is null or v_player is null then raise exception 'Sign in with your registered player identity' using errcode='42501'; end if;
  select i.source_event_id into v_source_event from public.scoring_studio_instances i
    where i.id=p_instance_id and i.source_kind='mga_regular' and i.status in ('live','complete');
  if v_source_event is null then return; end if;
  return query
  with mine as (
    select * from mga_api.my_published_rooms(v_source_event)
  ), joined as (
    select rm.id as room_id,rd.id as round_id,rd.round_number,ts.event_date as round_date,
      public.resolve_canonical_player_id(reg.canonical_player_id) as player_id,cp.screen_name,
      rm.room_name,ts.course_name,rd.difficulty,ts.starts_at,reg.player_time_zone,
      mine.published_at,
      array(
        select member_cp.screen_name
        from mga_regular.room_assignments ma
        join mga_regular.registrations mr on mr.id=ma.registration_id and mr.event_id=ma.event_id and mr.status='registered'
        join public.players member_cp on member_cp.id=public.resolve_canonical_player_id(mr.canonical_player_id)
        where ma.event_id=rm.event_id and ma.room_id=rm.id and ma.day_key=rm.day_key and ma.time_slot_id=rm.time_slot_id
        order by lower(member_cp.screen_name),member_cp.id
      ) as roster
    from mine
    join mga_regular.registrations reg on reg.id=mine.registration_id and reg.event_id=v_source_event and reg.status='registered'
    join mga_regular.room_assignments a on a.registration_id=reg.id and a.event_id=reg.event_id and a.day_key=mine.day_key
    join mga_regular.rooms rm on rm.id=a.room_id and rm.event_id=a.event_id and rm.day_key=a.day_key and rm.room_name=mine.room_name
    join mga_regular.time_slots ts on ts.id=a.time_slot_id and ts.event_id=a.event_id and ts.day_key=a.day_key
    join public.scoring_studio_rounds rd on rd.instance_id=p_instance_id and rd.round_date=ts.event_date and rd.course_name=ts.course_name
    join public.players cp on cp.id=v_player
    where public.resolve_canonical_player_id(reg.canonical_player_id)=v_player
  )
  select j.room_id,p_instance_id,j.round_id,j.round_number,j.round_date,j.player_id,j.screen_name,j.room_name,j.course_name,j.difficulty,
    j.starts_at,coalesce(j.player_time_zone,'America/New_York'),j.roster,
    hashtext(concat_ws('|',j.published_at,j.room_name,j.starts_at,j.roster))::integer,
    not exists(select 1 from public.scoring_studio_external_room_acknowledgments a where a.instance_id=p_instance_id
      and a.round_id=j.round_id and a.room_source='mga_regular' and a.room_id=j.room_id and a.canonical_player_id=v_player
      and a.published_version=hashtext(concat_ws('|',j.published_at,j.room_name,j.starts_at,j.roster))::integer),
    'mga_regular'::text
  from joined j order by j.round_date,j.starts_at,j.room_name;
end;
$function$;

create function public.scoring_studio_ack_room_v2(p_instance_id uuid,p_round_id uuid,p_room_source text,p_room_id uuid,p_published_version integer)
returns void language plpgsql security definer set search_path = '' as $function$
declare v_player uuid:=public.current_major_player_id(); v_version integer;
begin
  if auth.uid() is null or v_player is null then raise exception 'Sign in with your registered player identity' using errcode='42501'; end if;
  if p_room_source='studio' then
    perform public.scoring_studio_ack_room_v1(p_room_id,p_published_version);
    return;
  end if;
  if p_room_source<>'mga_regular' then raise exception 'Unsupported room source'; end if;
  select hashtext(concat_ws('|',p.published_at,p.room_name,p.starts_at,p.room_roster))::integer into v_version
    from public.scoring_studio_my_mga_published_rooms_v1(p_instance_id) p
    where p.round_id=p_round_id and p.room_id=p_room_id and p.published_version=p_published_version;
  if v_version is null then raise exception 'Published room assignment changed; reload the schedule' using errcode='40001'; end if;
  insert into public.scoring_studio_external_room_acknowledgments(instance_id,round_id,room_source,room_id,canonical_player_id,published_version)
  values(p_instance_id,p_round_id,p_room_source,p_room_id,v_player,v_version) on conflict do nothing;
end;
$function$;


-- MGA's pre-existing assignments remain authoritative. Studio can only manage
-- room rows for players without an existing assignment on that event round.
create function public.scoring_studio_guard_legacy_mga_room_duplicate()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare v_source_event uuid;
begin
  select i.source_event_id into v_source_event
  from public.scoring_studio_instances i where i.id=new.instance_id and i.source_kind='mga_regular';
  if v_source_event is null then return new; end if;
  if exists(
    select 1 from public.scoring_studio_rounds sr
    join mga_regular.time_slots ts on ts.event_id=v_source_event and ts.event_date=sr.round_date and ts.course_name=sr.course_name
    join mga_regular.room_assignments a on a.event_id=ts.event_id and a.time_slot_id=ts.id and a.day_key=ts.day_key
    join mga_regular.registrations reg on reg.id=a.registration_id and reg.event_id=a.event_id and reg.status='registered'
    where sr.id=new.round_id and sr.instance_id=new.instance_id
      and public.resolve_canonical_player_id(reg.canonical_player_id)=new.canonical_player_id
  ) then
    raise exception 'This player already has an authoritative MGA room assignment. Manage the assignment in the existing MGA room system.'
      using errcode='23505';
  end if;
  return new;
end;
$function$;
create trigger scoring_studio_no_duplicate_legacy_mga_room
before insert or update on public.scoring_studio_room_members
for each row execute function public.scoring_studio_guard_legacy_mga_room_duplicate();
revoke all on function public.scoring_studio_guard_legacy_mga_room_duplicate() from public,anon,authenticated,service_role;
create policy scoring_studio_shared_room_cards_read on public.scoring_studio_shared_room_cards
for select to authenticated using (public.scoring_studio_room_access_v1(instance_id,round_id,room_source,room_id,null));
create policy scoring_studio_external_room_ack_read on public.scoring_studio_external_room_acknowledgments
for select to authenticated using (canonical_player_id=public.current_major_player_id());

grant select on public.scoring_studio_shared_room_cards,public.scoring_studio_external_room_acknowledgments to authenticated;
grant execute on function public.scoring_studio_room_access_v1(uuid,uuid,text,uuid,uuid),
  public.scoring_studio_can_read_shared_card_v1(text),public.scoring_studio_register_shared_room_card_v1(uuid,uuid,text,uuid,text),
  public.scoring_studio_submit_room_score_v1(uuid,uuid,uuid,text,uuid,integer[]),
  public.scoring_studio_my_mga_published_rooms_v1(uuid),public.scoring_studio_ack_room_v2(uuid,uuid,text,uuid,integer) to authenticated;
revoke all on function public.scoring_studio_room_access_v1(uuid,uuid,text,uuid,uuid),
  public.scoring_studio_can_read_shared_card_v1(text),public.scoring_studio_register_shared_room_card_v1(uuid,uuid,text,uuid,text),
  public.scoring_studio_submit_room_score_v1(uuid,uuid,uuid,text,uuid,integer[]),
  public.scoring_studio_my_mga_published_rooms_v1(uuid),public.scoring_studio_ack_room_v2(uuid,uuid,text,uuid,integer) from public,anon;


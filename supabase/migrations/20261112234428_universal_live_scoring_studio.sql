-- Universal Live Scoring Studio, V1
-- Additive only: references the existing canonical players and registration
-- sources. It neither imports nor changes the existing MGA rooms or scores.

do $preflight$
begin
  if to_regclass('public.players') is null
     or to_regclass('mga_regular.registrations') is null
     or to_regclass('mga_regular.owner_users') is null
     or to_regprocedure('public.current_major_player_id()') is null
     or to_regprocedure('public.is_current_user_site_admin()') is null then
    raise exception 'Scoring Studio migration stopped: canonical player, MGA authorization, or registration contracts are missing';
  end if;
  if to_regclass('public.scoring_studio_instances') is not null
     or to_regclass('public.scoring_studio_rounds') is not null
     or to_regclass('public.scoring_studio_scores') is not null
     or to_regclass('public.scoring_studio_submissions') is not null
     or to_regclass('public.scoring_studio_rooms') is not null then
    raise exception 'Scoring Studio migration stopped: one or more V1 objects already exist; inspect before applying';
  end if;
  if exists(select 1 from storage.buckets where id='scoring-studio-evidence' and public) then
    raise exception 'Scoring Studio migration stopped: evidence bucket already exists and is public';
  end if;
end;
$preflight$;

create function public.scoring_studio_holes_valid(p_holes integer[], p_allow_null boolean)
returns boolean
language sql immutable set search_path = '' as $function$
  select coalesce(
    array_lower(p_holes, 1) = 1
    and array_length(p_holes, 1) = 18
    and not exists (
      select 1 from unnest(p_holes) as h(strokes)
      where (h.strokes is null and not p_allow_null)
         or (h.strokes is not null and h.strokes < 1)
    ), false
  );
$function$;

create function public.scoring_studio_array_sum(p_values integer[])
returns integer
language sql immutable set search_path = '' as $function$
  select coalesce(sum(v)::integer, 0)
  from unnest(coalesce(p_values, array[]::integer[])) as x(v)
  where v is not null;
$function$;

create table public.scoring_studio_templates (
  template_key text primary key,
  name text not null,
  version integer not null check (version > 0),
  config_schema jsonb not null default '{}'::jsonb,
  approved boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

insert into public.scoring_studio_templates(template_key, name, version, config_schema, approved)
values (
  'universal-live-scoring-v1',
  'Universal Live Scoring Studio',
  1,
  '{"rounds":"configurable","scoring":"tournament-specific","rooms":"individual-publication","evidence":"private-storage"}'::jsonb,
  true
);

create table public.scoring_studio_instances (
  id uuid primary key default extensions.gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$'),
  name text not null,
  template_key text not null references public.scoring_studio_templates(template_key),
  template_version integer not null,
  source_kind text not null check (source_kind in ('mga_regular', 'tournament')),
  source_event_id uuid not null,
  config jsonb not null default '{}'::jsonb,
  default_room_capacity integer not null default 4 check (default_room_capacity >= 1),
  status text not null default 'draft' check (status in ('draft', 'live', 'complete')),
  public_results boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create table public.scoring_studio_instance_admins (
  instance_id uuid not null references public.scoring_studio_instances(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  granted_by uuid references auth.users(id),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key(instance_id, user_id)
);

create table public.scoring_studio_rounds (
  id uuid primary key default extensions.gen_random_uuid(),
  instance_id uuid not null references public.scoring_studio_instances(id) on delete cascade,
  round_number integer not null check (round_number > 0),
  label text not null,
  round_date date not null,
  course_name text not null,
  difficulty text not null check (difficulty in ('easy', 'hard')),
  par_by_hole integer[] not null check (public.scoring_studio_holes_valid(par_by_hole, false)),
  time_zone text not null default 'America/New_York',
  scoring_rules jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(instance_id, round_number),
  unique(id, instance_id)
);

create table public.scoring_studio_scores (
  id uuid primary key default extensions.gen_random_uuid(),
  instance_id uuid not null references public.scoring_studio_instances(id) on delete cascade,
  round_id uuid not null,
  canonical_player_id uuid not null references public.players(id),
  score_kind text not null check (score_kind in ('provisional', 'official')),
  source text not null check (source in ('admin_live', 'admin_backfill', 'player_submission')),
  hole_strokes integer[] not null check (public.scoring_studio_holes_valid(hole_strokes, true)),
  total_strokes integer not null check (total_strokes > 0),
  score_to_par integer not null,
  submission_id uuid,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  verified_by uuid references auth.users(id),
  verified_at timestamptz,
  foreign key(round_id, instance_id) references public.scoring_studio_rounds(id, instance_id) on delete cascade,
  check ((score_kind = 'official' and verified_by is not null and verified_at is not null)
      or (score_kind = 'provisional' and verified_by is null and verified_at is null)),
  unique(round_id, canonical_player_id, score_kind)
);

create table public.scoring_studio_submissions (
  id uuid primary key default extensions.gen_random_uuid(),
  instance_id uuid not null references public.scoring_studio_instances(id) on delete cascade,
  round_id uuid not null,
  canonical_player_id uuid not null references public.players(id),
  submitted_by uuid not null references auth.users(id),
  total_strokes integer not null check (total_strokes > 0),
  hole_strokes integer[] not null check (public.scoring_studio_holes_valid(hole_strokes, true)),
  evidence_path text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  review_note text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key(round_id, instance_id) references public.scoring_studio_rounds(id, instance_id) on delete cascade
);

alter table public.scoring_studio_scores
  add constraint scoring_studio_scores_submission_fk
  foreign key(submission_id) references public.scoring_studio_submissions(id) on delete set null;

create table public.scoring_studio_rooms (
  id uuid primary key default extensions.gen_random_uuid(),
  instance_id uuid not null references public.scoring_studio_instances(id) on delete cascade,
  round_id uuid not null,
  room_name text not null check (length(btrim(room_name)) > 0),
  course_name text not null check (length(btrim(course_name)) > 0),
  difficulty text not null check (difficulty in ('easy', 'hard')),
  starts_at timestamptz not null,
  time_zone text not null default 'America/New_York',
  capacity integer not null default 4 check (capacity >= 1),
  published boolean not null default false,
  published_version integer not null default 0 check (published_version >= 0),
  cancelled_at timestamptz,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(round_id, instance_id) references public.scoring_studio_rounds(id, instance_id) on delete cascade,
  unique(id, instance_id, round_id)
);

create table public.scoring_studio_room_members (
  room_id uuid not null,
  instance_id uuid not null,
  round_id uuid not null,
  canonical_player_id uuid not null references public.players(id),
  assigned_at timestamptz not null default now(),
  assigned_by uuid references auth.users(id),
  primary key(room_id, canonical_player_id),
  unique(instance_id, round_id, canonical_player_id),
  foreign key(room_id, instance_id, round_id) references public.scoring_studio_rooms(id, instance_id, round_id) on delete cascade
);

create table public.scoring_studio_room_acknowledgments (
  room_id uuid not null references public.scoring_studio_rooms(id) on delete cascade,
  canonical_player_id uuid not null references public.players(id),
  published_version integer not null check (published_version > 0),
  acknowledged_at timestamptz not null default now(),
  primary key(room_id, canonical_player_id, published_version)
);

create table public.scoring_studio_audit_log (
  id uuid primary key default extensions.gen_random_uuid(),
  instance_id uuid not null references public.scoring_studio_instances(id) on delete cascade,
  round_id uuid,
  canonical_player_id uuid references public.players(id),
  entity_type text not null check (entity_type in ('score', 'submission', 'room', 'instance', 'admin')),
  entity_id uuid,
  action text not null,
  before_state jsonb,
  after_state jsonb,
  actor_user_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index scoring_studio_rounds_instance_idx on public.scoring_studio_rounds(instance_id, round_number);
create index scoring_studio_scores_instance_player_idx on public.scoring_studio_scores(instance_id, canonical_player_id, round_id);
create index scoring_studio_submissions_pending_idx on public.scoring_studio_submissions(instance_id, status, created_at desc);
create index scoring_studio_rooms_instance_round_idx on public.scoring_studio_rooms(instance_id, round_id, published);
create index scoring_studio_room_members_player_idx on public.scoring_studio_room_members(instance_id, round_id, canonical_player_id);
create index scoring_studio_audit_instance_idx on public.scoring_studio_audit_log(instance_id, created_at desc);

create function public.scoring_studio_is_admin(p_instance_id uuid)
returns boolean language sql stable security definer set search_path = '' as $function$
  select auth.uid() is not null and exists (
    select 1
    from public.scoring_studio_instances i
    where i.id = p_instance_id
      and (
        public.is_current_user_site_admin()
        or exists(select 1 from public.scoring_studio_instance_admins a where a.instance_id=i.id and a.user_id=auth.uid() and a.revoked_at is null)
        or (i.source_kind='mga_regular' and exists(select 1 from mga_regular.owner_users m where m.user_id=auth.uid() and m.is_active))
      )
  );
$function$;

create function public.scoring_studio_is_public(p_instance_id uuid)
returns boolean language sql stable security definer set search_path = '' as $function$
  select exists(select 1 from public.scoring_studio_instances i where i.id=p_instance_id and i.status='live' and i.public_results);
$function$;

create function public.scoring_studio_registered(p_instance_id uuid, p_round_id uuid, p_player_id uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $function$
declare v_kind text; v_event_id uuid;
begin
  select i.source_kind, i.source_event_id into v_kind, v_event_id
  from public.scoring_studio_instances i
  join public.scoring_studio_rounds r on r.instance_id=i.id and r.id=p_round_id
  where i.id=p_instance_id;
  if not found then return false; end if;
  if v_kind='mga_regular' then
    return exists(
      select 1 from mga_regular.registrations r
      where r.event_id=v_event_id and r.status='registered' and r.cancelled_at is null
        and public.resolve_canonical_player_id(r.canonical_player_id)=p_player_id
    );
  end if;
  return exists(
    select 1 from public.tournament_registrations r
    where r.tournament_id=v_event_id and r.status='confirmed' and r.withdrawn_at is null and r.player_id=p_player_id
  );
end;
$function$;

create function public.scoring_studio_hole_to_par(p_total integer, p_holes integer[], p_par integer[])
returns integer language plpgsql immutable set search_path = '' as $function$
declare v_index integer; v_holes integer := 0; v_par integer := 0;
begin
  for v_index in 1..18 loop
    if p_holes[v_index] is not null then
      v_holes := v_holes + 1;
      v_par := v_par + p_par[v_index];
    end if;
  end loop;
  if v_holes=0 then v_par := public.scoring_studio_array_sum(p_par); end if;
  return p_total-v_par;
end;
$function$;

create function public.scoring_studio_registered_players_v1(p_instance_id uuid)
returns table(registration_id uuid, canonical_player_id uuid, screen_name text, player_time_zone text)
language plpgsql stable security definer set search_path = '' as $function$
declare v_kind text; v_event_id uuid;
begin
  select i.source_kind,i.source_event_id into v_kind,v_event_id from public.scoring_studio_instances i where i.id=p_instance_id;
  if not found then raise exception 'Scoring tournament not found' using errcode='P0002'; end if;
  if not public.scoring_studio_is_admin(p_instance_id) and not public.scoring_studio_is_public(p_instance_id)
     and not exists(select 1 from public.scoring_studio_rounds r where r.instance_id=p_instance_id and public.scoring_studio_registered(p_instance_id,r.id,public.current_major_player_id())) then
    raise exception 'Tournament roster is not available' using errcode='42501';
  end if;
  if v_kind='mga_regular' then
    return query
      select r.id, p.id, p.screen_name, r.player_time_zone
      from mga_regular.registrations r
      join public.players p on p.id=public.resolve_canonical_player_id(r.canonical_player_id)
      where r.event_id=v_event_id and r.status='registered' and r.cancelled_at is null
        and r.canonical_player_id is not null
      order by lower(p.screen_name), p.id;
  else
    return query
      select r.id, p.id, p.screen_name, coalesce(r.player_timezone,'America/New_York')
      from public.tournament_registrations r
      join public.players p on p.id=r.player_id
      where r.tournament_id=v_event_id and r.status='confirmed' and r.withdrawn_at is null
      order by lower(p.screen_name), p.id;
  end if;
end;
$function$;

create function public.scoring_studio_my_published_rooms_v1(p_instance_id uuid)
returns table(room_id uuid, instance_id uuid, round_id uuid, round_number integer, round_date date, player_id uuid,
  screen_name text, room_name text, course_name text, difficulty text, starts_at timestamptz, time_zone text,
  room_roster text[], published_version integer, notification_pending boolean)
language plpgsql stable security definer set search_path = '' as $function$
declare v_player_id uuid := public.current_major_player_id();
begin
  if auth.uid() is null or v_player_id is null then raise exception 'Sign in with your registered player identity' using errcode='42501'; end if;
  if not exists(select 1 from public.scoring_studio_instances i where i.id=p_instance_id and i.status in ('live','complete'))
     or not exists(select 1 from public.scoring_studio_rounds r where r.instance_id=p_instance_id and public.scoring_studio_registered(p_instance_id,r.id,v_player_id)) then
    raise exception 'No registration is linked to this scoring tournament' using errcode='42501';
  end if;
  return query
  select rm.id,rm.instance_id,rm.round_id,rd.round_number,rd.round_date,v_player_id,me.screen_name,
    rm.room_name,rm.course_name,rm.difficulty,rm.starts_at,
    coalesce((select rp.player_time_zone from public.scoring_studio_registered_players_v1(p_instance_id) rp where rp.canonical_player_id=v_player_id),rd.time_zone),
    array(
      select p.screen_name from public.scoring_studio_room_members m
      join public.players p on p.id=m.canonical_player_id
      where m.room_id=rm.id and m.instance_id=rm.instance_id and m.round_id=rm.round_id
      order by lower(p.screen_name),p.id
    ),rm.published_version,
    not exists(select 1 from public.scoring_studio_room_acknowledgments a where a.room_id=rm.id and a.canonical_player_id=v_player_id and a.published_version=rm.published_version)
  from public.scoring_studio_rooms rm
  join public.scoring_studio_rounds rd on rd.id=rm.round_id and rd.instance_id=rm.instance_id
  join public.scoring_studio_room_members mine on mine.room_id=rm.id and mine.instance_id=rm.instance_id and mine.round_id=rm.round_id and mine.canonical_player_id=v_player_id
  join public.players me on me.id=v_player_id
  where rm.instance_id=p_instance_id and rm.published and rm.cancelled_at is null
  order by rd.round_number,rm.starts_at,rm.room_name;
end;
$function$;

create function public.scoring_studio_ack_room_v1(p_room_id uuid, p_published_version integer)
returns void language plpgsql security definer set search_path = '' as $function$
declare v_player_id uuid := public.current_major_player_id(); v_room public.scoring_studio_rooms%rowtype;
begin
  if auth.uid() is null or v_player_id is null then raise exception 'Sign in with your registered player identity' using errcode='42501'; end if;
  select * into v_room from public.scoring_studio_rooms r where r.id=p_room_id and r.published and r.cancelled_at is null;
  if not found or v_room.published_version<>p_published_version or not exists(select 1 from public.scoring_studio_room_members m where m.room_id=v_room.id and m.canonical_player_id=v_player_id) then
    raise exception 'Published room assignment changed; reload the schedule' using errcode='40001';
  end if;
  insert into public.scoring_studio_room_acknowledgments(room_id,canonical_player_id,published_version)
  values(v_room.id,v_player_id,v_room.published_version) on conflict do nothing;
end;
$function$;

create function public.scoring_studio_create_instance_v1(
  p_slug text, p_name text, p_template_key text, p_source_kind text, p_source_event_id uuid,
  p_config jsonb, p_rounds jsonb, p_default_room_capacity integer default 4
)
returns uuid language plpgsql security definer set search_path = '' as $function$
declare v_instance_id uuid; v_template public.scoring_studio_templates%rowtype; v_round jsonb;
begin
  if auth.uid() is null or not public.is_current_user_site_admin() then raise exception 'Site Admin permission required to create scoring instances' using errcode='42501'; end if;
  select * into v_template from public.scoring_studio_templates t where t.template_key=p_template_key and t.approved;
  if not found then raise exception 'Select an approved scoring template' using errcode='23503'; end if;
  if p_source_kind not in ('mga_regular','tournament') or p_default_room_capacity<1 or jsonb_typeof(p_rounds)<>'array' or jsonb_array_length(p_rounds)<1 then
    raise exception 'Tournament configuration must include a registration source, capacity, and at least one round' using errcode='22023';
  end if;
  if p_source_kind='mga_regular' and not exists(select 1 from mga_regular.events e where e.id=p_source_event_id) then raise exception 'MGA source event not found' using errcode='23503'; end if;
  if p_source_kind='tournament' and not exists(select 1 from public.tournaments e where e.id=p_source_event_id) then raise exception 'Registration source tournament not found' using errcode='23503'; end if;
  insert into public.scoring_studio_instances(slug,name,template_key,template_version,source_kind,source_event_id,config,default_room_capacity,created_by)
  values(lower(btrim(p_slug)),btrim(p_name),v_template.template_key,v_template.version, p_source_kind,p_source_event_id,coalesce(p_config,'{}'::jsonb),p_default_room_capacity,auth.uid())
  returning id into v_instance_id;
  for v_round in select value from jsonb_array_elements(p_rounds) loop
    insert into public.scoring_studio_rounds(instance_id,round_number,label,round_date,course_name,difficulty,par_by_hole,time_zone,scoring_rules)
    values(v_instance_id,(v_round->>'roundNumber')::integer,coalesce(nullif(v_round->>'label',''),'Round '||(v_round->>'roundNumber')),
      (v_round->>'date')::date,btrim(v_round->>'course'),lower(v_round->>'difficulty'),array(select jsonb_array_elements_text(v_round->'parByHole')::integer),
      coalesce(nullif(v_round->>'timeZone',''),'America/New_York'),coalesce(v_round->'scoringRules','{}'::jsonb));
  end loop;
  insert into public.scoring_studio_audit_log(instance_id,entity_type,entity_id,action,after_state,actor_user_id)
  values(v_instance_id,'instance',v_instance_id,'instance_created',jsonb_build_object('slug',p_slug,'name',p_name,'template',p_template_key,'rounds',jsonb_array_length(p_rounds)),auth.uid());
  return v_instance_id;
end;
$function$;

create function public.scoring_studio_set_instance_admin_v1(p_instance_id uuid,p_user_id uuid,p_enabled boolean)
returns void language plpgsql security definer set search_path = '' as $function$
begin
  if auth.uid() is null or not public.is_current_user_site_admin() then raise exception 'Site Admin permission required to manage tournament Admins' using errcode='42501'; end if;
  if p_enabled then
    insert into public.scoring_studio_instance_admins(instance_id,user_id,granted_by,revoked_at)
    values(p_instance_id,p_user_id,auth.uid(),null)
    on conflict(instance_id,user_id) do update set granted_by=excluded.granted_by,granted_at=now(),revoked_at=null;
  else
    update public.scoring_studio_instance_admins set revoked_at=now() where instance_id=p_instance_id and user_id=p_user_id and revoked_at is null;
  end if;
  insert into public.scoring_studio_audit_log(instance_id,entity_type,entity_id,action,after_state,actor_user_id)
  values(p_instance_id,'admin',p_user_id,case when p_enabled then 'admin_granted' else 'admin_revoked' end,jsonb_build_object('enabled',p_enabled),auth.uid());
end;
$function$;

create function public.scoring_studio_publish_instance_v1(p_instance_id uuid,p_publish boolean)
returns void language plpgsql security definer set search_path = '' as $function$
declare v_before jsonb; v_count integer;
begin
  if not public.scoring_studio_is_admin(p_instance_id) then raise exception 'Tournament Admin permission required' using errcode='42501'; end if;
  select jsonb_build_object('status',i.status,'public_results',i.public_results) into v_before from public.scoring_studio_instances i where i.id=p_instance_id for update;
  if not found then raise exception 'Scoring tournament not found' using errcode='P0002'; end if;
  select count(*) into v_count from public.scoring_studio_rounds r where r.instance_id=p_instance_id;
  if p_publish and v_count=0 then raise exception 'Add at least one round before publishing'; end if;
  update public.scoring_studio_instances set status=case when p_publish then 'live' else 'draft' end,public_results=p_publish,updated_at=now() where id=p_instance_id;
  insert into public.scoring_studio_audit_log(instance_id,entity_type,entity_id,action,before_state,after_state,actor_user_id)
  values(p_instance_id,'instance',p_instance_id,case when p_publish then 'instance_published' else 'instance_unpublished' end,v_before,jsonb_build_object('status',case when p_publish then 'live' else 'draft' end,'public_results',p_publish),auth.uid());
end;
$function$;

create function public.scoring_studio_create_room_v1(
  p_instance_id uuid,p_round_id uuid,p_room_name text,p_course_name text,p_difficulty text,
  p_starts_at timestamptz,p_time_zone text,p_capacity integer default 4
)
returns uuid language plpgsql security definer set search_path = '' as $function$
declare v_id uuid;
begin
  if not public.scoring_studio_is_admin(p_instance_id) then raise exception 'Tournament Admin permission required' using errcode='42501'; end if;
  if not exists(select 1 from public.scoring_studio_rounds r where r.id=p_round_id and r.instance_id=p_instance_id) then raise exception 'Tournament round not found'; end if;
  if p_capacity<1 or nullif(btrim(p_room_name),'') is null or nullif(btrim(p_course_name),'') is null or p_difficulty not in ('easy','hard') or not exists(select 1 from pg_timezone_names z where z.name=p_time_zone) then
    raise exception 'Enter a room name, course, difficulty, capacity, and valid time zone';
  end if;
  insert into public.scoring_studio_rooms(instance_id,round_id,room_name,course_name,difficulty,starts_at,time_zone,capacity,created_by,updated_by)
  values(p_instance_id,p_round_id,btrim(p_room_name),btrim(p_course_name),p_difficulty,p_starts_at,p_time_zone,p_capacity,auth.uid(),auth.uid()) returning id into v_id;
  insert into public.scoring_studio_audit_log(instance_id,round_id,entity_type,entity_id,action,after_state,actor_user_id)
  values(p_instance_id,p_round_id,'room',v_id,'room_created',jsonb_build_object('room_name',btrim(p_room_name),'course_name',btrim(p_course_name),'difficulty',p_difficulty,'starts_at',p_starts_at,'time_zone',p_time_zone,'capacity',p_capacity),auth.uid());
  return v_id;
end;
$function$;

create function public.scoring_studio_save_room_v1(
  p_room_id uuid,p_room_name text,p_course_name text,p_difficulty text,p_starts_at timestamptz,p_time_zone text,p_capacity integer
)
returns void language plpgsql security definer set search_path = '' as $function$
declare v_room public.scoring_studio_rooms%rowtype; v_before jsonb; v_after jsonb; v_count integer; v_changed boolean;
begin
  select * into v_room from public.scoring_studio_rooms r where r.id=p_room_id for update;
  if not found or not public.scoring_studio_is_admin(v_room.instance_id) then raise exception 'Tournament Admin permission required' using errcode='42501'; end if;
  if p_capacity<1 or nullif(btrim(p_room_name),'') is null or nullif(btrim(p_course_name),'') is null or p_difficulty not in ('easy','hard') or not exists(select 1 from pg_timezone_names z where z.name=p_time_zone) then raise exception 'Room fields are invalid'; end if;
  select count(*) into v_count from public.scoring_studio_room_members m where m.room_id=p_room_id;
  if p_capacity<v_count then raise exception 'Capacity cannot be less than the number assigned'; end if;
  v_before:=jsonb_build_object('room_name',v_room.room_name,'course_name',v_room.course_name,'difficulty',v_room.difficulty,'starts_at',v_room.starts_at,'time_zone',v_room.time_zone,'capacity',v_room.capacity);
  v_after:=jsonb_build_object('room_name',btrim(p_room_name),'course_name',btrim(p_course_name),'difficulty',p_difficulty,'starts_at',p_starts_at,'time_zone',p_time_zone,'capacity',p_capacity);
  v_changed:=v_before is distinct from v_after;
  update public.scoring_studio_rooms set room_name=btrim(p_room_name),course_name=btrim(p_course_name),difficulty=p_difficulty,starts_at=p_starts_at,time_zone=p_time_zone,capacity=p_capacity,updated_by=auth.uid(),updated_at=now(),published_version=published_version+case when published and v_changed then 1 else 0 end where id=p_room_id;
  if v_changed then insert into public.scoring_studio_audit_log(instance_id,round_id,entity_type,entity_id,action,before_state,after_state,actor_user_id)
    values(v_room.instance_id,v_room.round_id,'room',v_room.id,'room_edited',v_before,v_after,auth.uid()); end if;
end;
$function$;

create function public.scoring_studio_publish_room_v1(p_room_id uuid,p_publish boolean)
returns void language plpgsql security definer set search_path = '' as $function$
declare v_room public.scoring_studio_rooms%rowtype; v_members integer;
begin
  select * into v_room from public.scoring_studio_rooms r where r.id=p_room_id for update;
  if not found or not public.scoring_studio_is_admin(v_room.instance_id) then raise exception 'Tournament Admin permission required' using errcode='42501'; end if;
  select count(*) into v_members from public.scoring_studio_room_members m where m.room_id=p_room_id;
  if p_publish and v_members=0 then raise exception 'Assign at least one registered Global Player before publishing this room'; end if;
  if v_room.published is distinct from p_publish then
    update public.scoring_studio_rooms set published=p_publish,published_version=published_version+1,updated_by=auth.uid(),updated_at=now() where id=p_room_id;
    insert into public.scoring_studio_audit_log(instance_id,round_id,entity_type,entity_id,action,before_state,after_state,actor_user_id)
    values(v_room.instance_id,v_room.round_id,'room',p_room_id,case when p_publish then 'room_published' else 'room_unpublished' end,
      jsonb_build_object('published',v_room.published,'version',v_room.published_version),jsonb_build_object('published',p_publish,'version',v_room.published_version+1),auth.uid());
  end if;
end;
$function$;

create function public.scoring_studio_assign_room_player_v1(p_room_id uuid,p_player_id uuid,p_assign boolean)
returns void language plpgsql security definer set search_path = '' as $function$
declare v_target public.scoring_studio_rooms%rowtype; v_source public.scoring_studio_rooms%rowtype; v_count integer;
begin
  if p_assign then
    select * into v_target from public.scoring_studio_rooms r where r.id=p_room_id and r.cancelled_at is null for update;
    if not found or not public.scoring_studio_is_admin(v_target.instance_id) then raise exception 'Tournament Admin permission required' using errcode='42501'; end if;
    if not public.scoring_studio_registered(v_target.instance_id,v_target.round_id,p_player_id) then raise exception 'Player is not registered for this tournament round' using errcode='42501'; end if;
    select r.* into v_source from public.scoring_studio_rooms r join public.scoring_studio_room_members m on m.room_id=r.id where r.instance_id=v_target.instance_id and r.round_id=v_target.round_id and m.canonical_player_id=p_player_id for update;
    if found and v_source.id=v_target.id then return; end if;
    select count(*) into v_count from public.scoring_studio_room_members m where m.room_id=v_target.id;
    if v_count>=v_target.capacity then raise exception 'Room capacity reached'; end if;
    if v_source.id is not null then
      delete from public.scoring_studio_room_members where room_id=v_source.id and canonical_player_id=p_player_id;
      if v_source.published then update public.scoring_studio_rooms set published_version=published_version+1,updated_by=auth.uid(),updated_at=now() where id=v_source.id; end if;
      insert into public.scoring_studio_audit_log(instance_id,round_id,canonical_player_id,entity_type,entity_id,action,before_state,after_state,actor_user_id)
      values(v_source.instance_id,v_source.round_id,p_player_id,'room',v_source.id,'player_transferred_out',jsonb_build_object('room_name',v_source.room_name),jsonb_build_object('room_name',v_target.room_name),auth.uid());
    end if;
    insert into public.scoring_studio_room_members(room_id,instance_id,round_id,canonical_player_id,assigned_by)
    values(v_target.id,v_target.instance_id,v_target.round_id,p_player_id,auth.uid());
    if v_target.published then update public.scoring_studio_rooms set published_version=published_version+1,updated_by=auth.uid(),updated_at=now() where id=v_target.id; end if;
    insert into public.scoring_studio_audit_log(instance_id,round_id,canonical_player_id,entity_type,entity_id,action,before_state,after_state,actor_user_id)
    values(v_target.instance_id,v_target.round_id,p_player_id,'room',v_target.id,case when v_source.id is null then 'player_assigned' else 'player_transferred_in' end,
      case when v_source.id is null then null else jsonb_build_object('room_name',v_source.room_name) end,jsonb_build_object('room_name',v_target.room_name),auth.uid());
  else
    select r.* into v_source from public.scoring_studio_rooms r join public.scoring_studio_room_members m on m.room_id=r.id where r.id=p_room_id and m.canonical_player_id=p_player_id for update;
    if not found or not public.scoring_studio_is_admin(v_source.instance_id) then raise exception 'Tournament Admin permission required' using errcode='42501'; end if;
    delete from public.scoring_studio_room_members where room_id=v_source.id and canonical_player_id=p_player_id;
    if v_source.published then update public.scoring_studio_rooms set published_version=published_version+1,updated_by=auth.uid(),updated_at=now() where id=v_source.id; end if;
    insert into public.scoring_studio_audit_log(instance_id,round_id,canonical_player_id,entity_type,entity_id,action,before_state,actor_user_id)
    values(v_source.instance_id,v_source.round_id,p_player_id,'room',v_source.id,'player_unassigned',jsonb_build_object('room_name',v_source.room_name),auth.uid());
  end if;
end;
$function$;

create function public.scoring_studio_save_score_v1(
  p_instance_id uuid,p_round_id uuid,p_player_id uuid,p_total_strokes integer,p_hole_strokes integer[],p_official boolean default false
)
returns uuid language plpgsql security definer set search_path = '' as $function$
declare v_par integer[]; v_holes integer[]; v_total integer; v_to_par integer; v_kind text; v_source text; v_old jsonb; v_new_id uuid;
begin
  if not public.scoring_studio_is_admin(p_instance_id) then raise exception 'Tournament Admin permission required' using errcode='42501'; end if;
  if not public.scoring_studio_registered(p_instance_id,p_round_id,p_player_id) then raise exception 'Player is not registered for this round' using errcode='42501'; end if;
  select r.par_by_hole into v_par from public.scoring_studio_rounds r where r.id=p_round_id and r.instance_id=p_instance_id;
  if not found then raise exception 'Tournament round not found'; end if;
  v_holes:=coalesce(p_hole_strokes,array_fill(null::integer,array[18]));
  if not public.scoring_studio_holes_valid(v_holes,true) then raise exception 'Enter an 18-hole score array with positive strokes only for played holes'; end if;
  if p_total_strokes is not null and p_total_strokes<1 then raise exception 'Recorded total must be a positive whole number'; end if;
  if p_total_strokes is not null and public.scoring_studio_array_sum(v_holes)>0 and array_position(v_holes,null) is null and p_total_strokes<>public.scoring_studio_array_sum(v_holes) then raise exception 'Total must match the 18 recorded hole scores'; end if;
  v_total:=coalesce(p_total_strokes,public.scoring_studio_array_sum(v_holes));
  if v_total<1 then raise exception 'Enter a total or at least one hole score'; end if;
  v_to_par:=public.scoring_studio_hole_to_par(v_total,v_holes,v_par);
  v_kind:=case when p_official then 'official' else 'provisional' end;
  v_source:=case when p_total_strokes is not null and array_position(v_holes,null) is not null then 'admin_backfill' else 'admin_live' end;
  select to_jsonb(s) into v_old from public.scoring_studio_scores s where s.round_id=p_round_id and s.canonical_player_id=p_player_id and s.score_kind=v_kind for update;
  insert into public.scoring_studio_scores(instance_id,round_id,canonical_player_id,score_kind,source,hole_strokes,total_strokes,score_to_par,updated_by,updated_at,verified_by,verified_at)
  values(p_instance_id,p_round_id,p_player_id,v_kind,v_source,v_holes,v_total,v_to_par,auth.uid(),now(),case when p_official then auth.uid() end,case when p_official then now() end)
  on conflict(round_id,canonical_player_id,score_kind) do update set source=excluded.source,hole_strokes=excluded.hole_strokes,total_strokes=excluded.total_strokes,score_to_par=excluded.score_to_par,updated_by=excluded.updated_by,updated_at=excluded.updated_at,verified_by=excluded.verified_by,verified_at=excluded.verified_at
  returning id into v_new_id;
  insert into public.scoring_studio_audit_log(instance_id,round_id,canonical_player_id,entity_type,entity_id,action,before_state,after_state,actor_user_id)
  values(p_instance_id,p_round_id,p_player_id,'score',v_new_id,case when v_old is null then 'score_entered' else 'score_corrected' end,v_old,
    (select to_jsonb(s) from public.scoring_studio_scores s where s.id=v_new_id),auth.uid());
  return v_new_id;
end;
$function$;

create function public.scoring_studio_submit_scorecard_v1(p_submission_id uuid,p_instance_id uuid,p_round_id uuid,p_total_strokes integer,p_evidence_path text)
returns uuid language plpgsql security definer set search_path = '' as $function$
declare v_player_id uuid := public.current_major_player_id(); v_par integer[]; v_holes integer[] := array_fill(null::integer,array[18]); v_to_par integer; v_existing uuid;
begin
  if auth.uid() is null or v_player_id is null then raise exception 'Sign in with your registered player identity' using errcode='42501'; end if;
  if p_submission_id is null or p_total_strokes is null or p_total_strokes<1 then raise exception 'Enter a positive 18-hole total and submit again'; end if;
  if not public.scoring_studio_registered(p_instance_id,p_round_id,v_player_id) then raise exception 'This Global Player is not registered for the selected tournament round' using errcode='42501'; end if;
  if nullif(p_evidence_path,'') is null or split_part(p_evidence_path,'/',1)<>p_instance_id::text or split_part(p_evidence_path,'/',2)<>p_round_id::text or split_part(p_evidence_path,'/',3)<>v_player_id::text then raise exception 'Upload scorecard evidence for this player and round before submitting'; end if;
  if not exists(select 1 from storage.objects o where o.bucket_id='scoring-studio-evidence' and o.name=p_evidence_path) then raise exception 'Scorecard evidence upload was not found'; end if;
  select r.par_by_hole into v_par from public.scoring_studio_rounds r where r.id=p_round_id and r.instance_id=p_instance_id;
  if not found then raise exception 'Tournament round not found'; end if;
  v_to_par:=p_total_strokes-public.scoring_studio_array_sum(v_par);
  insert into public.scoring_studio_submissions(id,instance_id,round_id,canonical_player_id,submitted_by,total_strokes,hole_strokes,evidence_path)
  values(p_submission_id,p_instance_id,p_round_id,v_player_id,auth.uid(),p_total_strokes,v_holes,p_evidence_path)
  on conflict(id) do nothing returning id into v_existing;
  if v_existing is null then
    if exists(select 1 from public.scoring_studio_submissions s where s.id=p_submission_id and s.instance_id=p_instance_id and s.canonical_player_id=v_player_id and s.submitted_by=auth.uid()) then return p_submission_id; end if;
    raise exception 'Submission identifier already belongs to another record';
  end if;
  insert into public.scoring_studio_scores(instance_id,round_id,canonical_player_id,score_kind,source,hole_strokes,total_strokes,score_to_par,submission_id,updated_by)
  values(p_instance_id,p_round_id,v_player_id,'provisional','player_submission',v_holes,p_total_strokes,v_to_par,p_submission_id,auth.uid())
  on conflict(round_id,canonical_player_id,score_kind) do update set source='player_submission',hole_strokes=excluded.hole_strokes,total_strokes=excluded.total_strokes,score_to_par=excluded.score_to_par,submission_id=excluded.submission_id,updated_by=auth.uid(),updated_at=now()
  where public.scoring_studio_scores.source<>'admin_live';
  insert into public.scoring_studio_audit_log(instance_id,round_id,canonical_player_id,entity_type,entity_id,action,after_state,actor_user_id)
  values(p_instance_id,p_round_id,v_player_id,'submission',p_submission_id,'scorecard_submitted',jsonb_build_object('strokes',p_total_strokes,'evidence_path',p_evidence_path),auth.uid());
  return p_submission_id;
end;
$function$;

create function public.scoring_studio_review_submission_v1(p_submission_id uuid,p_approve boolean,p_note text default null)
returns void language plpgsql security definer set search_path = '' as $function$
declare v_sub public.scoring_studio_submissions%rowtype; v_par integer[]; v_old jsonb; v_pending public.scoring_studio_submissions%rowtype;
begin
  select * into v_sub from public.scoring_studio_submissions s where s.id=p_submission_id for update;
  if not found or not public.scoring_studio_is_admin(v_sub.instance_id) then raise exception 'Tournament Admin permission required' using errcode='42501'; end if;
  if v_sub.status<>'pending' then raise exception 'This attempt has already been reviewed; use a new submission or enter a correction'; end if;
  update public.scoring_studio_submissions set status=case when p_approve then 'approved' else 'rejected' end,review_note=p_note,reviewed_by=auth.uid(),reviewed_at=now() where id=v_sub.id;
  if p_approve then
    select r.par_by_hole into v_par from public.scoring_studio_rounds r where r.id=v_sub.round_id and r.instance_id=v_sub.instance_id;
    select to_jsonb(s) into v_old from public.scoring_studio_scores s where s.round_id=v_sub.round_id and s.canonical_player_id=v_sub.canonical_player_id and s.score_kind='official' for update;
    insert into public.scoring_studio_scores(instance_id,round_id,canonical_player_id,score_kind,source,hole_strokes,total_strokes,score_to_par,submission_id,updated_by,verified_by,verified_at)
    values(v_sub.instance_id,v_sub.round_id,v_sub.canonical_player_id,'official','player_submission',v_sub.hole_strokes,v_sub.total_strokes,v_sub.total_strokes-public.scoring_studio_array_sum(v_par),v_sub.id,auth.uid(),auth.uid(),now())
    on conflict(round_id,canonical_player_id,score_kind) do update set source=excluded.source,hole_strokes=excluded.hole_strokes,total_strokes=excluded.total_strokes,score_to_par=excluded.score_to_par,submission_id=excluded.submission_id,updated_by=auth.uid(),verified_by=auth.uid(),verified_at=now(),updated_at=now();
    select * into v_pending from public.scoring_studio_submissions s where s.instance_id=v_sub.instance_id and s.round_id=v_sub.round_id and s.canonical_player_id=v_sub.canonical_player_id and s.status='pending' order by s.created_at desc limit 1;
    if found then
      update public.scoring_studio_scores set source='player_submission',hole_strokes=v_pending.hole_strokes,total_strokes=v_pending.total_strokes,score_to_par=v_pending.total_strokes-public.scoring_studio_array_sum(v_par),submission_id=v_pending.id,updated_by=v_pending.submitted_by,updated_at=now()
      where round_id=v_sub.round_id and canonical_player_id=v_sub.canonical_player_id and score_kind='provisional' and source='player_submission';
      if not found then insert into public.scoring_studio_scores(instance_id,round_id,canonical_player_id,score_kind,source,hole_strokes,total_strokes,score_to_par,submission_id,updated_by)
        values(v_pending.instance_id,v_pending.round_id,v_pending.canonical_player_id,'provisional','player_submission',v_pending.hole_strokes,v_pending.total_strokes,v_pending.total_strokes-public.scoring_studio_array_sum(v_par),v_pending.id,v_pending.submitted_by); end if;
    else
      delete from public.scoring_studio_scores where round_id=v_sub.round_id and canonical_player_id=v_sub.canonical_player_id and score_kind='provisional' and source='player_submission';
    end if;
  end if;
  insert into public.scoring_studio_audit_log(instance_id,round_id,canonical_player_id,entity_type,entity_id,action,before_state,after_state,actor_user_id)
  values(v_sub.instance_id,v_sub.round_id,v_sub.canonical_player_id,'submission',v_sub.id,case when p_approve then 'scorecard_approved' else 'scorecard_rejected' end,v_old,
    jsonb_build_object('status',case when p_approve then 'approved' else 'rejected' end,'note',p_note,'strokes',v_sub.total_strokes),auth.uid());
end;
$function$;

create function public.scoring_studio_valid_evidence_path(p_path text)
returns boolean language sql stable security definer set search_path = '' as $function$
  select case when auth.uid() is null or public.current_major_player_id() is null then false else exists (
    select 1 from public.scoring_studio_instances i join public.scoring_studio_rounds r on r.instance_id=i.id
    where i.id::text=split_part(p_path,'/',1) and r.id::text=split_part(p_path,'/',2)
      and public.scoring_studio_registered(i.id,r.id,public.current_major_player_id())
  ) end;
$function$;

create function public.scoring_studio_can_read_evidence(p_path text)
returns boolean language sql stable security definer set search_path = '' as $function$
  select exists (
    select 1 from public.scoring_studio_submissions s
    where s.evidence_path=p_path and (
      s.canonical_player_id=public.current_major_player_id()
      or public.scoring_studio_is_admin(s.instance_id)
    )
  );
$function$;

-- Client roles receive read-only access under instance-scoped RLS; all mutations
-- use the audited SECURITY DEFINER entry points below.
alter table public.scoring_studio_templates enable row level security;
alter table public.scoring_studio_instances enable row level security;
alter table public.scoring_studio_instance_admins enable row level security;
alter table public.scoring_studio_rounds enable row level security;
alter table public.scoring_studio_scores enable row level security;
alter table public.scoring_studio_submissions enable row level security;
alter table public.scoring_studio_rooms enable row level security;
alter table public.scoring_studio_room_members enable row level security;
alter table public.scoring_studio_room_acknowledgments enable row level security;
alter table public.scoring_studio_audit_log enable row level security;

create policy scoring_studio_templates_read on public.scoring_studio_templates for select to authenticated, anon using (approved);
create policy scoring_studio_instances_read on public.scoring_studio_instances for select to authenticated, anon using (public.scoring_studio_is_public(id) or public.scoring_studio_is_admin(id));
create policy scoring_studio_instance_admins_read on public.scoring_studio_instance_admins for select to authenticated using (public.scoring_studio_is_admin(instance_id));
create policy scoring_studio_rounds_read on public.scoring_studio_rounds for select to authenticated, anon using (public.scoring_studio_is_public(instance_id) or public.scoring_studio_is_admin(instance_id));
create policy scoring_studio_scores_read on public.scoring_studio_scores for select to authenticated, anon using (public.scoring_studio_is_public(instance_id) or public.scoring_studio_is_admin(instance_id));
create policy scoring_studio_submissions_read on public.scoring_studio_submissions for select to authenticated using (canonical_player_id=public.current_major_player_id() or public.scoring_studio_is_admin(instance_id));
create policy scoring_studio_rooms_read on public.scoring_studio_rooms for select to authenticated using (
  public.scoring_studio_is_admin(instance_id) or (published and cancelled_at is null and exists (
    select 1 from public.scoring_studio_room_members m where m.room_id=id and m.canonical_player_id=public.current_major_player_id()
  ))
);
create policy scoring_studio_room_members_read on public.scoring_studio_room_members for select to authenticated using (
  public.scoring_studio_is_admin(instance_id) or (canonical_player_id=public.current_major_player_id() and exists (
    select 1 from public.scoring_studio_rooms r where r.id=room_id and r.published and r.cancelled_at is null
  ))
);
create policy scoring_studio_room_ack_read on public.scoring_studio_room_acknowledgments for select to authenticated using (canonical_player_id=public.current_major_player_id());
create policy scoring_studio_audit_read on public.scoring_studio_audit_log for select to authenticated using (public.scoring_studio_is_admin(instance_id));

grant select on public.scoring_studio_templates,public.scoring_studio_instances,public.scoring_studio_rounds,public.scoring_studio_scores to anon,authenticated;
grant select on public.scoring_studio_instance_admins,public.scoring_studio_submissions,public.scoring_studio_rooms,public.scoring_studio_room_members,public.scoring_studio_room_acknowledgments,public.scoring_studio_audit_log to authenticated;
revoke all on public.scoring_studio_templates,public.scoring_studio_instances,public.scoring_studio_instance_admins,public.scoring_studio_rounds,public.scoring_studio_scores,public.scoring_studio_submissions,public.scoring_studio_rooms,public.scoring_studio_room_members,public.scoring_studio_room_acknowledgments,public.scoring_studio_audit_log from anon,authenticated;
grant select on public.scoring_studio_templates,public.scoring_studio_instances,public.scoring_studio_rounds,public.scoring_studio_scores to anon,authenticated;
grant select on public.scoring_studio_instance_admins,public.scoring_studio_submissions,public.scoring_studio_rooms,public.scoring_studio_room_members,public.scoring_studio_room_acknowledgments,public.scoring_studio_audit_log to authenticated;

revoke all on function public.scoring_studio_holes_valid(integer[],boolean) from public,anon,authenticated;
revoke all on function public.scoring_studio_array_sum(integer[]) from public,anon,authenticated;
revoke all on function public.scoring_studio_is_admin(uuid) from public,anon;
revoke all on function public.scoring_studio_is_public(uuid) from public,anon;
revoke all on function public.scoring_studio_registered(uuid,uuid,uuid) from public,anon;
revoke all on function public.scoring_studio_hole_to_par(integer,integer[],integer[]) from public,anon,authenticated;
revoke all on function public.scoring_studio_valid_evidence_path(text) from public,anon;
revoke all on function public.scoring_studio_can_read_evidence(text) from public,anon;
grant execute on function public.scoring_studio_is_admin(uuid),public.scoring_studio_is_public(uuid) to anon,authenticated;
grant execute on function public.scoring_studio_registered_players_v1(uuid),public.scoring_studio_my_published_rooms_v1(uuid),public.scoring_studio_ack_room_v1(uuid,integer),public.scoring_studio_submit_scorecard_v1(uuid,uuid,uuid,integer,text) to authenticated;
grant execute on function public.scoring_studio_create_instance_v1(text,text,text,text,uuid,jsonb,jsonb,integer),public.scoring_studio_set_instance_admin_v1(uuid,uuid,boolean),public.scoring_studio_publish_instance_v1(uuid,boolean),public.scoring_studio_create_room_v1(uuid,uuid,text,text,text,timestamptz,text,integer),public.scoring_studio_save_room_v1(uuid,text,text,text,timestamptz,text,integer),public.scoring_studio_publish_room_v1(uuid,boolean),public.scoring_studio_assign_room_player_v1(uuid,uuid,boolean),public.scoring_studio_save_score_v1(uuid,uuid,uuid,integer,integer[],boolean),public.scoring_studio_review_submission_v1(uuid,boolean,text) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('scoring-studio-evidence','scoring-studio-evidence',false,10485760,array['image/jpeg','image/png','image/webp','image/heic'])
on conflict(id) do nothing;
create policy scoring_studio_evidence_upload on storage.objects for insert to authenticated with check (bucket_id='scoring-studio-evidence' and public.scoring_studio_valid_evidence_path(name));
create policy scoring_studio_evidence_read on storage.objects for select to authenticated using (bucket_id='scoring-studio-evidence' and public.scoring_studio_can_read_evidence(name));
create policy scoring_studio_evidence_no_update on storage.objects for update to authenticated using (false) with check (false);
create policy scoring_studio_evidence_no_delete on storage.objects for delete to authenticated using (false);
grant execute on function public.scoring_studio_valid_evidence_path(text),public.scoring_studio_can_read_evidence(text) to authenticated;

revoke all on function public.scoring_studio_registered_players_v1(uuid),public.scoring_studio_my_published_rooms_v1(uuid),public.scoring_studio_ack_room_v1(uuid,integer),public.scoring_studio_submit_scorecard_v1(uuid,uuid,uuid,integer,text) from public,anon;
revoke all on function public.scoring_studio_create_instance_v1(text,text,text,text,uuid,jsonb,jsonb,integer),public.scoring_studio_set_instance_admin_v1(uuid,uuid,boolean),public.scoring_studio_publish_instance_v1(uuid,boolean),public.scoring_studio_create_room_v1(uuid,uuid,text,text,text,timestamptz,text,integer),public.scoring_studio_save_room_v1(uuid,text,text,text,timestamptz,text,integer),public.scoring_studio_publish_room_v1(uuid,boolean),public.scoring_studio_assign_room_player_v1(uuid,uuid,boolean),public.scoring_studio_save_score_v1(uuid,uuid,uuid,integer,integer[],boolean),public.scoring_studio_review_submission_v1(uuid,boolean,text) from public,anon;

do $realtime$
begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='scoring_studio_scores') then alter publication supabase_realtime add table public.scoring_studio_scores; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='scoring_studio_rooms') then alter publication supabase_realtime add table public.scoring_studio_rooms; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='scoring_studio_room_members') then alter publication supabase_realtime add table public.scoring_studio_room_members; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='scoring_studio_submissions') then alter publication supabase_realtime add table public.scoring_studio_submissions; end if;
end;
$realtime$;


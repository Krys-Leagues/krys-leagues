begin;

-- Current-generation Doubles Match Play.  Legacy doubles_* history remains
-- untouched; all live writes use these season-scoped canonical identities.
create table if not exists public.doubles_global_teams (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (btrim(display_name) <> ''),
  player_1_id uuid not null references public.players(id) on delete restrict,
  player_2_id uuid not null references public.players(id) on delete restrict,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (player_1_id <> player_2_id)
);

-- Production already has an empty canonical doubles identity table from the
-- historical recovery work. Keep its provenance columns and add only the
-- current-generation lifecycle fields needed by the authoritative writers.
alter table public.doubles_global_teams add column if not exists status text not null default 'ACTIVE';
alter table public.doubles_global_teams add column if not exists updated_at timestamptz not null default now();

create table if not exists public.doubles_managed_season_teams (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete restrict,
  global_team_id uuid not null references public.doubles_global_teams(id) on delete restrict,
  division text not null check (btrim(division) <> ''),
  order_position integer not null check (order_position > 0),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE')),
  team_name_snapshot text not null,
  created_at timestamptz not null default now(),
  unique (season_id, global_team_id),
  unique (season_id, division, order_position)
);

create table if not exists public.doubles_season_team_members (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete restrict,
  season_team_id uuid not null references public.doubles_managed_season_teams(id) on delete restrict,
  player_id uuid not null references public.players(id) on delete restrict,
  role text not null default 'MEMBER' check (role in ('MEMBER','SUBSTITUTE_HISTORY')),
  active boolean not null default true,
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to > effective_from)
);
create unique index if not exists doubles_active_player_one_team_per_season
  on public.doubles_season_team_members(season_id, player_id)
  where active and role = 'MEMBER';
create unique index if not exists doubles_two_active_members_per_team
  on public.doubles_season_team_members(season_team_id, player_id)
  where active and role = 'MEMBER';

create table if not exists public.doubles_managed_fixtures (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete restrict,
  division text not null check (btrim(division) <> ''),
  game_number integer not null check (game_number > 0),
  home_season_team_id uuid not null references public.doubles_managed_season_teams(id) on delete restrict,
  away_season_team_id uuid not null references public.doubles_managed_season_teams(id) on delete restrict,
  home_team_name_snapshot text not null,
  away_team_name_snapshot text not null,
  home_course text not null check (btrim(home_course) <> ''),
  away_course text not null check (btrim(away_course) <> ''),
  due_at timestamptz,
  arranged_at timestamptz,
  published_at timestamptz,
  status text not null default 'SCHEDULED' check (status in ('SCHEDULED','LIVE','COMPLETED','CANCELLED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (home_season_team_id <> away_season_team_id),
  unique (season_id, division, game_number)
);
create index if not exists doubles_fixture_home_idx on public.doubles_managed_fixtures(home_season_team_id);
create index if not exists doubles_fixture_away_idx on public.doubles_managed_fixtures(away_season_team_id);

create table if not exists public.doubles_team_course_drafts (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references public.doubles_managed_fixtures(id) on delete restrict,
  season_team_id uuid not null references public.doubles_managed_season_teams(id) on delete restrict,
  course_slot text not null check (course_slot in ('HOME_TEAM_COURSE','AWAY_TEAM_COURSE')),
  course_name text not null,
  player_one_id uuid not null references public.players(id) on delete restrict,
  player_two_id uuid not null references public.players(id) on delete restrict,
  player_one_holes jsonb not null default '[]'::jsonb,
  player_two_holes jsonb not null default '[]'::jsonb,
  home_holes_won integer,
  away_holes_won integer,
  status text not null default 'DRAFT' check (status in ('DRAFT','SUBMITTED','NEEDS_CORRECTION','VERIFIED')),
  submitted_by uuid references public.players(id) on delete set null,
  submitted_at timestamptz,
  updated_by uuid references public.players(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (fixture_id, season_team_id, course_slot),
  check (player_one_id <> player_two_id),
  check (home_holes_won is null or home_holes_won between 0 and 36),
  check (away_holes_won is null or away_holes_won between 0 and 36)
);

create table if not exists public.doubles_course_evidence (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references public.doubles_managed_fixtures(id) on delete restrict,
  course_slot text not null check (course_slot in ('HOME_TEAM_COURSE','AWAY_TEAM_COURSE')),
  storage_path text not null,
  original_filename text not null,
  content_type text not null,
  status text not null default 'SUBMITTED' check (status in ('SUBMITTED','NEEDS_CORRECTION','VERIFIED')),
  uploaded_by uuid not null references public.players(id) on delete restrict,
  reviewed_by uuid references auth.users(id) on delete set null,
  uploaded_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique (fixture_id, course_slot)
);

create table if not exists public.doubles_managed_results (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null unique references public.doubles_managed_fixtures(id) on delete restrict,
  home_course_home_holes integer check (home_course_home_holes between 0 and 18),
  home_course_away_holes integer check (home_course_away_holes between 0 and 18),
  away_course_home_holes integer check (away_course_home_holes between 0 and 18),
  away_course_away_holes integer check (away_course_away_holes between 0 and 18),
  home_holes_won integer not null check (home_holes_won between 0 and 36),
  away_holes_won integer not null check (away_holes_won between 0 and 36),
  home_points integer not null check (home_points >= 0),
  away_points integer not null check (away_points >= 0),
  outcome text not null check (outcome in ('HOME_WIN','AWAY_WIN','DRAW')),
  status text not null default 'VERIFIED' check (status in ('VERIFIED','OVERRIDDEN')),
  override_reason text,
  verified_by uuid not null references auth.users(id) on delete restrict,
  verified_at timestamptz not null default now()
);

create table if not exists public.doubles_result_audit (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references public.doubles_managed_fixtures(id) on delete restrict,
  action text not null check (action in ('DRAFT_SAVED','SUBMITTED','EVIDENCE_UPLOADED','EVIDENCE_REPLACED','HOLE_EDITED','NEEDS_CORRECTION','OVERRIDE','VERIFIED')),
  actor_player_id uuid references public.players(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  course_slot text,
  before_payload jsonb,
  after_payload jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.doubles_managed_standings (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete restrict,
  division text not null,
  season_team_id uuid not null references public.doubles_managed_season_teams(id) on delete restrict,
  team_name_snapshot text not null,
  played integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  ties integer not null default 0,
  points integer not null default 0,
  season_holes_won integer not null default 0,
  head_to_head_wins integer not null default 0,
  rank integer,
  updated_at timestamptz not null default now(),
  unique (season_id, division, season_team_id)
);

create table if not exists public.doubles_arrangements (
  fixture_id uuid primary key references public.doubles_managed_fixtures(id) on delete restrict,
  proposed_for timestamptz,
  accepted_for timestamptz,
  proposed_by uuid references public.players(id) on delete set null,
  accepted_by uuid references public.players(id) on delete set null,
  proposed_at timestamptz,
  accepted_at timestamptz,
  last_actor_player_id uuid references public.players(id) on delete set null,
  state text not null default 'OPEN' check (state in ('OPEN','NOT ARRANGED','PROPOSED','COUNTERED','ACCEPTED')),
  updated_at timestamptz not null default now()
);

create table if not exists public.doubles_arrangement_proposals (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references public.doubles_managed_fixtures(id) on delete cascade,
  proposed_for timestamptz not null,
  proposed_by uuid not null references public.players(id) on delete restrict,
  state text not null check (state in ('PROPOSED','COUNTERED','ACCEPTED','OBSOLETE')),
  created_at timestamptz not null default now()
);

create table if not exists public.doubles_arrangement_reminders (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references public.doubles_managed_fixtures(id) on delete cascade,
  recipient_player_id uuid not null references public.players(id) on delete restrict,
  reminder_key text not null,
  eligible_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (fixture_id, recipient_player_id, reminder_key)
);

create table if not exists public.doubles_fixture_chat (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references public.doubles_managed_fixtures(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete restrict,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

-- Compatibility storage for the existing Discord scorecard handoff. The new
-- team workspace is authoritative, but old links remain recoverable and point
-- at the same protected result writers.
create table if not exists public.doubles_scorecard_components (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references public.doubles_managed_fixtures(id) on delete restrict,
  component_key text not null check (component_key in ('course1','course2')),
  course text not null,
  uploader_player_id uuid not null references public.players(id) on delete restrict,
  evidence_storage_path text not null,
  original_filename text not null,
  content_type text not null,
  status text not null default 'RESERVED' check (status in ('RESERVED','RECEIVED','IN_REVIEW','VERIFIED','REJECTED')),
  card_date_text text,
  home_strokes jsonb,
  away_strokes jsonb,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fixture_id, component_key)
);

create table if not exists public.doubles_scorecard_commits (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null unique references public.doubles_managed_fixtures(id) on delete restrict,
  idempotency_key text not null unique,
  status text not null default 'PENDING' check (status in ('PENDING','COMMITTED','FAILED')),
  result_id uuid,
  error_message text,
  created_at timestamptz not null default now(),
  committed_at timestamptz
);

create table if not exists public.doubles_discord_division_mappings (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete restrict,
  division text not null,
  arrange_channel_id text,
  arrange_message_id text,
  board_channel_id text,
  board_message_id text,
  board_state text not null default 'PENDING' check (board_state in ('PENDING','SYNCED','RETRYABLE','EXHAUSTED','NOT_FOUND','HISTORICAL','TEST')),
  test_mode boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season_id, division)
);

create table if not exists public.doubles_discord_fixture_mappings (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null unique references public.doubles_managed_fixtures(id) on delete restrict,
  thread_id text,
  thread_channel_id text,
  starter_message_id text,
  match_image_message_id text,
  submit_component_message_id text,
  thread_state text not null default 'PENDING' check (thread_state in ('PENDING','MATCH_SET','ACTIVE','SCORECARD_SUBMITTED','RESULT_VERIFIED','COMPLETED','ARCHIVED','FAILED','TEST')),
  test_mode boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.doubles_discord_test_artifacts (
  id uuid primary key default gen_random_uuid(),
  artifact_type text not null check (artifact_type in ('ARRANGE','BOARD','THREAD','MESSAGE')),
  channel_id text not null,
  thread_id text,
  message_id text,
  ownership_key text not null unique,
  created_at timestamptz not null default now(),
  cleaned_at timestamptz
);

create table if not exists public.doubles_discord_event_outbox (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('ARRANGE_UPDATED','MATCH_SET','BOARD_REFRESH','SCORECARD_UPDATED','RESULT_COMPLETED')),
  season_id uuid not null references public.seasons(id) on delete restrict,
  division text not null,
  fixture_id uuid references public.doubles_managed_fixtures(id) on delete restrict,
  channel_id text not null,
  payload jsonb not null default '{}'::jsonb,
  idempotency_key text not null unique,
  status text not null default 'PENDING' check (status in ('PENDING','CLAIMED','DONE','RETRYABLE','EXHAUSTED','NOT_FOUND')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  claimed_at timestamptz,
  claimed_by text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into storage.buckets(id, name, public)
values ('doubles-scorecard-evidence', 'doubles-scorecard-evidence', false)
on conflict (id) do update set public = false;

do $$
begin
  execute 'alter table public.doubles_global_teams enable row level security';
  execute 'alter table public.doubles_managed_season_teams enable row level security';
  execute 'alter table public.doubles_season_team_members enable row level security';
  execute 'alter table public.doubles_managed_fixtures enable row level security';
  execute 'alter table public.doubles_team_course_drafts enable row level security';
  execute 'alter table public.doubles_course_evidence enable row level security';
  execute 'alter table public.doubles_managed_results enable row level security';
  execute 'alter table public.doubles_result_audit enable row level security';
  execute 'alter table public.doubles_managed_standings enable row level security';
  execute 'alter table public.doubles_arrangements enable row level security';
  execute 'alter table public.doubles_arrangement_proposals enable row level security';
  execute 'alter table public.doubles_arrangement_reminders enable row level security';
  execute 'alter table public.doubles_fixture_chat enable row level security';
  execute 'alter table public.doubles_scorecard_components enable row level security';
  execute 'alter table public.doubles_scorecard_commits enable row level security';
  execute 'alter table public.doubles_discord_division_mappings enable row level security';
  execute 'alter table public.doubles_discord_fixture_mappings enable row level security';
  execute 'alter table public.doubles_discord_test_artifacts enable row level security';
  execute 'alter table public.doubles_discord_event_outbox enable row level security';
end $$;

revoke all on table public.doubles_global_teams, public.doubles_managed_season_teams,
  public.doubles_season_team_members, public.doubles_managed_fixtures,
  public.doubles_team_course_drafts, public.doubles_course_evidence,
  public.doubles_managed_results, public.doubles_result_audit,
  public.doubles_managed_standings, public.doubles_arrangements,
  public.doubles_arrangement_proposals, public.doubles_arrangement_reminders,
  public.doubles_fixture_chat, public.doubles_scorecard_components,
  public.doubles_scorecard_commits, public.doubles_discord_division_mappings,
  public.doubles_discord_fixture_mappings, public.doubles_discord_test_artifacts,
  public.doubles_discord_event_outbox from anon, authenticated;

create or replace function public.save_doubles_result(
  p_fixture_id uuid,
  p_home_course_home_holes integer,
  p_home_course_away_holes integer,
  p_away_course_home_holes integer,
  p_away_course_away_holes integer,
  p_home_holes_won integer,
  p_away_holes_won integer,
  p_override_reason text default null
) returns uuid
language plpgsql security definer set search_path to '' as $function$
declare
  v_fixture public.doubles_managed_fixtures%rowtype;
  v_id uuid;
  v_outcome text;
  v_home_points integer;
  v_away_points integer;
begin
  if auth.uid() is null or not public.is_current_user_site_admin() then
    raise exception 'Site-admin authorization is required' using errcode='42501';
  end if;
  select * into v_fixture from public.doubles_managed_fixtures where id = p_fixture_id for update;
  if not found or v_fixture.status = 'CANCELLED' then raise exception 'Doubles fixture was not found'; end if;
  if p_home_holes_won is null or p_away_holes_won is null then raise exception 'Overall holes won are required'; end if;
  if p_home_holes_won < 0 or p_home_holes_won > 36 or p_away_holes_won < 0 or p_away_holes_won > 36 then raise exception 'Overall holes won must be between 0 and 36'; end if;
  if p_override_reason is null then
    if p_home_course_home_holes is null or p_home_course_away_holes is null or p_away_course_home_holes is null or p_away_course_away_holes is null then raise exception 'Both course totals are required for normal verification'; end if;
    if p_home_holes_won <> p_home_course_home_holes + p_away_course_home_holes or p_away_holes_won <> p_home_course_away_holes + p_away_course_away_holes then raise exception 'Overall totals do not match the two course totals'; end if;
    if (select count(*) from public.doubles_team_course_drafts d where d.fixture_id=p_fixture_id and d.status='SUBMITTED') <> 4 then raise exception 'Both teams must submit both course slots before verification'; end if;
    if exists (select 1 from public.doubles_course_evidence e where e.fixture_id=p_fixture_id and e.status not in ('SUBMITTED','VERIFIED')) or (select count(*) from public.doubles_course_evidence e where e.fixture_id=p_fixture_id) <> 2 then raise exception 'Both private course evidence uploads are required before verification'; end if;
    if exists (
      select 1 from (values
        (v_fixture.home_season_team_id, 'HOME_TEAM_COURSE'::text, p_home_course_home_holes, p_home_course_away_holes),
        (v_fixture.away_season_team_id, 'HOME_TEAM_COURSE'::text, p_home_course_home_holes, p_home_course_away_holes),
        (v_fixture.home_season_team_id, 'AWAY_TEAM_COURSE'::text, p_away_course_home_holes, p_away_course_away_holes),
        (v_fixture.away_season_team_id, 'AWAY_TEAM_COURSE'::text, p_away_course_home_holes, p_away_course_away_holes)
      ) required(season_team_id, course_slot, home_holes_won, away_holes_won)
      where not exists (
        select 1 from public.doubles_team_course_drafts d
        where d.fixture_id=p_fixture_id and d.season_team_id=required.season_team_id and d.course_slot=required.course_slot and d.status='SUBMITTED'
          and d.home_holes_won=required.home_holes_won and d.away_holes_won=required.away_holes_won
      )
    ) then raise exception 'Submitted team totals do not match the authoritative review values'; end if;
  elsif coalesce(btrim(p_override_reason),'') = '' then
    raise exception 'An explicit reason is required for an override';
  end if;
  if p_home_holes_won < p_away_holes_won then v_outcome := 'HOME_WIN'; v_home_points := 3; v_away_points := 0;
  elsif p_away_holes_won < p_home_holes_won then v_outcome := 'AWAY_WIN'; v_home_points := 0; v_away_points := 3;
  else v_outcome := 'DRAW'; v_home_points := 1; v_away_points := 1; end if;
  insert into public.doubles_managed_results(
    fixture_id, home_course_home_holes, home_course_away_holes,
    away_course_home_holes, away_course_away_holes, home_holes_won,
    away_holes_won, home_points, away_points, outcome, status, verified_by)
  values (
    p_fixture_id, p_home_course_home_holes, p_home_course_away_holes,
    p_away_course_home_holes, p_away_course_away_holes, p_home_holes_won,
    p_away_holes_won, v_home_points, v_away_points,
    v_outcome, case when p_override_reason is null then 'VERIFIED' else 'OVERRIDDEN' end, auth.uid())
  on conflict (fixture_id) do update set
    home_course_home_holes = excluded.home_course_home_holes,
    home_course_away_holes = excluded.home_course_away_holes,
    away_course_home_holes = excluded.away_course_home_holes,
    away_course_away_holes = excluded.away_course_away_holes,
    home_holes_won = excluded.home_holes_won, away_holes_won = excluded.away_holes_won,
    home_points = excluded.home_points, away_points = excluded.away_points,
    outcome = excluded.outcome, status = excluded.status, override_reason = excluded.override_reason,
    verified_by = excluded.verified_by, verified_at = now()
  returning id into v_id;
  update public.doubles_managed_fixtures set status='COMPLETED', updated_at=now() where id=p_fixture_id;
  insert into public.doubles_result_audit(fixture_id, action, actor_user_id, after_payload)
    values (p_fixture_id, case when p_override_reason is null then 'VERIFIED' else 'OVERRIDE' end, auth.uid(), jsonb_build_object('result_id', v_id, 'home_holes_won', p_home_holes_won, 'away_holes_won', p_away_holes_won, 'reason', p_override_reason));
  return v_id;
end;
$function$;

-- Preserve the existing admin/manual fallback contract without inventing
-- per-course values. Manual fallbacks are explicitly OVERRIDDEN and retain
-- only the authoritative overall result when course detail is unavailable.
create or replace function public.save_doubles_managed_result(p_fixture_id uuid, p_home_score integer, p_away_score integer)
returns uuid language plpgsql security definer set search_path to '' as $function$
begin
  return public.save_doubles_result(p_fixture_id, null, null, null, null, p_home_score, p_away_score, 'Admin manual fallback');
end;
$function$;

create or replace function public.rebuild_doubles_managed_standings(p_season_id uuid, p_division text)
returns integer language plpgsql security definer set search_path to '' as $function$
begin
  return public.rebuild_doubles_standings(p_season_id, p_division);
end;
$function$;

create or replace function public.rebuild_doubles_standings(p_season_id uuid, p_division text)
returns integer
language plpgsql security definer set search_path to '' as $function$
declare v_count integer;
begin
  if auth.uid() is null or not public.is_current_user_site_admin() then raise exception 'Site-admin authorization is required' using errcode='42501'; end if;
  delete from public.doubles_managed_standings where season_id=p_season_id and division=p_division;
  insert into public.doubles_managed_standings(season_id,division,season_team_id,team_name_snapshot,played,wins,losses,ties,points,season_holes_won,head_to_head_wins,rank)
  with team_stats_base as (
    select t.id, t.team_name_snapshot,
      count(r.id)::integer as played,
      count(*) filter (where (f.home_season_team_id=t.id and r.outcome='HOME_WIN') or (f.away_season_team_id=t.id and r.outcome='AWAY_WIN'))::integer as wins,
      count(*) filter (where (f.home_season_team_id=t.id and r.outcome='AWAY_WIN') or (f.away_season_team_id=t.id and r.outcome='HOME_WIN'))::integer as losses,
      count(*) filter (where r.outcome='DRAW')::integer as ties,
      coalesce(sum(case when f.home_season_team_id=t.id then r.home_points else r.away_points end),0)::integer as points,
      coalesce(sum(case when f.home_season_team_id=t.id then r.home_holes_won else r.away_holes_won end),0)::integer as season_holes_won
    from public.doubles_managed_season_teams t
    left join public.doubles_managed_fixtures f on (f.home_season_team_id=t.id or f.away_season_team_id=t.id) and f.status='COMPLETED'
    left join public.doubles_managed_results r on r.fixture_id=f.id
    where t.season_id=p_season_id and t.division=p_division and t.status='ACTIVE'
    group by t.id,t.team_name_snapshot
  ), team_stats as (
    select t.*,
      coalesce((
        select count(*)::integer
        from public.doubles_managed_fixtures f
        join public.doubles_managed_results r on r.fixture_id=f.id
        join team_stats_base opponent on opponent.id = case when f.home_season_team_id=t.id then f.away_season_team_id else f.home_season_team_id end
        where (f.home_season_team_id=t.id or f.away_season_team_id=t.id)
          and f.status='COMPLETED'
          and opponent.points=t.points
          and ((f.home_season_team_id=t.id and r.outcome='HOME_WIN') or (f.away_season_team_id=t.id and r.outcome='AWAY_WIN'))
      ),0)::integer as head_to_head_wins
    from team_stats_base t
  ), ranked as (
    select *, rank() over(order by points desc, head_to_head_wins desc, season_holes_won desc, team_name_snapshot, id)::integer as calculated_rank from team_stats
  )
  select p_season_id,p_division,id,team_name_snapshot,played,wins,losses,ties,points,season_holes_won,head_to_head_wins,calculated_rank from ranked;
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

create or replace function public.create_doubles_global_team(p_name text, p_player_1_id uuid, p_player_2_id uuid)
returns uuid language plpgsql security definer set search_path to '' as $function$
declare v_id uuid;
begin
  if auth.uid() is null or not public.is_current_user_site_admin() then raise exception 'Site-admin authorization is required' using errcode='42501'; end if;
  if coalesce(btrim(p_name),'')='' or p_player_1_id is null or p_player_2_id is null or p_player_1_id=p_player_2_id then raise exception 'A team name and two distinct players are required'; end if;
  insert into public.doubles_global_teams(display_name,player_1_id,player_2_id) values (btrim(p_name),p_player_1_id,p_player_2_id) returning id into v_id;
  return v_id;
end;
$function$;

create or replace function public.update_doubles_global_team(p_team_id uuid, p_name text, p_player_1_id uuid, p_player_2_id uuid)
returns uuid language plpgsql security definer set search_path to '' as $function$
declare v_team public.doubles_global_teams%rowtype;
begin
  if auth.uid() is null or not public.is_current_user_site_admin() then raise exception 'Site-admin authorization is required' using errcode='42501'; end if;
  if coalesce(btrim(p_name),'')='' or p_player_1_id is null or p_player_2_id is null or p_player_1_id=p_player_2_id then raise exception 'A team name and two distinct players are required'; end if;
  select * into v_team from public.doubles_global_teams where id=p_team_id and status='ACTIVE' for update;
  if not found then raise exception 'Active Doubles team was not found'; end if;
  if (v_team.player_1_id <> p_player_1_id or v_team.player_2_id <> p_player_2_id)
     and exists (select 1 from public.doubles_managed_season_teams where global_team_id=p_team_id) then
    raise exception 'Use season-scoped replacement for a roster change so team history remains immutable';
  end if;
  update public.doubles_global_teams set display_name=btrim(p_name),player_1_id=p_player_1_id,player_2_id=p_player_2_id,updated_at=now() where id=p_team_id;
  return p_team_id;
end;
$function$;

create or replace function public.replace_doubles_season_member(p_season_id uuid, p_season_team_id uuid, p_old_player_id uuid, p_replacement_player_id uuid, p_reason text)
returns uuid language plpgsql security definer set search_path to '' as $function$
declare v_id uuid;
begin
  if auth.uid() is null or not public.is_current_user_site_admin() then raise exception 'Site-admin authorization is required' using errcode='42501'; end if;
  if p_old_player_id=p_replacement_player_id or coalesce(btrim(p_reason),'')='' then raise exception 'A distinct replacement and reason are required'; end if;
  if exists(select 1 from public.doubles_season_team_members where season_id=p_season_id and player_id=p_replacement_player_id and active and role='MEMBER') then raise exception 'Replacement player is already rostered in this season'; end if;
  update public.doubles_season_team_members set active=false,effective_to=now() where season_id=p_season_id and season_team_id=p_season_team_id and player_id=p_old_player_id and active and role='MEMBER';
  if not found then raise exception 'Active season team member was not found'; end if;
  insert into public.doubles_season_team_members(season_id,season_team_id,player_id) values(p_season_id,p_season_team_id,p_replacement_player_id) returning id into v_id;
  return v_id;
end;
$function$;

create or replace function public.create_doubles_managed_season_team(p_season_id uuid, p_global_team_id uuid, p_division text, p_order_position integer)
returns uuid language plpgsql security definer set search_path to '' as $function$
declare v_id uuid; v_team public.doubles_global_teams%rowtype;
begin
  if auth.uid() is null or not public.is_current_user_site_admin() then raise exception 'Site-admin authorization is required' using errcode='42501'; end if;
  select * into v_team from public.doubles_global_teams where id=p_global_team_id and status='ACTIVE';
  if not found then raise exception 'Active canonical team was not found'; end if;
  insert into public.doubles_managed_season_teams(season_id,global_team_id,division,order_position,team_name_snapshot)
    values(p_season_id,p_global_team_id,btrim(p_division),p_order_position,v_team.display_name) returning id into v_id;
  insert into public.doubles_season_team_members(season_id,season_team_id,player_id)
    values(p_season_id,v_id,v_team.player_1_id),(p_season_id,v_id,v_team.player_2_id);
  return v_id;
end;
$function$;

create or replace function public.create_doubles_managed_fixture(
  p_season_id uuid, p_division text, p_game_number integer,
  p_home_season_team_id uuid, p_away_season_team_id uuid,
  p_home_course text, p_away_course text, p_due_at timestamptz)
returns uuid language plpgsql security definer set search_path to '' as $function$
declare v_id uuid; v_home text; v_away text;
begin
  if auth.uid() is null or not public.is_current_user_site_admin() then raise exception 'Site-admin authorization is required' using errcode='42501'; end if;
  select team_name_snapshot into v_home from public.doubles_managed_season_teams where id=p_home_season_team_id and season_id=p_season_id and division=p_division and status='ACTIVE';
  select team_name_snapshot into v_away from public.doubles_managed_season_teams where id=p_away_season_team_id and season_id=p_season_id and division=p_division and status='ACTIVE';
  if v_home is null or v_away is null or p_home_season_team_id=p_away_season_team_id then raise exception 'Both Home and Away teams must be active in the configured group'; end if;
  insert into public.doubles_managed_fixtures(season_id,division,game_number,home_season_team_id,away_season_team_id,home_team_name_snapshot,away_team_name_snapshot,home_course,away_course,due_at)
    values(p_season_id,p_division,p_game_number,p_home_season_team_id,p_away_season_team_id,v_home,v_away,btrim(p_home_course),btrim(p_away_course),p_due_at)
    on conflict (season_id,division,game_number) do update set home_season_team_id=excluded.home_season_team_id,away_season_team_id=excluded.away_season_team_id,home_team_name_snapshot=excluded.home_team_name_snapshot,away_team_name_snapshot=excluded.away_team_name_snapshot,home_course=excluded.home_course,away_course=excluded.away_course,due_at=excluded.due_at,updated_at=now()
    returning id into v_id;
  return v_id;
end;
$function$;

create or replace function public.list_doubles_admin_roster(p_season_id uuid default null)
returns jsonb language plpgsql security definer set search_path to '' as $function$
begin
  if auth.uid() is null or not public.is_current_user_site_admin() then raise exception 'Site-admin authorization is required' using errcode='42501'; end if;
  return jsonb_build_object(
    'teams', coalesce((select jsonb_agg(to_jsonb(t) order by t.display_name) from public.doubles_global_teams t), '[]'::jsonb),
    'seasonTeams', coalesce((select jsonb_agg(to_jsonb(t) order by t.division,t.order_position) from public.doubles_managed_season_teams t where p_season_id is null or t.season_id=p_season_id), '[]'::jsonb),
    'players', coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'display_name',p.screen_name) order by p.screen_name) from public.players p where p.active=true), '[]'::jsonb));
end;
$function$;

create or replace function public.list_doubles_admin_fixtures(p_season_id uuid default null, p_division text default null)
returns jsonb language plpgsql security definer set search_path to '' as $function$
begin
  if auth.uid() is null or not public.is_current_user_site_admin() then raise exception 'Site-admin authorization is required' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(to_jsonb(f) order by f.game_number) from public.doubles_managed_fixtures f where (p_season_id is null or f.season_id=p_season_id) and (p_division is null or f.division=p_division)), '[]'::jsonb);
end;
$function$;

create or replace function public.list_doubles_admin_results(p_fixture_id uuid default null)
returns jsonb language plpgsql security definer set search_path to '' as $function$
begin
  if auth.uid() is null or not public.is_current_user_site_admin() then raise exception 'Site-admin authorization is required' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(to_jsonb(r) order by r.verified_at desc) from public.doubles_managed_results r where p_fixture_id is null or r.fixture_id=p_fixture_id), '[]'::jsonb);
end;
$function$;

-- Public profile reader: deliberately returns only the public team identity and
-- competition record. It never returns player IDs, private roster membership,
-- scorecard evidence paths, or draft rows.
create or replace function public.get_public_doubles_team_profile(p_global_team_id uuid)
returns jsonb
language plpgsql security definer set search_path to '' as $function$
begin
  return coalesce((
    select jsonb_build_object(
      'team', jsonb_build_object('id', t.id, 'display_name', t.display_name, 'status', t.status),
      'seasons', coalesce((select jsonb_agg(jsonb_build_object(
        'season_id', st.season_id,
        'division', st.division,
        'team_name', st.team_name_snapshot,
        'standing', (select to_jsonb(s) - 'id' from public.doubles_managed_standings s where s.season_team_id=st.id)
      ) order by st.created_at desc) from public.doubles_managed_season_teams st where st.global_team_id=t.id), '[]'::jsonb)
    )
    from public.doubles_global_teams t
    where t.id=p_global_team_id
  ), jsonb_build_object('team', null, 'seasons', '[]'::jsonb));
end;
$function$;

revoke all on function public.save_doubles_result(uuid,integer,integer,integer,integer,integer,integer,text) from public, anon, authenticated;
revoke all on function public.rebuild_doubles_standings(uuid,text) from public, anon, authenticated;
revoke all on function public.save_doubles_managed_result(uuid,integer,integer) from public, anon, authenticated;
revoke all on function public.rebuild_doubles_managed_standings(uuid,text) from public, anon, authenticated;
revoke all on function public.create_doubles_global_team(text,uuid,uuid) from public, anon, authenticated;
revoke all on function public.update_doubles_global_team(uuid,text,uuid,uuid) from public, anon, authenticated;
revoke all on function public.replace_doubles_season_member(uuid,uuid,uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.create_doubles_managed_season_team(uuid,uuid,text,integer) from public, anon, authenticated;
revoke all on function public.create_doubles_managed_fixture(uuid,text,integer,uuid,uuid,text,text,timestamptz) from public, anon, authenticated;
revoke all on function public.list_doubles_admin_roster(uuid) from public, anon, authenticated;
revoke all on function public.list_doubles_admin_fixtures(uuid,text) from public, anon, authenticated;
revoke all on function public.list_doubles_admin_results(uuid) from public, anon, authenticated;
revoke all on function public.get_public_doubles_team_profile(uuid) from public, anon, authenticated;
grant execute on function public.save_doubles_result(uuid,integer,integer,integer,integer,integer,integer,text) to authenticated;
grant execute on function public.rebuild_doubles_standings(uuid,text) to authenticated;
grant execute on function public.save_doubles_managed_result(uuid,integer,integer) to authenticated;
grant execute on function public.rebuild_doubles_managed_standings(uuid,text) to authenticated;
grant execute on function public.create_doubles_global_team(text,uuid,uuid) to authenticated;
grant execute on function public.update_doubles_global_team(uuid,text,uuid,uuid) to authenticated;
grant execute on function public.replace_doubles_season_member(uuid,uuid,uuid,uuid,text) to authenticated;
grant execute on function public.create_doubles_managed_season_team(uuid,uuid,text,integer) to authenticated;
grant execute on function public.create_doubles_managed_fixture(uuid,text,integer,uuid,uuid,text,text,timestamptz) to authenticated;
grant execute on function public.list_doubles_admin_roster(uuid) to authenticated;
grant execute on function public.list_doubles_admin_fixtures(uuid,text) to authenticated;
grant execute on function public.list_doubles_admin_results(uuid) to authenticated;
grant execute on function public.get_public_doubles_team_profile(uuid) to anon, authenticated;

commit;

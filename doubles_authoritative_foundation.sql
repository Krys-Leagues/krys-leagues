begin;

-- Canonical live Doubles foundation. Legacy doubles_teams/schedule/results rows
-- remain untouched until an explicit, reviewed backfill maps them to these IDs.
create table if not exists public.doubles_global_teams (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  player_1_id uuid not null references public.players(id) on delete restrict,
  player_2_id uuid not null references public.players(id) on delete restrict,
  provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (btrim(display_name) <> ''),
  check (player_1_id <> player_2_id)
);
alter table public.doubles_global_teams add column if not exists canonical_name text;
alter table public.doubles_global_teams add column if not exists active boolean not null default true;

create table if not exists public.doubles_managed_season_teams (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete restrict,
  global_team_id uuid not null references public.doubles_global_teams(id) on delete restrict,
  division text not null,
  order_position integer not null check (order_position > 0),
  team_name_snapshot text not null,
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(),
  unique (season_id, division, order_position),
  unique (season_id, global_team_id)
);

create table if not exists public.doubles_season_team_members (
  id uuid primary key default gen_random_uuid(),
  season_team_id uuid not null references public.doubles_managed_season_teams(id) on delete restrict,
  season_id uuid not null references public.seasons(id) on delete restrict,
  player_id uuid not null references public.players(id) on delete restrict,
  role text not null default 'member' check (role in ('member','substitute_history')),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  replaced_by_player_id uuid references public.players(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to > effective_from),
  check (replaced_by_player_id is null or replaced_by_player_id <> player_id)
);
create unique index if not exists doubles_one_active_player_per_season
  on public.doubles_season_team_members(season_id, player_id)
  where effective_to is null and role = 'member';
create index if not exists doubles_season_team_members_team_idx
  on public.doubles_season_team_members(season_team_id, season_id);

create table if not exists public.doubles_managed_fixtures (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete restrict,
  division text not null,
  game_number integer not null check (game_number > 0),
  home_season_team_id uuid not null,
  away_season_team_id uuid not null,
  home_team_name_snapshot text not null,
  away_team_name_snapshot text not null,
  course text not null,
  due_at timestamptz,
  status text not null default 'scheduled' check (status in ('scheduled','completed','cancelled')),
  created_at timestamptz not null default now(),
  check (home_season_team_id <> away_season_team_id),
  check (btrim(home_team_name_snapshot) <> '' and btrim(away_team_name_snapshot) <> ''),
  unique (season_id, division, game_number, home_season_team_id, away_season_team_id)
);
create index if not exists doubles_managed_fixtures_season_division_idx
  on public.doubles_managed_fixtures(season_id, division, game_number);

create table if not exists public.doubles_managed_results (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null unique references public.doubles_managed_fixtures(id) on delete restrict,
  home_score integer not null,
  away_score integer not null,
  home_points integer not null check (home_points >= 0),
  away_points integer not null check (away_points >= 0),
  outcome text not null check (outcome in ('HOME_WIN','AWAY_WIN','DRAW')),
  entered_by uuid references auth.users(id) on delete set null,
  entered_at timestamptz not null default now(),
  check ((home_score < away_score and outcome = 'HOME_WIN' and home_points > away_points)
      or (away_score < home_score and outcome = 'AWAY_WIN' and away_points > home_points)
      or (home_score = away_score and outcome = 'DRAW' and home_points = away_points))
);

create table if not exists public.doubles_managed_standings (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete restrict,
  division text not null,
  season_team_id uuid not null,
  team_name_snapshot text not null,
  played integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  ties integer not null default 0,
  points integer not null default 0,
  rank integer,
  updated_at timestamptz not null default now(),
  unique (season_id, division, season_team_id)
);

create table if not exists public.doubles_season_member_replacements (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete restrict,
  season_team_id uuid not null,
  old_player_id uuid not null references public.players(id) on delete restrict,
  replacement_player_id uuid not null references public.players(id) on delete restrict,
  reason text not null,
  effective_at timestamptz not null default now(),
  changed_by uuid not null references auth.users(id) on delete restrict,
  check (old_player_id <> replacement_player_id)
);

create or replace function public.save_doubles_managed_result(p_fixture_id uuid,p_home_score integer,p_away_score integer)
returns uuid
language plpgsql security definer set search_path to '' as $function$
declare v_fixture public.doubles_managed_fixtures%rowtype; v_id uuid; v_outcome text; v_home_points integer; v_away_points integer;
begin
  if auth.uid() is null or not public.is_current_user_site_admin() then raise exception 'Site-admin authorization is required' using errcode='42501'; end if;
  if p_home_score is null or p_away_score is null then raise exception 'Both team scores are required'; end if;
  select * into v_fixture from public.doubles_managed_fixtures where id=p_fixture_id for update;
  if not found or v_fixture.status='cancelled' then raise exception 'Managed Doubles fixture was not found'; end if;
  if p_home_score < p_away_score then v_outcome='HOME_WIN'; v_home_points=3; v_away_points=0;
  elsif p_away_score < p_home_score then v_outcome='AWAY_WIN'; v_home_points=0; v_away_points=3;
  else v_outcome='DRAW'; v_home_points=1; v_away_points=1; end if;
  insert into public.doubles_managed_results(fixture_id,home_score,away_score,home_points,away_points,outcome,entered_by)
    values(p_fixture_id,p_home_score,p_away_score,v_home_points,v_away_points,v_outcome,auth.uid())
    on conflict (fixture_id) do update set home_score=excluded.home_score,away_score=excluded.away_score,home_points=excluded.home_points,away_points=excluded.away_points,outcome=excluded.outcome,entered_by=excluded.entered_by,entered_at=now()
    returning id into v_id;
  update public.doubles_managed_fixtures set status='completed' where id=p_fixture_id;
  return v_id;
end;
$function$;

create or replace function public.rebuild_doubles_managed_standings(p_season_id uuid,p_division text)
returns integer
language plpgsql security definer set search_path to '' as $function$
declare v_count integer;
begin
  if auth.uid() is null or not public.is_current_user_site_admin() then raise exception 'Site-admin authorization is required' using errcode='42501'; end if;
  delete from public.doubles_managed_standings where season_id=p_season_id and division=p_division;
  insert into public.doubles_managed_standings(season_id,division,season_team_id,team_name_snapshot,played,wins,losses,ties,points,rank)
  with team_totals as (
    select st.id as season_team_id,st.team_name_snapshot,
      count(r.id)::integer as played,
      coalesce(sum(case when f.home_season_team_id=st.id and r.outcome='HOME_WIN' then 1 when f.away_season_team_id=st.id and r.outcome='AWAY_WIN' then 1 else 0 end),0)::integer as wins,
      coalesce(sum(case when f.home_season_team_id=st.id and r.outcome='AWAY_WIN' then 1 when f.away_season_team_id=st.id and r.outcome='HOME_WIN' then 1 else 0 end),0)::integer as losses,
      coalesce(sum(case when r.outcome='DRAW' then 1 else 0 end),0)::integer as ties,
      coalesce(sum(case when f.home_season_team_id=st.id then r.home_points else r.away_points end),0)::integer as points
    from public.doubles_managed_season_teams st
    left join public.doubles_managed_fixtures f on f.season_id=st.season_id and f.division=st.division and (f.home_season_team_id=st.id or f.away_season_team_id=st.id)
    left join public.doubles_managed_results r on r.fixture_id=f.id
    where st.season_id=p_season_id and st.division=p_division and st.status='active'
    group by st.id,st.team_name_snapshot
  ), ranked as (
    select *,rank() over(order by points desc,wins desc,played desc,team_name_snapshot,season_team_id)::integer as calculated_rank from team_totals
  )
  select p_season_id,p_division,season_team_id,team_name_snapshot,played,wins,losses,ties,points,calculated_rank from ranked;
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

create or replace function public.create_doubles_global_team(p_name text,p_player_1_id uuid,p_player_2_id uuid)
returns uuid
language plpgsql security definer set search_path to '' as $function$
declare v_id uuid;
begin
  if auth.uid() is null or not public.is_current_user_site_admin() then raise exception 'Site-admin authorization is required' using errcode='42501'; end if;
  if coalesce(btrim(p_name),'')='' or p_player_1_id is null or p_player_2_id is null or p_player_1_id=p_player_2_id then raise exception 'A team name and two distinct players are required'; end if;
  if not exists(select 1 from public.players where id=p_player_1_id) or not exists(select 1 from public.players where id=p_player_2_id) then raise exception 'Both players must be canonical players'; end if;
  insert into public.doubles_global_teams(display_name,canonical_name,player_1_id,player_2_id) values(btrim(p_name),btrim(p_name),p_player_1_id,p_player_2_id) returning id into v_id;
  return v_id;
end;
$function$;

create or replace function public.create_doubles_managed_season_team(p_season_id uuid,p_global_team_id uuid,p_division text,p_order_position integer)
returns uuid
language plpgsql security definer set search_path to '' as $function$
declare v_id uuid; v_team public.doubles_global_teams%rowtype;
begin
  if auth.uid() is null or not public.is_current_user_site_admin() then raise exception 'Site-admin authorization is required' using errcode='42501'; end if;
  select * into v_team from public.doubles_global_teams where id=p_global_team_id and active=true;
  if not found or p_order_position is null or p_order_position < 1 or coalesce(btrim(p_division),'')='' then raise exception 'An active global team, division, and order are required'; end if;
  if exists(select 1 from public.doubles_managed_season_teams where season_id=p_season_id and global_team_id=p_global_team_id) then raise exception 'This team is already on the season roster'; end if;
  insert into public.doubles_managed_season_teams(season_id,global_team_id,division,order_position,team_name_snapshot) values(p_season_id,p_global_team_id,btrim(p_division),p_order_position,v_team.display_name) returning id into v_id;
  insert into public.doubles_season_team_members(season_team_id,season_id,player_id) values(v_id,p_season_id,v_team.player_1_id),(v_id,p_season_id,v_team.player_2_id);
  return v_id;
end;
$function$;

alter table public.doubles_season_team_members enable row level security;
alter table public.doubles_managed_season_teams enable row level security;
alter table public.doubles_managed_fixtures enable row level security;
alter table public.doubles_managed_results enable row level security;
alter table public.doubles_managed_standings enable row level security;
alter table public.doubles_season_member_replacements enable row level security;
revoke all on table public.doubles_managed_season_teams, public.doubles_season_team_members, public.doubles_managed_fixtures, public.doubles_managed_results, public.doubles_managed_standings, public.doubles_season_member_replacements from public, anon, authenticated;

create or replace function public.replace_doubles_season_member(
  p_season_id uuid,
  p_season_team_id uuid,
  p_old_player_id uuid,
  p_replacement_player_id uuid,
  p_reason text
) returns uuid
language plpgsql security definer set search_path to '' as $function$
declare v_id uuid;
begin
  if auth.uid() is null or not public.is_current_user_site_admin() then
    raise exception 'Site-admin authorization is required' using errcode='42501';
  end if;
  if p_old_player_id = p_replacement_player_id or coalesce(btrim(p_reason),'') = '' then
    raise exception 'A distinct replacement player and reason are required';
  end if;
  if not exists (select 1 from public.doubles_season_team_members where season_id=p_season_id and season_team_id=p_season_team_id and player_id=p_old_player_id and role='member' and effective_to is null) then
    raise exception 'The old player is not an active member of this season team';
  end if;
  if exists (select 1 from public.doubles_season_team_members where season_id=p_season_id and player_id=p_replacement_player_id and role='member' and effective_to is null) then
    raise exception 'The replacement player already belongs to a team in this season';
  end if;
  update public.doubles_season_team_members set effective_to=now(), replaced_by_player_id=p_replacement_player_id where season_id=p_season_id and season_team_id=p_season_team_id and player_id=p_old_player_id and role='member' and effective_to is null;
  insert into public.doubles_season_team_members(season_team_id,season_id,player_id,role) values(p_season_team_id,p_season_id,p_replacement_player_id,'member') returning id into v_id;
  insert into public.doubles_season_member_replacements(season_id,season_team_id,old_player_id,replacement_player_id,reason,changed_by) values(p_season_id,p_season_team_id,p_old_player_id,p_replacement_player_id,btrim(p_reason),auth.uid());
  return v_id;
end;
$function$;

revoke all on function public.replace_doubles_season_member(uuid,uuid,uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.save_doubles_managed_result(uuid,integer,integer) from public, anon, authenticated;
revoke all on function public.rebuild_doubles_managed_standings(uuid,text) from public, anon, authenticated;
revoke all on function public.create_doubles_global_team(text,uuid,uuid) from public, anon, authenticated;
revoke all on function public.create_doubles_managed_season_team(uuid,uuid,text,integer) from public, anon, authenticated;
grant execute on function public.replace_doubles_season_member(uuid,uuid,uuid,uuid,text) to authenticated;
grant execute on function public.save_doubles_managed_result(uuid,integer,integer) to authenticated;
grant execute on function public.rebuild_doubles_managed_standings(uuid,text) to authenticated;
grant execute on function public.create_doubles_global_team(text,uuid,uuid) to authenticated;
grant execute on function public.create_doubles_managed_season_team(uuid,uuid,text,integer) to authenticated;

commit;

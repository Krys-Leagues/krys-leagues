begin;

-- Local-only activation layer.  It keeps the legacy tables available for
-- history while making every new admin write explicit and team-owned.
create or replace function public.update_doubles_global_team(
  p_team_id uuid,
  p_name text,
  p_player_1_id uuid,
  p_player_2_id uuid
) returns uuid
language plpgsql security definer set search_path to '' as $function$
begin
  if auth.uid() is null or not public.is_current_user_site_admin() then
    raise exception 'Site-admin authorization is required' using errcode='42501';
  end if;
  if coalesce(btrim(p_name),'')='' or p_player_1_id is null or p_player_2_id is null or p_player_1_id=p_player_2_id then
    raise exception 'A team name and two distinct players are required';
  end if;
  update public.doubles_global_teams
  set display_name=btrim(p_name), canonical_name=btrim(p_name), player_1_id=p_player_1_id, player_2_id=p_player_2_id
  where id=p_team_id and active=true;
  if not found then raise exception 'Active canonical Doubles team was not found'; end if;
  return p_team_id;
end;
$function$;

create or replace function public.create_doubles_managed_fixture(
  p_season_id uuid,
  p_division text,
  p_game_number integer,
  p_home_season_team_id uuid,
  p_away_season_team_id uuid,
  p_course text,
  p_due_at timestamptz
) returns uuid
language plpgsql security definer set search_path to '' as $function$
declare v_home public.doubles_managed_season_teams%rowtype; v_away public.doubles_managed_season_teams%rowtype; v_id uuid;
begin
  if auth.uid() is null or not public.is_current_user_site_admin() then
    raise exception 'Site-admin authorization is required' using errcode='42501';
  end if;
  if p_home_season_team_id = p_away_season_team_id or coalesce(btrim(p_division),'')='' or coalesce(btrim(p_course),'')='' or p_game_number is null or p_game_number < 1 then
    raise exception 'A valid Home/Away fixture is required';
  end if;
  select * into v_home from public.doubles_managed_season_teams where id=p_home_season_team_id and season_id=p_season_id and division=p_division and status='active';
  select * into v_away from public.doubles_managed_season_teams where id=p_away_season_team_id and season_id=p_season_id and division=p_division and status='active';
  if not found or v_home.id is null or v_away.id is null then raise exception 'Both canonical season teams must be active in the division'; end if;
  insert into public.doubles_managed_fixtures(season_id,division,game_number,home_season_team_id,away_season_team_id,home_team_name_snapshot,away_team_name_snapshot,course,due_at)
  values(p_season_id,p_division,p_game_number,p_home_season_team_id,p_away_season_team_id,v_home.team_name_snapshot,v_away.team_name_snapshot,p_course,p_due_at)
  on conflict (season_id,division,game_number,home_season_team_id,away_season_team_id) do update set course=excluded.course,due_at=excluded.due_at
  returning id into v_id;
  return v_id;
end;
$function$;

create or replace function public.list_doubles_admin_roster(p_season_id uuid default null)
returns jsonb
language plpgsql security definer set search_path to '' as $function$
begin
  if auth.uid() is null or not public.is_current_user_site_admin() then
    raise exception 'Site-admin authorization is required' using errcode='42501';
  end if;
  return jsonb_build_object(
    'teams', coalesce((select jsonb_agg(to_jsonb(t) order by t.display_name) from public.doubles_global_teams t where t.active=true), '[]'::jsonb),
    'seasonTeams', coalesce((select jsonb_agg(to_jsonb(t) order by t.division,t.order_position) from public.doubles_managed_season_teams t where p_season_id is null or t.season_id=p_season_id), '[]'::jsonb),
    'players', coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'display_name',coalesce(p.screen_name,p.player_name,p.name,p.discord_name,'')) order by coalesce(p.screen_name,p.player_name,p.name,p.discord_name,'')) from public.players p where p.active=true), '[]'::jsonb)
  );
end;
$function$;

create or replace function public.list_doubles_admin_fixtures(p_season_id uuid default null, p_division text default null)
returns jsonb
language plpgsql security definer set search_path to '' as $function$
begin
  if auth.uid() is null or not public.is_current_user_site_admin() then
    raise exception 'Site-admin authorization is required' using errcode='42501';
  end if;
  return coalesce((select jsonb_agg(to_jsonb(f) order by f.game_number) from public.doubles_managed_fixtures f where (p_season_id is null or f.season_id=p_season_id) and (p_division is null or f.division=p_division)), '[]'::jsonb);
end;
$function$;

create or replace function public.list_doubles_admin_results(p_fixture_id uuid default null)
returns jsonb
language plpgsql security definer set search_path to '' as $function$
begin
  if auth.uid() is null or not public.is_current_user_site_admin() then
    raise exception 'Site-admin authorization is required' using errcode='42501';
  end if;
  return coalesce((select jsonb_agg(to_jsonb(r) order by r.entered_at desc) from public.doubles_managed_results r where p_fixture_id is null or r.fixture_id=p_fixture_id), '[]'::jsonb);
end;
$function$;

create or replace function public.list_doubles_legacy_mapping_review()
returns jsonb
language plpgsql security definer set search_path to '' as $function$
begin
  if auth.uid() is null or not public.is_current_user_site_admin() then
    raise exception 'Site-admin authorization is required' using errcode='42501';
  end if;
  return coalesce((select jsonb_agg(to_jsonb(m) order by m.status,m.created_at) from public.doubles_legacy_canonical_mapping_review m), '[]'::jsonb);
end;
$function$;

revoke all on function public.update_doubles_global_team(uuid,text,uuid,uuid) from public, anon, authenticated;
revoke all on function public.create_doubles_managed_fixture(uuid,text,integer,uuid,uuid,text,timestamptz) from public, anon, authenticated;
grant execute on function public.update_doubles_global_team(uuid,text,uuid,uuid) to authenticated;
grant execute on function public.create_doubles_managed_fixture(uuid,text,integer,uuid,uuid,text,timestamptz) to authenticated;
revoke all on function public.list_doubles_admin_roster(uuid) from public, anon, authenticated;
revoke all on function public.list_doubles_admin_fixtures(uuid,text) from public, anon, authenticated;
revoke all on function public.list_doubles_admin_results(uuid) from public, anon, authenticated;
grant execute on function public.list_doubles_admin_roster(uuid) to authenticated;
grant execute on function public.list_doubles_admin_fixtures(uuid,text) to authenticated;
grant execute on function public.list_doubles_admin_results(uuid) to authenticated;
revoke all on function public.list_doubles_legacy_mapping_review() from public, anon, authenticated;
grant execute on function public.list_doubles_legacy_mapping_review() to authenticated;

commit;

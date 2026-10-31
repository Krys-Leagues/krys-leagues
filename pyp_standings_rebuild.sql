create or replace function public.rebuild_pyp_standings(p_season_id uuid,p_division_number integer)
returns table(season_id uuid,pyp_roster_version_id uuid,division_number integer,rostered_player_count integer,completed_fixture_count integer)
language plpgsql security definer set search_path to '' as $function$
declare
  v_user_id uuid:=auth.uid();v_roster public.pyp_roster_versions%rowtype;v_season public.seasons%rowtype;
  v_rostered integer;v_completed integer;v_division text;v_standing record;
begin
  if not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required' using errcode='42501'; end if;
  if v_user_id is null then raise exception 'Authentication is required to rebuild PYP standings' using errcode='42501'; end if;
  if p_season_id is null then raise exception 'Season ID is required'; end if;
  if p_division_number is null or p_division_number<=0 then raise exception 'Division number must be positive'; end if;
  select r.* into v_roster from public.pyp_roster_versions r where r.season_id=p_season_id and r.status='approved' order by r.created_at,r.id limit 1 for update;
  if not found then
    if exists(select 1 from public.pyp_roster_versions r where r.season_id=p_season_id and r.status='locked') then raise exception 'A locked historical PYP roster cannot have live standings rebuilt' using errcode='42501';end if;
    raise exception 'Exactly one approved PYP roster is required';
  end if;
  if (select count(*) from public.pyp_roster_versions r where r.season_id=p_season_id and r.status='approved')<>1 then raise exception 'Exactly one approved PYP roster is required';end if;
  select s.* into v_season from public.seasons s where s.id=p_season_id for share;
  if not found or lower(btrim(v_season.league_type)) is distinct from 'pyp' then raise exception 'Season is not a managed PYP season';end if;
  if p_division_number>v_roster.division_count then raise exception 'Division % is outside 1..%',p_division_number,v_roster.division_count;end if;
  perform 1 from public.pyp_schedule_state s where s.season_id=p_season_id and s.change_revision=s.generated_revision and s.generated_revision=s.reviewed_revision and s.generated_revision>0 for update;
  if not found then raise exception 'PYP standings can be rebuilt only after the current schedule has been generated and reviewed';end if;
  if exists(select 1 from public.pyp_managed_results r join public.schedule f on f.id=r.schedule_id where r.season_id=p_season_id and r.roster_version_id=v_roster.id and r.division_number=p_division_number
    and (r.home_player_id<>f.pyp_home_player_id or r.away_player_id<>f.pyp_away_player_id or f.season_id<>r.season_id or f.pyp_roster_version_id<>r.roster_version_id))
    then raise exception 'A managed PYP result does not match its authoritative fixture';end if;
  v_division:='PYP D'||p_division_number::text;
  select count(*)::integer into v_rostered from public.pyp_division_roster_slots s where s.roster_version_id=v_roster.id and s.division_number=p_division_number and s.player_id is not null;
  select count(*)::integer into v_completed from public.pyp_managed_results r where r.season_id=p_season_id and r.roster_version_id=v_roster.id and r.division_number=p_division_number;
  perform 1 from public.season_standings st where st.league_type='pyp' and st.season_number=v_season.season_number and (st.division=v_division or st.player_id in(select s.player_id from public.pyp_division_roster_slots s where s.roster_version_id=v_roster.id and s.division_number=p_division_number and s.player_id is not null)) for update;
  delete from public.season_standings st where st.league_type='pyp' and st.season_number=v_season.season_number and st.division=v_division
    and not exists(select 1 from public.pyp_division_roster_slots s where s.roster_version_id=v_roster.id and s.division_number=p_division_number and s.player_id=st.player_id);

  for v_standing in
    with roster_players as(
      select s.player_id,s.player_screen_name from public.pyp_division_roster_slots s where s.roster_version_id=v_roster.id and s.division_number=p_division_number and s.player_id is not null
    ), contributions as(
      select r.home_player_id player_id,r.away_player_id opponent_id,case when r.home_total_hw>r.away_total_hw then 1 else 0 end wins,case when r.home_total_hw<r.away_total_hw then 1 else 0 end losses,case when r.is_draw then 1 else 0 end ties,r.home_total_hw holes_won
      from public.pyp_managed_results r where r.season_id=p_season_id and r.roster_version_id=v_roster.id and r.division_number=p_division_number
      union all
      select r.away_player_id,r.home_player_id,case when r.away_total_hw>r.home_total_hw then 1 else 0 end,case when r.away_total_hw<r.home_total_hw then 1 else 0 end,case when r.is_draw then 1 else 0 end,r.away_total_hw
      from public.pyp_managed_results r where r.season_id=p_season_id and r.roster_version_id=v_roster.id and r.division_number=p_division_number
    ), totals as(
      select rp.player_id,rp.player_screen_name,coalesce(sum(c.wins),0)::integer wins,coalesce(sum(c.losses),0)::integer losses,coalesce(sum(c.ties),0)::integer ties,count(c.player_id)::integer completed_game_count,coalesce(sum(c.holes_won),0)::integer holes_won
      from roster_players rp left join contributions c on c.player_id=rp.player_id group by rp.player_id,rp.player_screen_name
    ), h2h as(
      select t.player_id,coalesce(sum(case when c.wins=1 then 3 when c.ties=1 then 1 else 0 end) filter(where o.wins*3+o.ties=t.wins*3+t.ties),0)::integer head_to_head_points
      from totals t left join contributions c on c.player_id=t.player_id left join totals o on o.player_id=c.opponent_id group by t.player_id
    )
    select t.player_id,t.wins,t.losses,t.ties,t.wins*3+t.ties points,t.holes_won,
      row_number() over(order by t.wins*3+t.ties desc,h.head_to_head_points desc,t.holes_won desc,t.player_screen_name asc)::integer rank
    from totals t join h2h h on h.player_id=t.player_id
  loop
    insert into public.season_standings(player_id,league_type,season_number,division,points,wins,losses,ties,strokes,rank,updated_at)
    values(v_standing.player_id,'pyp',v_season.season_number,v_division,v_standing.points,v_standing.wins,v_standing.losses,v_standing.ties,v_standing.holes_won,v_standing.rank,now())
    on conflict(player_id,league_type,season_number) do update set division=excluded.division,points=excluded.points,wins=excluded.wins,losses=excluded.losses,ties=excluded.ties,strokes=excluded.strokes,rank=excluded.rank,updated_at=excluded.updated_at;
  end loop;
  return query select p_season_id,v_roster.id,p_division_number,v_rostered,v_completed;
end;
$function$;

revoke all on function public.rebuild_pyp_standings(uuid,integer) from public,anon,authenticated;
grant execute on function public.rebuild_pyp_standings(uuid,integer) to authenticated;

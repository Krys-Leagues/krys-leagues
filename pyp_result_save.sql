drop function if exists public.save_pyp_result(uuid,text,integer,integer,text,integer,integer);

create or replace function public.save_pyp_result(
  p_schedule_id uuid,
  p_course1_name text,
  p_course1_difficulty text,
  p_course1_home_hw integer,
  p_course1_away_hw integer,
  p_course2_name text,
  p_course2_difficulty text,
  p_course2_home_hw integer,
  p_course2_away_hw integer
)
returns table(result_id uuid,schedule_id uuid,home_total_hw integer,away_total_hw integer,winner_player_id uuid,is_draw boolean,result_created boolean)
language plpgsql security definer set search_path to '' as $function$
declare
  v_user_id uuid:=auth.uid();
  v_fixture public.schedule%rowtype;
  v_public_result public.results%rowtype;
  v_result public.pyp_managed_results%rowtype;
  v_winner uuid;
  v_draw boolean;
  v_created boolean:=false;
begin
  if not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required' using errcode='42501'; end if;
  if v_user_id is null then raise exception 'Authentication is required to save a PYP result' using errcode='42501'; end if;
  if p_schedule_id is null then raise exception 'Schedule fixture ID is required'; end if;
  if nullif(btrim(p_course1_name),'') is null or nullif(btrim(p_course2_name),'') is null then raise exception 'Both PYP course selections are required'; end if;
  if p_course1_difficulty is null or p_course1_difficulty not in ('Easy','Hard') or p_course2_difficulty is null or p_course2_difficulty not in ('Easy','Hard') then raise exception 'Each PYP course difficulty must be Easy or Hard'; end if;
  if p_course1_home_hw is null or p_course1_away_hw is null or p_course2_home_hw is null or p_course2_away_hw is null then raise exception 'All four PYP HW values are required'; end if;
  if least(p_course1_home_hw,p_course1_away_hw,p_course2_home_hw,p_course2_away_hw)<0 then raise exception 'PYP HW values cannot be negative'; end if;

  select fixture.* into v_fixture from public.schedule fixture where fixture.id=p_schedule_id for update;
  if not found then raise exception 'Schedule fixture % was not found',p_schedule_id; end if;
  if lower(btrim(v_fixture.league_type)) is distinct from 'pyp' or v_fixture.season_id is null or v_fixture.pyp_roster_version_id is null
    or v_fixture.division_number is null or v_fixture.division_number<=0 or v_fixture.game_number not between 1 and 3
    or v_fixture.pyp_home_player_id is null or v_fixture.pyp_away_player_id is null
    or v_fixture.pyp_home_player_id<>v_fixture.player1_id or v_fixture.pyp_away_player_id<>v_fixture.player2_id
  then raise exception 'Schedule fixture % is not a valid managed PYP fixture',p_schedule_id; end if;
  if exists(select 1 from public.pyp_roster_versions r where r.id=v_fixture.pyp_roster_version_id and r.season_id=v_fixture.season_id and r.status='locked')
    or exists(select 1 from public.pyp_final_scorecards c where c.season_id=v_fixture.season_id and c.status='approved')
  then raise exception 'Results cannot be changed after PYP Final Scorecard approval' using errcode='42501'; end if;
  perform 1 from public.pyp_schedule_state s where s.season_id=v_fixture.season_id and s.change_revision=s.generated_revision and s.generated_revision=s.reviewed_revision and s.generated_revision>0 for update;
  if not found then raise exception 'PYP results can be saved only after the current schedule has been generated and reviewed'; end if;

  if p_course1_home_hw+p_course2_home_hw>p_course1_away_hw+p_course2_away_hw then v_winner:=v_fixture.pyp_home_player_id;v_draw:=false;
  elsif p_course1_away_hw+p_course2_away_hw>p_course1_home_hw+p_course2_home_hw then v_winner:=v_fixture.pyp_away_player_id;v_draw:=false;
  else v_winner:=null;v_draw:=true; end if;

  select result.* into v_public_result from public.results result where result.schedule_id=p_schedule_id and lower(btrim(result.league_type))='pyp' for update;
  if found then
    update public.results result set course=btrim(p_course1_name)||' / '||btrim(p_course2_name),player1_hw=p_course1_home_hw+p_course2_home_hw,
      player2_hw=p_course1_away_hw+p_course2_away_hw,winner=case when v_draw then null when v_winner=v_fixture.pyp_home_player_id then v_fixture.pyp_home_player_screen_name else v_fixture.pyp_away_player_screen_name end,is_draw=v_draw
    where result.id=v_public_result.id returning result.* into v_public_result;
  else
    insert into public.results(schedule_id,league_type,season_number,division,game,course,player1,player2,player1_id,player2_id,result_type,player1_hw,player2_hw,winner,is_draw)
    values(v_fixture.id,v_fixture.league_type,v_fixture.season_number,v_fixture.division,v_fixture.game,btrim(p_course1_name)||' / '||btrim(p_course2_name),
      v_fixture.pyp_home_player_screen_name,v_fixture.pyp_away_player_screen_name,v_fixture.pyp_home_player_id,v_fixture.pyp_away_player_id,'league_result',
      p_course1_home_hw+p_course2_home_hw,p_course1_away_hw+p_course2_away_hw,case when v_draw then null when v_winner=v_fixture.pyp_home_player_id then v_fixture.pyp_home_player_screen_name else v_fixture.pyp_away_player_screen_name end,v_draw)
    returning * into v_public_result;
    v_created:=true;
  end if;

  select result.* into v_result from public.pyp_managed_results result where result.schedule_id=p_schedule_id for update;
  if found then
    update public.pyp_managed_results result set course1_name=btrim(p_course1_name),course1_difficulty=p_course1_difficulty,course1_home_hw=p_course1_home_hw,course1_away_hw=p_course1_away_hw,
      course2_name=btrim(p_course2_name),course2_difficulty=p_course2_difficulty,course2_home_hw=p_course2_home_hw,course2_away_hw=p_course2_away_hw,winner_player_id=v_winner,is_draw=v_draw,result_id=v_public_result.id
    where result.id=v_result.id returning result.* into v_result;
  else
    insert into public.pyp_managed_results(result_id,schedule_id,season_id,roster_version_id,division_number,game_number,home_player_id,away_player_id,
      home_player_screen_name,away_player_screen_name,course1_name,course1_difficulty,course1_home_hw,course1_away_hw,course2_name,course2_difficulty,course2_home_hw,course2_away_hw,winner_player_id,is_draw)
    values(v_public_result.id,v_fixture.id,v_fixture.season_id,v_fixture.pyp_roster_version_id,v_fixture.division_number,v_fixture.game_number,v_fixture.pyp_home_player_id,v_fixture.pyp_away_player_id,
      v_fixture.pyp_home_player_screen_name,v_fixture.pyp_away_player_screen_name,btrim(p_course1_name),p_course1_difficulty,p_course1_home_hw,p_course1_away_hw,btrim(p_course2_name),p_course2_difficulty,p_course2_home_hw,p_course2_away_hw,v_winner,v_draw)
    returning * into v_result;
  end if;
  return query select v_public_result.id,v_result.schedule_id,v_result.home_total_hw,v_result.away_total_hw,v_result.winner_player_id,v_result.is_draw,v_created;
end;
$function$;

revoke all on function public.save_pyp_result(uuid,text,text,integer,integer,text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.save_pyp_result(uuid,text,text,integer,integer,text,text,integer,integer) to authenticated;

create or replace function public.generate_pyp_final_scorecard(p_season_id uuid)
returns table(scorecard_id uuid,season_id uuid,roster_version_id uuid,status text,player_count integer,completed_fixture_count integer,total_fixture_count integer,incomplete_fixture_count integer)
language plpgsql security definer set search_path to '' as $function$
declare
  v_user_id uuid:=auth.uid();v_roster public.pyp_roster_versions%rowtype;v_season public.seasons%rowtype;v_state public.pyp_schedule_state%rowtype;v_card public.pyp_final_scorecards%rowtype;
  v_division integer;v_players integer;v_completed integer;v_total integer;
begin
  if not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required' using errcode='42501';end if;
  if v_user_id is null then raise exception 'Authentication is required';end if;
  if p_season_id is null then raise exception 'Season ID is required';end if;
  select r.* into v_roster from public.pyp_roster_versions r where r.season_id=p_season_id and r.status='approved' order by r.created_at,r.id limit 1 for update;
  if not found or (select count(*) from public.pyp_roster_versions r where r.season_id=p_season_id and r.status='approved')<>1 then raise exception 'Exactly one approved PYP roster is required';end if;
  select s.* into v_season from public.seasons s where s.id=p_season_id for share;
  if not found or lower(btrim(v_season.league_type)) is distinct from 'pyp' then raise exception 'Season is not a managed PYP season';end if;
  select s.* into v_state from public.pyp_schedule_state s where s.season_id=p_season_id and s.change_revision=s.generated_revision and s.generated_revision=s.reviewed_revision and s.generated_revision>0 for update;
  if not found then raise exception 'The current PYP schedule must be generated and reviewed first';end if;
  if exists(select 1 from public.pyp_final_scorecards c where c.season_id=p_season_id and c.status='approved') then raise exception 'An approved PYP Final Scorecard already exists';end if;
  select c.* into v_card from public.pyp_final_scorecards c where c.season_id=p_season_id and c.status='draft' for update;
  if found and v_card.source_roster_version_id<>v_roster.id then raise exception 'Existing draft belongs to a different roster version';
  elsif not found then insert into public.pyp_final_scorecards(season_id,source_roster_version_id,status,source_change_revision) values(p_season_id,v_roster.id,'draft',v_state.change_revision) returning * into v_card;end if;
  for v_division in 1..v_roster.division_count loop perform 1 from public.rebuild_pyp_standings(p_season_id,v_division);end loop;
  delete from public.pyp_final_scorecard_fixture_details d where d.scorecard_id=v_card.id;
  delete from public.pyp_final_scorecard_entries e where e.scorecard_id=v_card.id;
  insert into public.pyp_final_scorecard_entries(scorecard_id,season_id,division_number,division_rank,player_id,player_screen_name,completed_game_count,wins,losses,ties,points,holes_won)
  select v_card.id,p_season_id,slot.division_number,standing.rank,slot.player_id,slot.player_screen_name,
    standing.wins+standing.losses+standing.ties,standing.wins,standing.losses,standing.ties,standing.points,standing.strokes
  from public.pyp_division_roster_slots slot join public.season_standings standing on standing.player_id=slot.player_id and standing.league_type='pyp' and standing.season_number=v_season.season_number
  where slot.roster_version_id=v_roster.id and slot.player_id is not null;
  insert into public.pyp_final_scorecard_fixture_details(scorecard_id,season_id,player_id,opponent_player_id,opponent_screen_name,division_number,game_number,player_role,
    course1_name,course1_difficulty,course1_player_hw,course1_opponent_hw,course2_name,course2_difficulty,course2_player_hw,course2_opponent_hw,player_total_hw,opponent_total_hw,outcome)
  select v_card.id,p_season_id,r.home_player_id,r.away_player_id,r.away_player_screen_name,r.division_number,r.game_number,'home',r.course1_name,r.course1_difficulty,r.course1_home_hw,r.course1_away_hw,r.course2_name,r.course2_difficulty,r.course2_home_hw,r.course2_away_hw,r.home_total_hw,r.away_total_hw,
    case when r.home_total_hw>r.away_total_hw then 'W' when r.is_draw then 'D' else 'L' end from public.pyp_managed_results r where r.season_id=p_season_id and r.roster_version_id=v_roster.id
  union all
  select v_card.id,p_season_id,r.away_player_id,r.home_player_id,r.home_player_screen_name,r.division_number,r.game_number,'away',r.course1_name,r.course1_difficulty,r.course1_away_hw,r.course1_home_hw,r.course2_name,r.course2_difficulty,r.course2_away_hw,r.course2_home_hw,r.away_total_hw,r.home_total_hw,
    case when r.away_total_hw>r.home_total_hw then 'W' when r.is_draw then 'D' else 'L' end from public.pyp_managed_results r where r.season_id=p_season_id and r.roster_version_id=v_roster.id;
  update public.pyp_final_scorecards c set source_change_revision=v_state.change_revision,updated_at=now() where c.id=v_card.id returning c.* into v_card;
  select count(*)::integer into v_players from public.pyp_final_scorecard_entries e where e.scorecard_id=v_card.id;
  select count(*)::integer into v_total from public.schedule f where lower(btrim(f.league_type))='pyp' and f.season_id=p_season_id and f.pyp_roster_version_id=v_roster.id;
  select count(*)::integer into v_completed from public.pyp_managed_results r where r.season_id=p_season_id and r.roster_version_id=v_roster.id;
  return query select v_card.id,p_season_id,v_roster.id,v_card.status,v_players,v_completed,v_total,v_total-v_completed;
end;
$function$;

revoke all on function public.generate_pyp_final_scorecard(uuid) from public,anon,authenticated;
grant execute on function public.generate_pyp_final_scorecard(uuid) to authenticated;

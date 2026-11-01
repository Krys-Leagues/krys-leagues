create or replace function public.approve_match_final_scorecard(
  p_final_scorecard_id uuid,
  p_approval_note text default null
)
returns table(scorecard_id uuid,season_id uuid,roster_version_id uuid,status text,approved_at timestamptz,approved_by uuid)
language plpgsql security definer set search_path to '' as $function$
declare
  v_user_id uuid := auth.uid();
  v_scorecard public.match_final_scorecards%rowtype;
  v_roster public.match_roster_versions%rowtype;
  v_season public.seasons%rowtype;
  v_division integer;
  v_incomplete integer;
begin
  if not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required' using errcode='42501'; end if;
  if v_user_id is null then raise exception 'Authentication is required'; end if;
  if p_final_scorecard_id is null then raise exception 'Final Scorecard ID is required'; end if;

  select card.* into v_scorecard from public.match_final_scorecards card where card.id=p_final_scorecard_id;
  if not found then raise exception 'Match Final Scorecard was not found'; end if;
  select roster.* into v_roster from public.match_roster_versions roster
    where roster.id=v_scorecard.source_roster_version_id and roster.season_id=v_scorecard.season_id for update;
  if not found or v_roster.status<>'approved' then raise exception 'The source Match roster is no longer approved'; end if;
  select season.* into v_season from public.seasons season where season.id=v_scorecard.season_id for share;
  if not found or lower(btrim(v_season.league_type)) is distinct from 'match' then raise exception 'Parent season is not Match'; end if;
  perform 1 from public.match_schedule_state state where state.season_id=v_scorecard.season_id
    and state.change_revision=state.generated_revision and state.generated_revision=state.reviewed_revision and state.generated_revision>0 for update;
  if not found then raise exception 'The current Match schedule must be generated and reviewed first'; end if;
  select card.* into v_scorecard from public.match_final_scorecards card where card.id=p_final_scorecard_id for update;
  if v_scorecard.status<>'draft' then raise exception 'Only a draft Match Final Scorecard can be approved'; end if;

  select count(*)::integer into v_incomplete from public.schedule fixture
  where lower(btrim(fixture.league_type))='match' and fixture.season_id=v_scorecard.season_id
    and fixture.match_roster_version_id=v_roster.id
    and not exists(select 1 from public.results result where result.schedule_id=fixture.id
      and lower(btrim(result.league_type))='match' and result.player1_hw is not null and result.player2_hw is not null);
  if v_incomplete>0 then raise exception 'Final Scorecard cannot be approved: % managed fixture(s) are incomplete',v_incomplete; end if;

  for v_division in 1..v_roster.division_count loop
    perform 1 from public.rebuild_match_standings(v_scorecard.season_id,v_division);
  end loop;

  if exists(
    with roster_players as (
      select slot.player_id,slot.player_screen_name,slot.division_number from public.match_division_roster_slots slot
      where slot.roster_version_id=v_roster.id and slot.player_id is not null
    ), player_games as (
      select f.division_number,f.game_number,f.course,r.player1_id player_id,r.player1_hw hw,
        case when r.player1_hw>r.player2_hw then 'W' when r.player1_hw=r.player2_hw then 'D' else 'L' end outcome
      from public.schedule f join public.results r on r.schedule_id=f.id
      where lower(btrim(f.league_type))='match' and lower(btrim(r.league_type))='match'
        and f.season_id=v_scorecard.season_id and f.match_roster_version_id=v_roster.id and r.player1_hw is not null and r.player2_hw is not null
      union all
      select f.division_number,f.game_number,f.course,r.player2_id,r.player2_hw,
        case when r.player2_hw>r.player1_hw then 'W' when r.player2_hw=r.player1_hw then 'D' else 'L' end
      from public.schedule f join public.results r on r.schedule_id=f.id
      where lower(btrim(f.league_type))='match' and lower(btrim(r.league_type))='match'
        and f.season_id=v_scorecard.season_id and f.match_roster_version_id=v_roster.id and r.player1_hw is not null and r.player2_hw is not null
    ), expected as (
      select rp.player_id,rp.player_screen_name,rp.division_number,s.rank division_rank,
        count(pg.player_id)::integer completed_game_count,s.wins,s.losses,s.ties,s.points,s.strokes holes_won,
        max(pg.course) filter(where pg.game_number=1) game1_course,max(pg.outcome) filter(where pg.game_number=1) game1_outcome,max(pg.hw) filter(where pg.game_number=1) game1_hw,
        max(pg.course) filter(where pg.game_number=2) game2_course,max(pg.outcome) filter(where pg.game_number=2) game2_outcome,max(pg.hw) filter(where pg.game_number=2) game2_hw,
        max(pg.course) filter(where pg.game_number=3) game3_course,max(pg.outcome) filter(where pg.game_number=3) game3_outcome,max(pg.hw) filter(where pg.game_number=3) game3_hw
      from roster_players rp join public.season_standings s on s.player_id=rp.player_id and s.league_type='match' and s.season_number=v_season.season_number
      left join player_games pg on pg.player_id=rp.player_id and pg.division_number=rp.division_number
      group by rp.player_id,rp.player_screen_name,rp.division_number,s.rank,s.wins,s.losses,s.ties,s.points,s.strokes
    ), differences as (
      (select * from expected except select e.player_id,e.player_screen_name,e.division_number,e.division_rank,e.completed_game_count,e.wins,e.losses,e.ties,e.points,e.holes_won,e.game1_course,e.game1_outcome,e.game1_hw,e.game2_course,e.game2_outcome,e.game2_hw,e.game3_course,e.game3_outcome,e.game3_hw from public.match_final_scorecard_entries e where e.scorecard_id=v_scorecard.id)
      union all
      (select e.player_id,e.player_screen_name,e.division_number,e.division_rank,e.completed_game_count,e.wins,e.losses,e.ties,e.points,e.holes_won,e.game1_course,e.game1_outcome,e.game1_hw,e.game2_course,e.game2_outcome,e.game2_hw,e.game3_course,e.game3_outcome,e.game3_hw from public.match_final_scorecard_entries e where e.scorecard_id=v_scorecard.id except select * from expected)
    ) select 1 from differences limit 1
  ) then raise exception 'Final Scorecard is stale. Regenerate it before approval.'; end if;

  update public.match_final_scorecards card set status='approved',approved_at=now(),approved_by=v_user_id,
    approval_note=nullif(btrim(p_approval_note),''),updated_at=now() where card.id=v_scorecard.id returning card.* into v_scorecard;
  update public.match_roster_versions roster set status='locked',locked_at=now(),locked_by=v_user_id,updated_at=now()
    where roster.id=v_roster.id;
  return query select v_scorecard.id,v_scorecard.season_id,v_scorecard.source_roster_version_id,v_scorecard.status,v_scorecard.approved_at,v_scorecard.approved_by;
end;
$function$;

revoke all on function public.approve_match_final_scorecard(uuid,text) from public, anon, authenticated;
grant execute on function public.approve_match_final_scorecard(uuid,text) to authenticated;

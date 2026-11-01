create or replace function public.generate_match_final_scorecard(p_season_id uuid)
returns table(
  scorecard_id uuid, season_id uuid, roster_version_id uuid, status text,
  player_count integer, completed_fixture_count integer,
  total_fixture_count integer, incomplete_fixture_count integer
)
language plpgsql security definer set search_path to '' as $function$
declare
  v_user_id uuid := auth.uid();
  v_roster public.match_roster_versions%rowtype;
  v_season public.seasons%rowtype;
  v_scorecard public.match_final_scorecards%rowtype;
  v_division integer;
  v_player_count integer;
  v_completed integer;
  v_total integer;
begin
  if not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode = '42501';
  end if;
  if v_user_id is null then raise exception 'Authentication is required'; end if;
  if p_season_id is null then raise exception 'Season ID is required'; end if;

  select roster.* into v_roster from public.match_roster_versions as roster
  where roster.season_id = p_season_id and roster.status = 'approved'
  order by roster.created_at, roster.id limit 1 for update;
  if not found then raise exception 'Exactly one approved Match roster is required'; end if;
  if (select count(*) from public.match_roster_versions as roster where roster.season_id=p_season_id and roster.status='approved') <> 1
    then raise exception 'Exactly one approved Match roster is required'; end if;

  select season.* into v_season from public.seasons as season where season.id=p_season_id for share;
  if not found or lower(btrim(v_season.league_type)) is distinct from 'match'
    then raise exception 'Season is not a managed Match season'; end if;

  perform 1 from public.match_schedule_state as state
  where state.season_id=p_season_id and state.change_revision=state.generated_revision
    and state.generated_revision=state.reviewed_revision and state.generated_revision>0 for update;
  if not found then raise exception 'The current Match schedule must be generated and reviewed first'; end if;

  if exists(select 1 from public.match_final_scorecards as card where card.season_id=p_season_id and card.status='approved')
    then raise exception 'An approved Match Final Scorecard already exists'; end if;

  select card.* into v_scorecard from public.match_final_scorecards as card
  where card.season_id=p_season_id and card.status='draft' for update;
  if found and v_scorecard.source_roster_version_id <> v_roster.id
    then raise exception 'Existing draft belongs to a different roster version';
  elsif not found then
    insert into public.match_final_scorecards(season_id,source_roster_version_id,status)
    values(p_season_id,v_roster.id,'draft') returning * into v_scorecard;
  end if;

  for v_division in 1..v_roster.division_count loop
    perform 1 from public.rebuild_match_standings(p_season_id,v_division);
  end loop;

  delete from public.match_final_scorecard_entries as entry where entry.scorecard_id=v_scorecard.id;

  insert into public.match_final_scorecard_entries(
    scorecard_id,season_id,division_number,division_rank,player_id,player_screen_name,
    completed_game_count,wins,losses,ties,points,holes_won,
    game1_course,game1_outcome,game1_hw,game2_course,game2_outcome,game2_hw,
    game3_course,game3_outcome,game3_hw
  )
  with roster_players as (
    select slot.player_id,slot.player_screen_name,slot.division_number
    from public.match_division_roster_slots as slot
    where slot.roster_version_id=v_roster.id and slot.player_id is not null
  ), player_games as (
    select fixture.division_number,fixture.game_number,fixture.course,
      result.player1_id as player_id,result.player1_hw as hw,
      case when result.player1_hw>result.player2_hw then 'W' when result.player1_hw=result.player2_hw then 'D' else 'L' end as outcome
    from public.schedule as fixture join public.results as result on result.schedule_id=fixture.id
    where lower(btrim(fixture.league_type))='match' and lower(btrim(result.league_type))='match'
      and fixture.season_id=p_season_id and fixture.match_roster_version_id=v_roster.id
      and result.player1_hw is not null and result.player2_hw is not null
    union all
    select fixture.division_number,fixture.game_number,fixture.course,
      result.player2_id,result.player2_hw,
      case when result.player2_hw>result.player1_hw then 'W' when result.player2_hw=result.player1_hw then 'D' else 'L' end
    from public.schedule as fixture join public.results as result on result.schedule_id=fixture.id
    where lower(btrim(fixture.league_type))='match' and lower(btrim(result.league_type))='match'
      and fixture.season_id=p_season_id and fixture.match_roster_version_id=v_roster.id
      and result.player1_hw is not null and result.player2_hw is not null
  ), details as (
    select rp.player_id,rp.player_screen_name,rp.division_number,
      count(pg.player_id)::integer as played,
      max(pg.course) filter(where pg.game_number=1) as g1_course,
      max(pg.outcome) filter(where pg.game_number=1) as g1_outcome,
      max(pg.hw) filter(where pg.game_number=1) as g1_hw,
      max(pg.course) filter(where pg.game_number=2) as g2_course,
      max(pg.outcome) filter(where pg.game_number=2) as g2_outcome,
      max(pg.hw) filter(where pg.game_number=2) as g2_hw,
      max(pg.course) filter(where pg.game_number=3) as g3_course,
      max(pg.outcome) filter(where pg.game_number=3) as g3_outcome,
      max(pg.hw) filter(where pg.game_number=3) as g3_hw
    from roster_players rp left join player_games pg
      on pg.player_id=rp.player_id and pg.division_number=rp.division_number
    group by rp.player_id,rp.player_screen_name,rp.division_number
  )
  select v_scorecard.id,p_season_id,d.division_number,s.rank,d.player_id,d.player_screen_name,
    d.played,s.wins,s.losses,s.ties,s.points,s.strokes,
    d.g1_course,d.g1_outcome,d.g1_hw,d.g2_course,d.g2_outcome,d.g2_hw,
    d.g3_course,d.g3_outcome,d.g3_hw
  from details d join public.season_standings s
    on s.player_id=d.player_id and s.league_type='match' and s.season_number=v_season.season_number;

  update public.match_final_scorecards as card set updated_at=now() where card.id=v_scorecard.id returning card.* into v_scorecard;
  select count(*)::integer into v_player_count from public.match_final_scorecard_entries e where e.scorecard_id=v_scorecard.id;
  select count(*)::integer into v_total from public.schedule f where lower(btrim(f.league_type))='match' and f.season_id=p_season_id and f.match_roster_version_id=v_roster.id;
  select count(*)::integer into v_completed from public.schedule f where lower(btrim(f.league_type))='match' and f.season_id=p_season_id and f.match_roster_version_id=v_roster.id
    and exists(select 1 from public.results r where r.schedule_id=f.id and lower(btrim(r.league_type))='match' and r.player1_hw is not null and r.player2_hw is not null);
  return query select v_scorecard.id,p_season_id,v_roster.id,v_scorecard.status,v_player_count,v_completed,v_total,v_total-v_completed;
end;
$function$;

revoke all on function public.generate_match_final_scorecard(uuid) from public, anon, authenticated;
grant execute on function public.generate_match_final_scorecard(uuid) to authenticated;

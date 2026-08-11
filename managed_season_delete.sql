begin;

create or replace function public.preview_managed_season_deletion(p_season_id uuid)
returns table(
  season_id uuid,
  league_type text,
  season_number integer,
  division_count integer,
  roster_version_count integer,
  roster_slot_count integer,
  schedule_count integer,
  result_count integer,
  standings_count integer,
  transition_count integer,
  final_scorecard_count integer,
  other_season_row_count integer,
  deletion_allowed boolean,
  blocking_reason text
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_season public.seasons%rowtype;
  v_league text;
  v_locked_rosters integer := 0;
  v_approved_cards integer := 0;
  v_same_number_seasons integer := 0;
  v_unlinked_results integer := 0;
  v_membership_count integer := 0;
begin
  if not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required';
  end if;
  if p_season_id is null then raise exception 'Season ID is required'; end if;

  select season.* into v_season from public.seasons as season where season.id = p_season_id;
  if not found then raise exception 'Season was not found'; end if;
  v_league := lower(btrim(v_season.league_type));
  if v_league not in ('stroke', 'match', 'pyp') then
    raise exception 'Only managed Stroke, Match, and PYP seasons support permanent deletion';
  end if;

  select count(*)::integer into v_same_number_seasons
  from public.seasons as other
  where lower(btrim(other.league_type)) is not distinct from v_league
    and other.season_number = v_season.season_number;

  if v_league = 'stroke' then
    select coalesce(max(roster.division_count), 0)::integer, count(*)::integer,
      count(*) filter (where roster.status = 'locked')::integer
    into division_count, roster_version_count, v_locked_rosters
    from public.stroke_roster_versions as roster where roster.season_id = p_season_id;
    select count(*)::integer into roster_slot_count from public.stroke_division_roster_slots as slot where slot.season_id = p_season_id;
    select count(*)::integer into final_scorecard_count from public.stroke_final_scorecards as card where card.season_id = p_season_id;
    select count(*)::integer into v_approved_cards from public.stroke_final_scorecards as card where card.season_id = p_season_id and card.status = 'approved';
    select count(*)::integer into transition_count from public.stroke_final_scorecard_player_decisions as decision join public.stroke_final_scorecards as card on card.id = decision.final_scorecard_id where card.season_id = p_season_id;
    select ((select count(*) from public.stroke_division_course_overrides as override_row where override_row.season_id = p_season_id) + (select count(*) from public.stroke_schedule_state as state where state.season_id = p_season_id))::integer into other_season_row_count;
  elsif v_league = 'match' then
    select coalesce(max(roster.division_count), 0)::integer, count(*)::integer,
      count(*) filter (where roster.status = 'locked')::integer
    into division_count, roster_version_count, v_locked_rosters
    from public.match_roster_versions as roster where roster.season_id = p_season_id;
    select count(*)::integer into roster_slot_count from public.match_division_roster_slots as slot where slot.season_id = p_season_id;
    select count(*)::integer into final_scorecard_count from public.match_final_scorecards as card where card.season_id = p_season_id;
    select count(*)::integer into v_approved_cards from public.match_final_scorecards as card where card.season_id = p_season_id and card.status = 'approved';
    select count(*)::integer into transition_count from public.match_final_scorecard_player_decisions as decision join public.match_final_scorecards as card on card.id = decision.final_scorecard_id where card.season_id = p_season_id;
    select ((select count(*) from public.match_division_course_overrides as override_row where override_row.season_id = p_season_id) + (select count(*) from public.match_schedule_state as state where state.season_id = p_season_id))::integer into other_season_row_count;
  else
    select coalesce(max(roster.division_count), 0)::integer, count(*)::integer,
      count(*) filter (where roster.status = 'locked')::integer
    into division_count, roster_version_count, v_locked_rosters
    from public.pyp_roster_versions as roster where roster.season_id = p_season_id;
    select count(*)::integer into roster_slot_count from public.pyp_division_roster_slots as slot where slot.season_id = p_season_id;
    select count(*)::integer into final_scorecard_count from public.pyp_final_scorecards as card where card.season_id = p_season_id;
    select count(*)::integer into v_approved_cards from public.pyp_final_scorecards as card where card.season_id = p_season_id and card.status = 'approved';
    select count(*)::integer into transition_count from public.pyp_final_scorecard_player_decisions as decision join public.pyp_final_scorecards as card on card.id = decision.final_scorecard_id where card.season_id = p_season_id;
    select ((select count(*) from public.pyp_schedule_state as state where state.season_id = p_season_id) + (select count(*) from public.pyp_managed_results as managed_result where managed_result.season_id = p_season_id) + (select count(*) from public.pyp_final_scorecard_fixture_details as detail where detail.season_id = p_season_id))::integer into other_season_row_count;
  end if;

  select count(*)::integer into schedule_count from public.schedule as fixture where fixture.season_id = p_season_id;
  select count(*)::integer into result_count from public.results as result join public.schedule as fixture on fixture.id = result.schedule_id where fixture.season_id = p_season_id;
  select count(*)::integer into standings_count from public.season_standings as standing where lower(btrim(standing.league_type)) is not distinct from v_league and standing.season_number = v_season.season_number;
  select count(*)::integer into v_unlinked_results
  from public.results as result
  where lower(btrim(result.league_type)) is not distinct from v_league
    and result.season_number = v_season.season_number
    and result.schedule_id is null;
  select count(*)::integer into v_membership_count
  from public.player_league_memberships as membership
  where lower(btrim(membership.league_type)) is not distinct from v_league
    and membership.season_number = v_season.season_number;
  other_season_row_count := other_season_row_count + v_membership_count;

  season_id := v_season.id;
  league_type := v_league;
  season_number := v_season.season_number;
  deletion_allowed := not coalesce(v_season.is_locked, false) and v_locked_rosters = 0 and v_approved_cards = 0 and v_same_number_seasons = 1 and v_unlinked_results = 0;
  blocking_reason := case
    when v_season.is_locked then 'This season is locked historical data and cannot be deleted.'
    when v_locked_rosters > 0 then 'A locked historical roster exists for this season and cannot be deleted.'
    when v_approved_cards > 0 then 'An approved Final Scorecard exists for this season and cannot be deleted.'
    when v_same_number_seasons <> 1 then 'The league and season number are not unique, so season-number-scoped standings cannot be deleted safely.'
    when v_unlinked_results > 0 then 'Legacy results without a managed schedule link share this league and season number; review them before deletion.'
    else null
  end;
  return next;
end;
$function$;

create or replace function public.delete_managed_season(p_season_id uuid)
returns table(season_id uuid, league_type text, season_number integer, deleted boolean)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_season public.seasons%rowtype;
  v_league text;
  v_preview record;
begin
  if not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required';
  end if;
  if p_season_id is null then raise exception 'Season ID is required'; end if;

  select season.* into v_season from public.seasons as season where season.id = p_season_id for update;
  if not found then raise exception 'Season was not found'; end if;
  v_league := lower(btrim(v_season.league_type));

  if v_league = 'stroke' then
    perform 1 from public.stroke_roster_versions as roster where roster.season_id = p_season_id for update;
    perform 1 from public.stroke_final_scorecards as card where card.season_id = p_season_id for update;
  elsif v_league = 'match' then
    perform 1 from public.match_roster_versions as roster where roster.season_id = p_season_id for update;
    perform 1 from public.match_final_scorecards as card where card.season_id = p_season_id for update;
  elsif v_league = 'pyp' then
    perform 1 from public.pyp_roster_versions as roster where roster.season_id = p_season_id for update;
    perform 1 from public.pyp_final_scorecards as card where card.season_id = p_season_id for update;
  else
    raise exception 'Only managed Stroke, Match, and PYP seasons support permanent deletion';
  end if;
  perform 1 from public.schedule as fixture where fixture.season_id = p_season_id for update;

  select * into v_preview from public.preview_managed_season_deletion(p_season_id);
  if not v_preview.deletion_allowed then raise exception '%', v_preview.blocking_reason; end if;

  if v_league = 'stroke' then
    delete from public.stroke_final_scorecard_player_decisions as decision using public.stroke_final_scorecards as card where decision.final_scorecard_id = card.id and card.season_id = p_season_id;
    delete from public.stroke_final_scorecard_entries as entry where entry.season_id = p_season_id;
    delete from public.stroke_final_scorecards as card where card.season_id = p_season_id;
  elsif v_league = 'match' then
    delete from public.match_final_scorecard_player_decisions as decision using public.match_final_scorecards as card where decision.final_scorecard_id = card.id and card.season_id = p_season_id;
    delete from public.match_final_scorecard_entries as entry where entry.season_id = p_season_id;
    delete from public.match_final_scorecards as card where card.season_id = p_season_id;
  else
    delete from public.pyp_final_scorecard_player_decisions as decision using public.pyp_final_scorecards as card where decision.final_scorecard_id = card.id and card.season_id = p_season_id;
    delete from public.pyp_final_scorecard_fixture_details as detail where detail.season_id = p_season_id;
    delete from public.pyp_final_scorecard_entries as entry where entry.season_id = p_season_id;
    delete from public.pyp_final_scorecards as card where card.season_id = p_season_id;
    delete from public.pyp_managed_results as managed_result where managed_result.season_id = p_season_id;
  end if;

  delete from public.results as result using public.schedule as fixture where result.schedule_id = fixture.id and fixture.season_id = p_season_id;
  delete from public.schedule as fixture where fixture.season_id = p_season_id;
  delete from public.season_standings as standing where lower(btrim(standing.league_type)) is not distinct from v_league and standing.season_number = v_season.season_number;
  delete from public.player_league_memberships as membership where lower(btrim(membership.league_type)) is not distinct from v_league and membership.season_number = v_season.season_number;

  if v_league = 'stroke' then
    delete from public.stroke_division_course_overrides as override_row where override_row.season_id = p_season_id;
    delete from public.stroke_schedule_state as state where state.season_id = p_season_id;
    delete from public.stroke_division_roster_slots as slot where slot.season_id = p_season_id;
    delete from public.stroke_roster_versions as roster where roster.season_id = p_season_id;
  elsif v_league = 'match' then
    delete from public.match_division_course_overrides as override_row where override_row.season_id = p_season_id;
    delete from public.match_schedule_state as state where state.season_id = p_season_id;
    delete from public.match_division_roster_slots as slot where slot.season_id = p_season_id;
    delete from public.match_roster_versions as roster where roster.season_id = p_season_id;
  else
    delete from public.pyp_schedule_state as state where state.season_id = p_season_id;
    delete from public.pyp_division_roster_slots as slot where slot.season_id = p_season_id;
    delete from public.pyp_roster_versions as roster where roster.season_id = p_season_id;
  end if;

  delete from public.seasons as season where season.id = p_season_id;
  season_id := v_season.id; league_type := v_league; season_number := v_season.season_number; deleted := true;
  return next;
end;
$function$;

revoke all on function public.preview_managed_season_deletion(uuid) from public, anon, authenticated;
grant execute on function public.preview_managed_season_deletion(uuid) to authenticated;
revoke all on function public.delete_managed_season(uuid) from public, anon, authenticated;
grant execute on function public.delete_managed_season(uuid) to authenticated;

commit;

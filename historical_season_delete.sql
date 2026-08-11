begin;

create or replace function public.preview_historical_season_deletion(p_season_id uuid)
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
  membership_count integer,
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
  v_preview record;
  v_league text;
  v_same_number_rows integer := 0;
  v_unlinked_results integer := 0;
  v_unlinked_schedules integer := 0;
  v_number_only_history integer := 0;
  v_downstream_rosters integer := 0;
  v_unknown_history_schema boolean := false;
begin
  if not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required';
  end if;
  if p_season_id is null then raise exception 'Season ID is required'; end if;

  select source.* into v_season
  from public.seasons as source
  where source.id = p_season_id;
  if not found then raise exception 'Season was not found'; end if;

  v_league := lower(btrim(v_season.league_type));
  if v_league not in ('stroke', 'match', 'pyp') then
    raise exception 'Only Stroke, Match, and PYP historical seasons are supported';
  end if;

  select * into v_preview
  from public.preview_managed_season_deletion(p_season_id);

  select count(*)::integer into v_same_number_rows
  from public.seasons as candidate
  where lower(btrim(candidate.league_type)) is not distinct from v_league
    and candidate.season_number = v_season.season_number;

  select count(*)::integer into v_unlinked_results
  from public.results as result
  where lower(btrim(result.league_type)) is not distinct from v_league
    and result.season_number = v_season.season_number
    and result.schedule_id is null;

  select count(*)::integer into v_unlinked_schedules
  from public.schedule as fixture
  where lower(btrim(fixture.league_type)) is not distinct from v_league
    and fixture.season_number = v_season.season_number
    and fixture.season_id is null;

  if to_regclass('public.historical_league_results') is not null then
    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='historical_league_results' and column_name='league_type')
       and exists (select 1 from information_schema.columns where table_schema='public' and table_name='historical_league_results' and column_name='season_number') then
      execute 'select count(*)::integer from public.historical_league_results where lower(btrim(league_type)) is not distinct from $1 and season_number = $2'
        into v_number_only_history using v_league, v_season.season_number;
    else
      v_unknown_history_schema := true;
    end if;
  end if;

  if to_regclass('public.matches') is not null
     and exists (select 1 from information_schema.columns where table_schema='public' and table_name='matches' and column_name='league_type')
     and exists (select 1 from information_schema.columns where table_schema='public' and table_name='matches' and column_name='season_number') then
    execute 'select $1 + count(*)::integer from public.matches where lower(btrim(league_type)) is not distinct from $2 and season_number = $3'
      into v_number_only_history using v_number_only_history, v_league, v_season.season_number;
  end if;

  if v_league = 'stroke' then
    select count(*)::integer into v_downstream_rosters
    from public.stroke_roster_versions as roster
    where roster.season_id <> p_season_id
      and roster.source_final_scorecard_id in (select card.id from public.stroke_final_scorecards as card where card.season_id = p_season_id);
  elsif v_league = 'match' then
    select count(*)::integer into v_downstream_rosters
    from public.match_roster_versions as roster
    where roster.season_id <> p_season_id
      and roster.source_final_scorecard_id in (select card.id from public.match_final_scorecards as card where card.season_id = p_season_id);
  else
    select count(*)::integer into v_downstream_rosters
    from public.pyp_roster_versions as roster
    where roster.season_id <> p_season_id
      and roster.source_final_scorecard_id in (select card.id from public.pyp_final_scorecards as card where card.season_id = p_season_id);
  end if;

  season_id := v_preview.season_id;
  league_type := v_preview.league_type;
  season_number := v_preview.season_number;
  division_count := v_preview.division_count;
  roster_version_count := v_preview.roster_version_count;
  roster_slot_count := v_preview.roster_slot_count;
  schedule_count := v_preview.schedule_count;
  result_count := v_preview.result_count;
  standings_count := v_preview.standings_count;
  select count(*)::integer into membership_count
  from public.player_league_memberships as membership
  where lower(btrim(membership.league_type)) is not distinct from v_league
    and membership.season_number = v_season.season_number;
  transition_count := v_preview.transition_count;
  final_scorecard_count := v_preview.final_scorecard_count;
  other_season_row_count := v_preview.other_season_row_count + v_unlinked_results + v_unlinked_schedules + v_number_only_history;
  deletion_allowed := v_season.division is null
    and v_same_number_rows = 1
    and v_unlinked_results = 0
    and v_unlinked_schedules = 0
    and v_number_only_history = 0
    and v_downstream_rosters = 0
    and not v_unknown_history_schema;
  blocking_reason := case
    when v_season.division is not null then 'BLOCK — historical ownership is ambiguous because this is a legacy division season row.'
    when v_same_number_rows <> 1 then 'BLOCK — historical ownership is ambiguous because multiple season rows share this league and season number.'
    when v_unlinked_results > 0 then 'BLOCK — historical ownership is ambiguous because number-only results are not linked to this season UUID.'
    when v_unlinked_schedules > 0 then 'BLOCK — historical ownership is ambiguous because number-only schedules are not linked to this season UUID.'
    when v_number_only_history > 0 then 'BLOCK — historical ownership is ambiguous because legacy historical rows do not carry this season UUID.'
    when v_downstream_rosters > 0 then 'BLOCK — a later managed roster depends on this season Final Scorecard.'
    when v_unknown_history_schema then 'BLOCK — historical ownership is ambiguous because the live historical table schema cannot be classified safely.'
    else null
  end;
  return next;
end;
$function$;

create or replace function public.delete_historical_season(p_season_id uuid)
returns table(season_id uuid, league_type text, season_number integer, deleted boolean)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_season public.seasons%rowtype;
  v_preview record;
  v_league text;
begin
  if not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required';
  end if;
  if p_season_id is null then raise exception 'Season ID is required'; end if;

  select source.* into v_season
  from public.seasons as source
  where source.id = p_season_id
  for update;
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
    raise exception 'Only Stroke, Match, and PYP historical seasons are supported';
  end if;
  perform 1 from public.schedule as fixture where fixture.season_id = p_season_id for update;

  select * into v_preview from public.preview_historical_season_deletion(p_season_id);
  if not v_preview.deletion_allowed then raise exception '%', v_preview.blocking_reason; end if;

  -- The approved-data triggers remain protective for every ordinary write. This
  -- explicit admin purge changes status only inside the same delete transaction;
  -- any failure rolls the status changes and all deletions back together.
  update public.seasons as source set is_locked = false where source.id = p_season_id;
  if v_league = 'stroke' then
    update public.stroke_final_scorecards as card set status = 'cancelled' where card.season_id = p_season_id and card.status = 'approved';
    update public.stroke_roster_versions as roster set status = 'cancelled' where roster.season_id = p_season_id and roster.status = 'locked';
  elsif v_league = 'match' then
    update public.match_final_scorecards as card set status = 'cancelled' where card.season_id = p_season_id and card.status = 'approved';
    update public.match_roster_versions as roster set status = 'cancelled' where roster.season_id = p_season_id and roster.status = 'locked';
  else
    update public.pyp_final_scorecards as card set status = 'cancelled' where card.season_id = p_season_id and card.status = 'approved';
    update public.pyp_roster_versions as roster set status = 'cancelled' where roster.season_id = p_season_id and roster.status = 'locked';
  end if;

  return query select result.season_id, result.league_type, result.season_number, result.deleted
  from public.delete_managed_season(p_season_id) as result;
end;
$function$;

revoke all on function public.preview_historical_season_deletion(uuid) from public, anon, authenticated;
grant execute on function public.preview_historical_season_deletion(uuid) to authenticated;
revoke all on function public.delete_historical_season(uuid) from public, anon, authenticated;
grant execute on function public.delete_historical_season(uuid) to authenticated;

commit;

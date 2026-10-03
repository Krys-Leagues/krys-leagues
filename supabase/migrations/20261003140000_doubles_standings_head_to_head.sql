-- Current-generation Doubles standings use actual head-to-head wins as the
-- second tiebreaker, limited to teams tied on points in the same division.
create or replace function public.rebuild_doubles_standings(p_season_id uuid, p_division text)
returns integer
language plpgsql security definer set search_path to '' as $function$
declare v_count integer;
begin
  if auth.uid() is null or not public.is_current_user_site_admin() then
    raise exception 'Site-admin authorization is required' using errcode='42501';
  end if;

  delete from public.doubles_managed_standings
  where season_id=p_season_id and division=p_division;

  insert into public.doubles_managed_standings(
    season_id, division, season_team_id, team_name_snapshot, played,
    wins, losses, ties, points, season_holes_won, head_to_head_wins, rank
  )
  with team_stats_base as (
    select
      t.id,
      t.team_name_snapshot,
      count(r.id)::integer as played,
      count(*) filter (where
        (f.home_season_team_id=t.id and r.outcome='HOME_WIN') or
        (f.away_season_team_id=t.id and r.outcome='AWAY_WIN')
      )::integer as wins,
      count(*) filter (where
        (f.home_season_team_id=t.id and r.outcome='AWAY_WIN') or
        (f.away_season_team_id=t.id and r.outcome='HOME_WIN')
      )::integer as losses,
      count(*) filter (where r.outcome='DRAW')::integer as ties,
      coalesce(sum(case when f.home_season_team_id=t.id then r.home_points else r.away_points end),0)::integer as points,
      coalesce(sum(case when f.home_season_team_id=t.id then r.home_holes_won else r.away_holes_won end),0)::integer as season_holes_won
    from public.doubles_managed_season_teams t
    left join public.doubles_managed_fixtures f
      on (f.home_season_team_id=t.id or f.away_season_team_id=t.id)
      and f.status='COMPLETED'
    left join public.doubles_managed_results r on r.fixture_id=f.id
    where t.season_id=p_season_id
      and t.division=p_division
      and t.status='ACTIVE'
    group by t.id,t.team_name_snapshot
  ), team_stats as (
    select
      t.*,
      coalesce((
        select count(*)::integer
        from public.doubles_managed_fixtures f
        join public.doubles_managed_results r on r.fixture_id=f.id
        join team_stats_base opponent on opponent.id = case
          when f.home_season_team_id=t.id then f.away_season_team_id
          else f.home_season_team_id
        end
        where (f.home_season_team_id=t.id or f.away_season_team_id=t.id)
          and f.status='COMPLETED'
          and opponent.points=t.points
          and (
            (f.home_season_team_id=t.id and r.outcome='HOME_WIN') or
            (f.away_season_team_id=t.id and r.outcome='AWAY_WIN')
          )
      ),0)::integer as head_to_head_wins
    from team_stats_base t
  ), ranked as (
    select *, rank() over(
      order by points desc, head_to_head_wins desc,
        season_holes_won desc, team_name_snapshot, id
    )::integer as calculated_rank
    from team_stats
  )
  select
    p_season_id, p_division, id, team_name_snapshot, played, wins, losses,
    ties, points, season_holes_won, head_to_head_wins, calculated_rank
  from ranked;

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

revoke all on function public.rebuild_doubles_standings(uuid,text) from public, anon, authenticated;
grant execute on function public.rebuild_doubles_standings(uuid,text) to authenticated;

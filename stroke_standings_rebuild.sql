create or replace function public.rebuild_stroke_standings(
  p_season_id uuid,
  p_division_number integer
)
returns table(
  season_id uuid,
  roster_version_id uuid,
  division_number integer,
  rostered_player_count integer,
  completed_fixture_count integer
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid;
  v_roster public.stroke_roster_versions%rowtype;
  v_season public.seasons%rowtype;
  v_approved_roster_count integer;
  v_rostered_player_count integer;
  v_completed_fixture_count integer;
  v_division text;
  v_standing record;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception
      'Authentication is required to rebuild Stroke standings'
      using errcode = '42501';
  end if;

  if p_season_id is null then
    raise exception 'Season ID is required';
  end if;

  if p_division_number is null or p_division_number <= 0 then
    raise exception 'Division number must be a positive integer';
  end if;

  select roster.*
  into v_roster
  from public.stroke_roster_versions as roster
  where roster.season_id = p_season_id
    and roster.status = 'approved'
  order by roster.created_at, roster.id
  limit 1
  for update;

  if not found then
    if exists (
      select 1
      from public.stroke_roster_versions as locked_roster
      where locked_roster.season_id = p_season_id
        and locked_roster.status = 'locked'
    ) then
      raise exception
        'A locked historical Stroke roster cannot have live standings rebuilt'
        using errcode = '42501';
    end if;

    raise exception 'Exactly one approved Stroke roster is required';
  end if;

  select count(*)::integer
  into v_approved_roster_count
  from public.stroke_roster_versions as roster
  where roster.season_id = p_season_id
    and roster.status = 'approved';

  if v_approved_roster_count <> 1 then
    raise exception
      'Exactly one approved Stroke roster is required; found %',
      v_approved_roster_count;
  end if;

  if exists (
    select 1
    from public.stroke_roster_versions as locked_roster
    where locked_roster.season_id = p_season_id
      and locked_roster.status = 'locked'
  ) then
    raise exception
      'A locked historical Stroke roster exists for this season; live standings rebuild is not allowed'
      using errcode = '42501';
  end if;

  select season.*
  into v_season
  from public.seasons as season
  where season.id = p_season_id
  for share;

  if not found then
    raise exception 'Season % was not found', p_season_id;
  end if;

  if lower(btrim(v_season.league_type)) is distinct from 'stroke' then
    raise exception 'Season % is not a Stroke season', p_season_id;
  end if;

  if p_division_number > v_roster.division_count then
    raise exception
      'Division % is outside the valid range 1..%',
      p_division_number,
      v_roster.division_count;
  end if;

  perform 1
  from public.stroke_schedule_state as schedule_state
  where schedule_state.season_id = p_season_id
    and schedule_state.change_revision = schedule_state.generated_revision
    and schedule_state.generated_revision = schedule_state.reviewed_revision
    and schedule_state.generated_revision > 0
  for update;

  if not found then
    raise exception
      'Stroke standings can be rebuilt only after the current schedule has been generated and reviewed';
  end if;

  perform 1
  from public.stroke_division_roster_slots as roster_slot
  where roster_slot.roster_version_id = v_roster.id
    and roster_slot.division_number = p_division_number
  order by roster_slot.slot_number
  for share;

  if exists (
    select 1
    from public.stroke_division_roster_slots as roster_slot
    where roster_slot.roster_version_id = v_roster.id
      and roster_slot.division_number = p_division_number
      and roster_slot.player_id is not null
      and (
        roster_slot.player_screen_name is null
        or btrim(roster_slot.player_screen_name) = ''
      )
  ) then
    raise exception
      'Every populated Stroke roster slot must have a screen-name snapshot';
  end if;

  if exists (
    select 1
    from public.results as result_row
    join public.schedule as scheduled_fixture
      on scheduled_fixture.id = result_row.schedule_id
    where lower(btrim(result_row.league_type)) = 'stroke'
      and lower(btrim(scheduled_fixture.league_type)) = 'stroke'
      and scheduled_fixture.season_id = p_season_id
      and scheduled_fixture.roster_version_id = v_roster.id
      and scheduled_fixture.division_number = p_division_number
      and result_row.player1_score is not null
      and result_row.player2_score is not null
      and (
        result_row.player1_id is null
        or result_row.player2_id is null
        or result_row.player1_id <> scheduled_fixture.player1_id
        or result_row.player2_id <> scheduled_fixture.player2_id
        or not exists (
          select 1
          from public.stroke_division_roster_slots as player1_slot
          where player1_slot.roster_version_id = v_roster.id
            and player1_slot.division_number = p_division_number
            and player1_slot.player_id = result_row.player1_id
        )
        or not exists (
          select 1
          from public.stroke_division_roster_slots as player2_slot
          where player2_slot.roster_version_id = v_roster.id
            and player2_slot.division_number = p_division_number
            and player2_slot.player_id = result_row.player2_id
        )
      )
  ) then
    raise exception
      'A managed completed Stroke result does not match the approved roster or its schedule fixture';
  end if;

  v_division := 'Stroke D' || p_division_number::text;

  select count(*)::integer
  into v_rostered_player_count
  from public.stroke_division_roster_slots as roster_slot
  where roster_slot.roster_version_id = v_roster.id
    and roster_slot.division_number = p_division_number
    and roster_slot.player_id is not null;

  select count(*)::integer
  into v_completed_fixture_count
  from public.results as result_row
  join public.schedule as scheduled_fixture
    on scheduled_fixture.id = result_row.schedule_id
  where lower(btrim(result_row.league_type)) = 'stroke'
    and lower(btrim(scheduled_fixture.league_type)) = 'stroke'
    and scheduled_fixture.season_id = p_season_id
    and scheduled_fixture.roster_version_id = v_roster.id
    and scheduled_fixture.division_number = p_division_number
    and result_row.player1_id is not null
    and result_row.player2_id is not null
    and result_row.player1_score is not null
    and result_row.player2_score is not null;

  perform 1
  from public.season_standings as standing
  where standing.league_type = 'stroke'
    and standing.season_number = v_season.season_number
    and (
      standing.division = v_division
      or standing.player_id in (
        select roster_slot.player_id
        from public.stroke_division_roster_slots as roster_slot
        where roster_slot.roster_version_id = v_roster.id
          and roster_slot.division_number = p_division_number
          and roster_slot.player_id is not null
      )
    )
  for update;

  delete from public.season_standings as standing
  where standing.league_type = 'stroke'
    and standing.season_number = v_season.season_number
    and standing.division = v_division
    and not exists (
      select 1
      from public.stroke_division_roster_slots as roster_slot
      where roster_slot.roster_version_id = v_roster.id
        and roster_slot.division_number = p_division_number
        and roster_slot.player_id = standing.player_id
    );

  for v_standing in
    with roster_players as (
      select
        roster_slot.player_id,
        roster_slot.player_screen_name
      from public.stroke_division_roster_slots as roster_slot
      where roster_slot.roster_version_id = v_roster.id
        and roster_slot.division_number = p_division_number
        and roster_slot.player_id is not null
    ),
    completed_results as (
      select
        result_row.player1_id,
        result_row.player2_id,
        result_row.player1_score,
        result_row.player2_score
      from public.results as result_row
      join public.schedule as scheduled_fixture
        on scheduled_fixture.id = result_row.schedule_id
      where lower(btrim(result_row.league_type)) = 'stroke'
        and lower(btrim(scheduled_fixture.league_type)) = 'stroke'
        and scheduled_fixture.season_id = p_season_id
        and scheduled_fixture.roster_version_id = v_roster.id
        and scheduled_fixture.division_number = p_division_number
        and result_row.player1_id is not null
        and result_row.player2_id is not null
        and result_row.player1_score is not null
        and result_row.player2_score is not null
    ),
    contributions as (
      select
        completed_result.player1_id as player_id,
        case when completed_result.player1_score < completed_result.player2_score then 1 else 0 end as wins,
        case when completed_result.player1_score > completed_result.player2_score then 1 else 0 end as losses,
        case when completed_result.player1_score = completed_result.player2_score then 1 else 0 end as ties,
        completed_result.player1_score as strokes
      from completed_results as completed_result

      union all

      select
        completed_result.player2_id as player_id,
        case when completed_result.player2_score < completed_result.player1_score then 1 else 0 end as wins,
        case when completed_result.player2_score > completed_result.player1_score then 1 else 0 end as losses,
        case when completed_result.player2_score = completed_result.player1_score then 1 else 0 end as ties,
        completed_result.player2_score as strokes
      from completed_results as completed_result
    ),
    totals as (
      select
        roster_player.player_id,
        roster_player.player_screen_name,
        coalesce(sum(contribution.wins), 0)::integer as wins,
        coalesce(sum(contribution.losses), 0)::integer as losses,
        coalesce(sum(contribution.ties), 0)::integer as ties,
        coalesce(sum(contribution.strokes), 0)::integer as strokes
      from roster_players as roster_player
      left join contributions as contribution
        on contribution.player_id = roster_player.player_id
      group by roster_player.player_id, roster_player.player_screen_name
    )
    select
      total.player_id,
      total.wins,
      total.losses,
      total.ties,
      total.wins * 3 + total.ties as points,
      total.strokes,
      row_number() over (
        order by
          total.wins * 3 + total.ties desc,
          total.wins desc,
          total.strokes asc,
          total.player_screen_name asc
      )::integer as rank
    from totals as total
  loop
    insert into public.season_standings (
      player_id,
      league_type,
      season_number,
      division,
      points,
      wins,
      losses,
      ties,
      strokes,
      rank,
      updated_at
    )
    values (
      v_standing.player_id,
      'stroke',
      v_season.season_number,
      v_division,
      v_standing.points,
      v_standing.wins,
      v_standing.losses,
      v_standing.ties,
      v_standing.strokes,
      v_standing.rank,
      now()
    )
    on conflict (player_id, league_type, season_number)
    do update set
      division = excluded.division,
      points = excluded.points,
      wins = excluded.wins,
      losses = excluded.losses,
      ties = excluded.ties,
      strokes = excluded.strokes,
      rank = excluded.rank,
      updated_at = excluded.updated_at;
  end loop;

  return query
  select
    p_season_id,
    v_roster.id,
    p_division_number,
    v_rostered_player_count,
    v_completed_fixture_count;
end;
$function$;

revoke all on function public.rebuild_stroke_standings(uuid, integer)
from public;

revoke all on function public.rebuild_stroke_standings(uuid, integer)
from anon;

revoke all on function public.rebuild_stroke_standings(uuid, integer)
from authenticated;

grant execute on function public.rebuild_stroke_standings(uuid, integer)
to authenticated;

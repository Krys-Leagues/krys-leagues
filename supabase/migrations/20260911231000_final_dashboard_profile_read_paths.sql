-- Final compatibility boundary for the dashboard and public player profiles.
-- This migration exposes bounded JSON contracts instead of direct table access.

create or replace function public.get_current_user_dashboard_data()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_player_id uuid;
  v_identity_ids uuid[];
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  v_player_id := public.current_user_canonical_player_id();

  if v_player_id is null then
    return jsonb_build_object(
      'player', null,
      'identityIds', '[]'::jsonb,
      'memberships', '[]'::jsonb,
      'schedule', '[]'::jsonb,
      'results', '[]'::jsonb
    );
  end if;

  select coalesce(
    array_agg(identity_player.player_id order by identity_player.player_id),
    array[v_player_id]::uuid[]
  )
  into v_identity_ids
  from public.get_canonical_player_identity_ids(v_player_id) as identity_player;

  return jsonb_build_object(
    'player', (
      select jsonb_build_object(
        'id', player.id,
        'screen_name', player.screen_name,
        'status', player.status,
        'active', player.active
      )
      from public.players as player
      where player.id = v_player_id
    ),
    'identityIds', to_jsonb(v_identity_ids),
    'memberships', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', membership.id,
          'player_id', membership.player_id,
          'league_type', membership.league_type,
          'division', membership.division,
          'season_number', membership.season_number
        )
        order by membership.season_number desc, membership.league_type, membership.division
      )
      from public.player_league_memberships as membership
      where membership.player_id = any(v_identity_ids)
    ), '[]'::jsonb),
    'schedule', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', scheduled_match.id,
          'league_type', scheduled_match.league_type,
          'division', scheduled_match.division,
          'season_number', scheduled_match.season_number,
          'game', scheduled_match.game,
          'course', scheduled_match.course,
          'player1_id', scheduled_match.player1_id,
          'player2_id', scheduled_match.player2_id
        )
        order by scheduled_match.game, scheduled_match.id
      )
      from public.schedule as scheduled_match
      where scheduled_match.player1_id = any(v_identity_ids)
         or scheduled_match.player2_id = any(v_identity_ids)
    ), '[]'::jsonb),
    'results', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', result.id,
          'league_type', result.league_type,
          'division', result.division,
          'season_number', result.season_number,
          'player1_id', result.player1_id,
          'player2_id', result.player2_id
        )
        order by result.created_at desc, result.id
      )
      from public.results as result
      where result.player1_id = any(v_identity_ids)
         or result.player2_id = any(v_identity_ids)
    ), '[]'::jsonb)
  );
end;
$function$;

revoke all on function public.get_current_user_dashboard_data() from public, anon, authenticated;
grant execute on function public.get_current_user_dashboard_data() to authenticated, service_role;

create or replace function public.get_public_player_profile_data(p_player_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_canonical_id uuid;
  v_identity_ids uuid[];
begin
  if p_player_id is null then
    return jsonb_build_object(
      'player', null,
      'memberships', '[]'::jsonb,
      'results', '[]'::jsonb
    );
  end if;

  v_canonical_id := public.resolve_canonical_player_id(p_player_id);

  if v_canonical_id is null or not exists (
    select 1
    from public.players as player
    where player.id = v_canonical_id
  ) then
    return jsonb_build_object(
      'player', null,
      'memberships', '[]'::jsonb,
      'results', '[]'::jsonb
    );
  end if;

  select coalesce(
    array_agg(identity_player.player_id order by identity_player.player_id),
    array[v_canonical_id]::uuid[]
  )
  into v_identity_ids
  from public.get_canonical_player_identity_ids(v_canonical_id) as identity_player;

  return jsonb_build_object(
    'player', (
      select jsonb_build_object(
        'id', player.id,
        'screen_name', player.screen_name,
        'status', player.status,
        'active', player.active
      )
      from public.players as player
      where player.id = v_canonical_id
    ),
    'memberships', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', membership.id,
          'league_type', membership.league_type,
          'division', membership.division,
          'season_number', membership.season_number
        )
        order by membership.season_number desc, membership.league_type, membership.division
      )
      from public.player_league_memberships as membership
      where membership.player_id = any(v_identity_ids)
    ), '[]'::jsonb),
    'results', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', result.id,
          'league_type', result.league_type,
          'division', result.division,
          'season_number', result.season_number,
          'game', result.game,
          'course', result.course,
          'player1', result.player1,
          'player2', result.player2,
          'player1_id', result.player1_id,
          'player2_id', result.player2_id,
          'player1_score', result.player1_score,
          'player2_score', result.player2_score,
          'player1_hw', result.player1_hw,
          'player2_hw', result.player2_hw,
          'player1_points', result.player1_points,
          'player2_points', result.player2_points,
          'winner', result.winner,
          'is_draw', result.is_draw
        )
        order by result.created_at desc, result.id
      )
      from public.results as result
      where result.player1_id = any(v_identity_ids)
         or result.player2_id = any(v_identity_ids)
    ), '[]'::jsonb)
  );
end;
$function$;

revoke all on function public.get_public_player_profile_data(uuid) from public, anon, authenticated;
grant execute on function public.get_public_player_profile_data(uuid) to anon, authenticated, service_role;

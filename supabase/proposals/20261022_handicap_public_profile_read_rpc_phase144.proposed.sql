-- PROPOSAL ONLY — DO NOT EXECUTE IN PRODUCTION without Phase 144 authorization.
-- Phase 144: secure public player-profile read contract for published Handicap data.
-- The previous private helper is intentionally eliminated. The single public
-- function is a tightly scoped SECURITY DEFINER projection over the guarded
-- published-only view.

begin;

do $$
begin
  if current_user <> 'postgres' then
    raise exception 'Phase 144 must be installed by the postgres owner role';
  end if;
  if to_regnamespace('handicap_private') is null then
    raise exception 'Phase 144 requires the non-exposed handicap_private schema';
  end if;
  if to_regclass('public.players') is null then
    raise exception 'Phase 144 requires public.players';
  end if;
  if to_regclass('public.handicap_publishable_index_snapshots') is null then
    raise exception 'Phase 144 requires the guarded publication view';
  end if;
  if to_regprocedure('public.get_published_handicap_for_player(uuid)') is null then
    raise exception 'Phase 144 requires the existing identity-bound self-read RPC';
  end if;
  if to_regprocedure('public.get_public_published_handicap_for_player(uuid)') is not null
     or to_regprocedure('handicap_private.get_public_published_handicap_for_player(uuid)') is not null then
    raise exception 'Phase 144 public profile RPC already exists; stop for compatibility review';
  end if;
  if has_table_privilege('anon', 'public.handicap_index_snapshots', 'SELECT')
     or has_table_privilege('authenticated', 'public.handicap_index_snapshots', 'SELECT')
     or has_table_privilege('anon', 'public.handicap_publishable_index_snapshots', 'SELECT')
     or has_table_privilege('authenticated', 'public.handicap_publishable_index_snapshots', 'SELECT') then
    raise exception 'Phase 144 requires direct client table/view SELECT to remain denied';
  end if;
end
$$;

create function public.get_public_published_handicap_for_player(p_player_id pg_catalog.uuid)
returns pg_catalog.jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result pg_catalog.jsonb;
begin
  if p_player_id is null then
    return null;
  end if;

  select pg_catalog.jsonb_build_object(
    'canonical_player_id', latest.canonical_player_id,
    'screen_name', player.screen_name,
    'resulting_index', latest.resulting_index,
    'display_index', case
      when latest.resulting_index is null then '—'
      when latest.resulting_index < 0 then '+' || pg_catalog.to_char(pg_catalog.abs(latest.resulting_index), 'FM999999990.00')
      else pg_catalog.to_char(latest.resulting_index, 'FM999999990.00')
    end,
    'handicap_status', latest.handicap_status,
    'qualifying_card_count', latest.active_round_count,
    'model_version', latest.differential_model_version,
    'effective_from', latest.effective_from,
    'published_at', latest.created_at,
    'history', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'calculation_snapshot_id', history.id,
        'resulting_index', history.resulting_index,
        'display_index', case
          when history.resulting_index is null then '—'
          when history.resulting_index < 0 then '+' || pg_catalog.to_char(pg_catalog.abs(history.resulting_index), 'FM999999990.00')
          else pg_catalog.to_char(history.resulting_index, 'FM999999990.00')
        end,
        'handicap_status', history.handicap_status,
        'qualifying_card_count', history.active_round_count,
        'effective_from', history.effective_from,
        'published_at', history.created_at
      ) order by history.effective_from desc nulls last, history.created_at desc, history.id desc)
      from public.handicap_publishable_index_snapshots as history
      where history.canonical_player_id = p_player_id
    ), '[]'::pg_catalog.jsonb)
  )
  into result
  from public.handicap_publishable_index_snapshots as latest
  join public.players as player on player.id = latest.canonical_player_id
  where latest.canonical_player_id = p_player_id
  order by latest.effective_from desc nulls last, latest.created_at desc, latest.id desc
  limit 1;

  return result;
end;
$$;

alter function public.get_public_published_handicap_for_player(pg_catalog.uuid) owner to postgres;
revoke all on function public.get_public_published_handicap_for_player(pg_catalog.uuid) from public, anon, authenticated;
grant execute on function public.get_public_published_handicap_for_player(pg_catalog.uuid) to anon, authenticated;

commit;

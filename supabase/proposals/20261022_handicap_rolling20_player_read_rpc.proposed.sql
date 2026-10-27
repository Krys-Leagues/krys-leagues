-- PROPOSAL ONLY — DO NOT EXECUTE IN PRODUCTION.
-- Phase 127: identity-bound public read contract for published rolling-20 indexes.
-- Install only after the Phase 127 persistence/view proposal and a separate
-- publication authorization. This function never reads unpublished rows.

begin;

do $$
begin
  if to_regprocedure('public.current_user_canonical_player_id()') is null then
    raise exception 'Phase 127 requires current_user_canonical_player_id()';
  end if;
  if to_regclass('public.handicap_publishable_index_snapshots') is null then
    raise exception 'Phase 127 requires the guarded publication view';
  end if;
  if to_regprocedure('public.get_published_handicap_for_player(uuid)') is not null then
    raise exception 'Published Handicap reader already exists; stop for explicit compatibility review';
  end if;
end
$$;

create function public.get_published_handicap_for_player(p_player_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  canonical_id uuid;
  result jsonb;
begin
  canonical_id := public.current_user_canonical_player_id();
  if canonical_id is null or p_player_id is distinct from canonical_id then
    return null;
  end if;

  select jsonb_build_object(
    'canonical_player_id', latest.canonical_player_id,
    'screen_name', player.screen_name,
    'handicap_index', latest.resulting_index,
    'handicap_status', latest.handicap_status,
    'qualifying_card_count', latest.active_round_count,
    'display_index', case
      when latest.resulting_index < 0 then '+' || to_char(abs(latest.resulting_index), 'FM999999990.00')
      else to_char(latest.resulting_index, 'FM999999990.00')
    end,
    'model_version', latest.differential_model_version,
    'effective_from', latest.effective_from,
    'published_at', latest.created_at,
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
        'calculation_run_id', history.calculation_run_id,
        'handicap_index', history.resulting_index,
        'handicap_status', history.handicap_status,
        'qualifying_card_count', history.active_round_count,
        'display_index', case
          when history.resulting_index < 0 then '+' || to_char(abs(history.resulting_index), 'FM999999990.00')
          else to_char(history.resulting_index, 'FM999999990.00')
        end,
        'effective_from', history.effective_from,
        'published_at', history.created_at
      ) order by history.effective_from desc nulls last, history.created_at desc, history.id desc)
      from public.handicap_publishable_index_snapshots as history
      where history.canonical_player_id = canonical_id
    ), '[]'::jsonb)
  )
  into result
  from public.handicap_publishable_index_snapshots as latest
  join public.players as player on player.id = latest.canonical_player_id
  where latest.canonical_player_id = canonical_id
  order by latest.effective_from desc nulls last, latest.created_at desc, latest.id desc
  limit 1;

  return result;
end;
$$;

revoke all on function public.get_published_handicap_for_player(uuid) from public, anon;
grant execute on function public.get_published_handicap_for_player(uuid) to authenticated;

commit;

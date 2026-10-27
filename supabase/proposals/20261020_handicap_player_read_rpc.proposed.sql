-- PROPOSAL ONLY — DO NOT EXECUTE IN PRODUCTION.
-- Phase 107: identity-bound read of the publishable Handicap index.
-- This function does not publish data and does not grant table/view access.

begin;

do $$
begin
  if to_regprocedure('public.current_user_canonical_player_id()') is null then
    raise exception 'Phase 107 requires current_user_canonical_player_id()';
  end if;
  if to_regclass('public.handicap_publishable_index_snapshots') is null then
    raise exception 'Phase 107 requires the guarded publication view';
  end if;
end
$$;

create or replace function public.get_published_handicap_for_player(p_player_id uuid)
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
    'canonical_player_id', i.canonical_player_id,
    'screen_name', p.screen_name,
    'handicap_index', i.resulting_index,
    'model_version', i.differential_model_version,
    'calculation_run_id', i.calculation_run_id,
    'approved_at', i.created_at,
    'history', '[]'::jsonb
  )
  into result
  from public.handicap_publishable_index_snapshots as i
  join public.players as p on p.id = i.canonical_player_id
  where i.canonical_player_id = canonical_id
  order by i.created_at desc, i.id desc
  limit 1;

  return result;
end;
$$;

revoke all on function public.get_published_handicap_for_player(uuid) from public, anon;
grant execute on function public.get_published_handicap_for_player(uuid) to authenticated;

commit;

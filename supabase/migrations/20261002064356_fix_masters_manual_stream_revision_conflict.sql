begin;

-- An expected optimistic-lock conflict is an application-level HTTP 409, not
-- a PostgreSQL serialization failure. PostgREST retries SQLSTATE 40001, so
-- using it here can trap a stale request in an automatic retry loop.
create or replace function public.update_masters_manual_stream_card(
  p_expected_revision bigint,
  p_slots jsonb
)
returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare
  current_revision bigint;
  slot_item jsonb;
  slot_index integer;
  enabled_count integer := 0;
  score_value numeric;
  next_revision bigint;
begin
  if not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode = '42501';
  end if;

  if pg_catalog.jsonb_typeof(p_slots) <> 'array'
    or pg_catalog.jsonb_array_length(p_slots) <> 4 then
    raise exception 'Manual stream card requires exactly four slots' using errcode = '22023';
  end if;

  for slot_index in 0..3 loop
    slot_item := p_slots -> slot_index;

    if pg_catalog.jsonb_typeof(slot_item) <> 'object'
      or pg_catalog.jsonb_typeof(slot_item -> 'slot') <> 'number'
      or (slot_item ->> 'slot')::integer <> slot_index + 1
      or pg_catalog.jsonb_typeof(slot_item -> 'enabled') <> 'boolean'
      or pg_catalog.jsonb_typeof(slot_item -> 'name') <> 'string'
      or pg_catalog.jsonb_typeof(slot_item -> 'score') <> 'number' then
      raise exception 'Manual stream slot % is invalid', slot_index + 1 using errcode = '22023';
    end if;

    if pg_catalog.length(slot_item ->> 'name') > 64 then
      raise exception 'Manual stream names may not exceed 64 characters' using errcode = '22023';
    end if;

    score_value := (slot_item ->> 'score')::numeric;
    if score_value <> pg_catalog.trunc(score_value)
      or score_value not between -999 and 999 then
      raise exception 'Manual stream scores must be whole numbers from -999 to 999' using errcode = '22023';
    end if;

    if (slot_item ->> 'enabled')::boolean then
      enabled_count := enabled_count + 1;
    end if;
  end loop;

  if enabled_count not between 2 and 4 then
    raise exception 'Enable exactly 2, 3, or 4 manual player slots' using errcode = '22023';
  end if;

  select card.revision
  into current_revision
  from public.masters_manual_stream_cards card
  where card.id = 'masters-main'
  for update;

  if current_revision is null then
    raise exception 'Manual Masters stream card was not initialized';
  end if;
  if current_revision <> p_expected_revision then
    raise exception 'STALE_MANUAL_STREAM_REVISION' using errcode = 'PT409';
  end if;

  update public.masters_manual_stream_cards
  set slots = p_slots,
      revision = revision + 1,
      updated_by = auth.uid(),
      updated_at = now()
  where id = 'masters-main'
  returning revision into next_revision;

  return next_revision;
end;
$function$;

revoke all on function public.update_masters_manual_stream_card(bigint, jsonb) from public, anon, authenticated;
grant execute on function public.update_masters_manual_stream_card(bigint, jsonb) to authenticated, service_role;

commit;

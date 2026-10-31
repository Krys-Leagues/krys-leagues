begin;

-- A deliberately isolated, stream-only singleton. It has no foreign keys to
-- Masters rooms, players, scorecards, results, standings, or verification.
create table if not exists public.masters_manual_stream_cards (
  id text primary key,
  slots jsonb not null,
  revision bigint not null default 1,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint masters_manual_stream_cards_singleton_check check (id = 'masters-main'),
  constraint masters_manual_stream_cards_slots_shape_check check (
    pg_catalog.jsonb_typeof(slots) = 'array'
    and pg_catalog.jsonb_array_length(slots) = 4
  ),
  constraint masters_manual_stream_cards_revision_check check (revision >= 1)
);

alter table public.masters_manual_stream_cards enable row level security;

revoke all on table public.masters_manual_stream_cards from public, anon, authenticated;

insert into public.masters_manual_stream_cards (id, slots)
values (
  'masters-main',
  '[
    {"slot":1,"enabled":true,"name":"","score":0},
    {"slot":2,"enabled":true,"name":"","score":0},
    {"slot":3,"enabled":true,"name":"","score":0},
    {"slot":4,"enabled":true,"name":"","score":0}
  ]'::jsonb
)
on conflict (id) do nothing;

create or replace function public.get_public_masters_manual_stream_card()
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  select pg_catalog.jsonb_build_object(
    'slots', card.slots,
    'revision', card.revision,
    'updated_at', card.updated_at
  )
  from public.masters_manual_stream_cards card
  where card.id = 'masters-main';
$function$;

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
    raise exception 'STALE_MANUAL_STREAM_REVISION' using errcode = '40001';
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

revoke all on function public.get_public_masters_manual_stream_card() from public, anon, authenticated;
grant execute on function public.get_public_masters_manual_stream_card() to anon, authenticated;

revoke all on function public.update_masters_manual_stream_card(bigint, jsonb) from public, anon, authenticated;
grant execute on function public.update_masters_manual_stream_card(bigint, jsonb) to authenticated, service_role;

commit;

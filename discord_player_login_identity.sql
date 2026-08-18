begin;

create or replace function public.resolve_current_discord_player_login()
returns table(
  resolution_status text,
  canonical_player_id uuid
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_discord_ids text[];
  v_discord_id text;
  v_canonical_player_ids uuid[];
begin
  if auth.uid() is null then
    raise exception 'Authenticated Discord login is required' using errcode = '42501';
  end if;

  select array_agg(distinct identity_row.discord_id order by identity_row.discord_id)
  into v_discord_ids
  from (
    select nullif(btrim(coalesce(
      identity.identity_data ->> 'provider_id',
      identity.identity_data ->> 'id',
      identity.identity_data ->> 'sub'
    )), '') as discord_id
    from auth.identities as identity
    where identity.user_id = auth.uid()
      and identity.provider = 'discord'
  ) as identity_row
  where identity_row.discord_id is not null;

  if coalesce(cardinality(v_discord_ids), 0) <> 1 then
    return query select 'conflict'::text, null::uuid;
    return;
  end if;

  v_discord_id := v_discord_ids[1];

  select array_agg(distinct matched.canonical_id order by matched.canonical_id)
  into v_canonical_player_ids
  from (
    select public.resolve_canonical_player_id(player.id) as canonical_id
    from public.players as player
    where nullif(btrim(player.discord_id), '') = v_discord_id
  ) as matched
  where matched.canonical_id is not null;

  if coalesce(cardinality(v_canonical_player_ids), 0) = 0 then
    return query select 'no_match'::text, null::uuid;
    return;
  end if;

  if cardinality(v_canonical_player_ids) > 1 then
    return query select 'conflict'::text, null::uuid;
    return;
  end if;

  if not exists (
    select 1
    from public.players as canonical
    where canonical.id = v_canonical_player_ids[1]
      and public.resolve_canonical_player_id(canonical.id) = canonical.id
  ) then
    return query select 'conflict'::text, null::uuid;
    return;
  end if;

  return query select 'matched'::text, v_canonical_player_ids[1];
end;
$function$;

revoke all on function public.resolve_current_discord_player_login() from public;
revoke all on function public.resolve_current_discord_player_login() from anon;
revoke all on function public.resolve_current_discord_player_login() from authenticated;
grant execute on function public.resolve_current_discord_player_login() to authenticated;

commit;

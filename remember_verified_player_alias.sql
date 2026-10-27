begin;

create or replace function public.remember_verified_player_alias(
  p_player_id uuid,
  p_alias text
)
returns table(
  canonical_player_id uuid,
  alias text,
  normalized_alias text,
  verified boolean,
  idempotent boolean,
  status text
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_canonical_player_id uuid;
  v_alias text;
  v_normalized_alias text;
  v_verified_canonical_ids uuid[];
  v_existing_alias public.player_aliases%rowtype;
begin
  if v_user_id is null or not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode = '42501';
  end if;

  if p_player_id is null then
    raise exception 'Player ID is required';
  end if;
  if not exists (
    select 1 from public.players as player where player.id = p_player_id
  ) then
    raise exception 'Selected player does not exist';
  end if;

  v_alias := btrim(p_alias);
  if p_alias is null or v_alias = '' then
    raise exception 'Alias is required';
  end if;
  v_normalized_alias := public.normalize_player_identity_name(v_alias);
  if v_normalized_alias is null or v_normalized_alias = '' then
    raise exception 'Alias must contain at least one letter or number';
  end if;

  -- Coordinate with the established identity-merge mutation before resolving
  -- the selected UUID, then serialize all writes for this normalized alias.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('site-player-identity-merge', 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('verified-player-alias:' || v_normalized_alias, 0)
  );

  v_canonical_player_id := public.resolve_canonical_player_id(p_player_id);
  if v_canonical_player_id is null or not exists (
    select 1 from public.players as player
    where player.id = v_canonical_player_id
  ) then
    raise exception 'Selected player identity could not be resolved canonically';
  end if;

  -- Lock every existing row with equivalent normalized evidence. The advisory
  -- lock also covers the no-row case and prevents concurrent duplicate writes.
  perform 1
  from public.player_aliases as alias_row
  where public.normalize_player_identity_name(alias_row.normalized_alias)
    = v_normalized_alias
  order by alias_row.id
  for update;

  select array_agg(distinct public.resolve_canonical_player_id(alias_row.player_id)
                   order by public.resolve_canonical_player_id(alias_row.player_id))
  into v_verified_canonical_ids
  from public.player_aliases as alias_row
  where alias_row.verified
    and public.normalize_player_identity_name(alias_row.normalized_alias)
      = v_normalized_alias;

  if exists (
    select 1
    from unnest(coalesce(v_verified_canonical_ids, array[]::uuid[])) as existing_id
    where existing_id is null or existing_id <> v_canonical_player_id
  ) then
    raise exception
      'Verified alias "%" already belongs to a different canonical player identity',
      v_alias
      using errcode = '23505';
  end if;

  if v_canonical_player_id = any(coalesce(v_verified_canonical_ids, array[]::uuid[])) then
    return query select
      v_canonical_player_id,
      v_alias,
      v_normalized_alias,
      true,
      true,
      'already_verified_same_identity'::text;
    return;
  end if;

  -- Preserve the supplied historical spelling. If the exact alias already
  -- exists on the canonical UUID, promote that row rather than duplicating it.
  select alias_row.* into v_existing_alias
  from public.player_aliases as alias_row
  where alias_row.player_id = v_canonical_player_id
    and alias_row.alias = v_alias
  for update;

  if found then
    update public.player_aliases as alias_row
    set normalized_alias = v_normalized_alias,
        source = 'historical_alias',
        verified = true
    where alias_row.id = v_existing_alias.id;
  else
    insert into public.player_aliases(
      player_id,
      alias,
      normalized_alias,
      source,
      verified
    ) values (
      v_canonical_player_id,
      v_alias,
      v_normalized_alias,
      'historical_alias',
      true
    );
  end if;

  return query select
    v_canonical_player_id,
    v_alias,
    v_normalized_alias,
    true,
    false,
    'created'::text;
end;
$function$;

revoke all on function public.remember_verified_player_alias(uuid, text)
  from public, anon, authenticated;
grant execute on function public.remember_verified_player_alias(uuid, text)
  to authenticated;

-- Definition-only checks. These inspect catalogs and create no alias data.
do $remember_verified_player_alias_check$
declare
  v_function_oid regprocedure;
  v_result text;
  v_definition text;
begin
  v_function_oid := to_regprocedure(
    'public.remember_verified_player_alias(uuid,text)'
  );
  if v_function_oid is null then
    raise exception 'remember_verified_player_alias(uuid,text) was not created';
  end if;

  select pg_catalog.pg_get_function_result(v_function_oid::oid),
         pg_catalog.pg_get_functiondef(v_function_oid::oid)
  into v_result, v_definition;

  if v_result <> 'TABLE(canonical_player_id uuid, alias text, normalized_alias text, verified boolean, idempotent boolean, status text)' then
    raise exception 'remember_verified_player_alias has an unexpected return shape: %', v_result;
  end if;
  if v_definition not like '%public.is_current_user_site_admin()%'
     or v_definition not like '%public.resolve_canonical_player_id%'
     or v_definition not like '%public.normalize_player_identity_name%'
     or v_definition not like '%public.player_aliases%'
     or v_definition like '%historical_match_%'
     or v_definition like '%public.schedule%'
     or v_definition like '%public.results%'
     or v_definition like '%public.season_standings%' then
    raise exception 'remember_verified_player_alias definition failed its Global Identity isolation check';
  end if;
end;
$remember_verified_player_alias_check$;

commit;

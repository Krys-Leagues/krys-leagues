begin;

create or replace function public.save_solo_roster(
  p_roster_version_id uuid,
  p_entries jsonb
) returns table(id uuid, player_id uuid, player_screen_name text, division text, display_order integer)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_roster public.solo_roster_versions%rowtype;
begin
  if auth.uid() is null or not public.can_current_user_admin_solo() then
    raise exception 'Administrator authorization is required' using errcode = '42501';
  end if;
  if p_entries is null or jsonb_typeof(p_entries) <> 'array' then
    raise exception 'Roster entries must be a JSON array';
  end if;

  select roster.*
  into v_roster
  from public.solo_roster_versions as roster
  where roster.id = p_roster_version_id
  for update;

  if not found then raise exception 'Solo roster version was not found'; end if;
  if v_roster.status <> 'draft' then raise exception 'Only a draft Solo roster can be edited'; end if;

  perform 1
  from public.solo_roster_entries as locked_entry
  where locked_entry.roster_version_id = v_roster.id
  for update;

  if exists(
    select 1
    from jsonb_to_recordset(p_entries) as entry(player_id uuid, division text, display_order integer)
    where entry.player_id is null
      or entry.division not in ('Master','Elite','League 1','League 2','League 3','League 4')
      or entry.display_order is null
      or entry.display_order <= 0
  ) then raise exception 'Every Solo roster entry requires a valid player, division, and order'; end if;

  if exists(
    select 1
    from jsonb_to_recordset(p_entries) as entry(player_id uuid, division text, display_order integer)
    group by entry.player_id
    having count(*) > 1
  ) then raise exception 'A player may appear only once in a Solo roster'; end if;

  if exists(
    select 1
    from jsonb_to_recordset(p_entries) as entry(player_id uuid, division text, display_order integer)
    group by entry.division, entry.display_order
    having count(*) > 1
  ) then raise exception 'Division display order values must be unique'; end if;

  if exists(
    select 1
    from jsonb_to_recordset(p_entries) as entry(player_id uuid, division text, display_order integer)
    left join public.players as player on player.id = entry.player_id
    where player.id is null
  ) then raise exception 'One or more selected players do not exist'; end if;

  if exists(
    select 1
    from jsonb_to_recordset(p_entries) as entry(player_id uuid, division text, display_order integer)
    join public.players as player on player.id = entry.player_id
    where lower(btrim(player.screen_name)) = 'bye'
  ) then raise exception 'BYE is not a Solo player identity'; end if;

  delete from public.solo_roster_entries as existing_entry
  where existing_entry.roster_version_id = v_roster.id;

  insert into public.solo_roster_entries(
    roster_version_id,
    season_id,
    player_id,
    player_screen_name,
    division,
    display_order
  )
  select
    v_roster.id,
    v_roster.season_id,
    entry.player_id,
    player.screen_name,
    entry.division,
    entry.display_order
  from jsonb_to_recordset(p_entries) as entry(player_id uuid, division text, display_order integer)
  join public.players as player on player.id = entry.player_id;

  return query
  select
    saved_entry.id,
    saved_entry.player_id,
    saved_entry.player_screen_name,
    saved_entry.division,
    saved_entry.display_order
  from public.solo_roster_entries as saved_entry
  where saved_entry.roster_version_id = v_roster.id
  order by saved_entry.division, saved_entry.display_order;
end;
$function$;

commit;

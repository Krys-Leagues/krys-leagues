-- Keep the canonical current-membership table aligned with the approved Solo roster.
-- This does not touch Solo Historical Recovery data or player identity data.

create or replace function public.approve_solo_roster_version(
  p_roster_version_id uuid,
  p_approval_note text default null
)
returns table(
  season_id uuid,
  roster_version_id uuid,
  roster_status text,
  populated_player_count integer
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_roster public.solo_roster_versions%rowtype;
  v_season_number integer;
  v_count integer;
begin
  if auth.uid() is null or not public.can_current_user_admin_solo() then
    raise exception 'Administrator authorization is required' using errcode = '42501';
  end if;

  select roster.*
  into v_roster
  from public.solo_roster_versions as roster
  where roster.id = p_roster_version_id
  for update;

  if not found then raise exception 'Solo roster version was not found'; end if;

  select season.season_number
  into v_season_number
  from public.seasons as season
  where season.id = v_roster.season_id
    and lower(btrim(season.league_type)) = 'solo'
  for update;

  if not found then raise exception 'Roster does not belong to a Solo season'; end if;
  if v_roster.status <> 'draft' then raise exception 'Only a draft Solo roster can be approved'; end if;

  perform 1
  from public.solo_roster_entries as roster_entry
  where roster_entry.roster_version_id = v_roster.id
  for update;

  select count(*)
  into v_count
  from public.solo_roster_entries as roster_entry
  where roster_entry.roster_version_id = v_roster.id;

  if v_count = 0 then raise exception 'Add at least one player before approving the Solo roster'; end if;

  if (
    select count(distinct roster_entry.player_id)
    from public.solo_roster_entries as roster_entry
    where roster_entry.roster_version_id = v_roster.id
  ) <> v_count then
    raise exception 'A player may appear only once in a Solo roster';
  end if;

  update public.solo_roster_versions as roster
  set status = 'approved',
      approved_at = now(),
      approved_by = auth.uid(),
      approval_note = nullif(btrim(p_approval_note), '')
  where roster.id = v_roster.id;

  delete from public.player_league_memberships as membership
  where lower(btrim(membership.league_type)) = 'solo'
    and membership.season_number = v_season_number
    and not exists (
      select 1
      from public.solo_roster_entries as roster_entry
      where roster_entry.roster_version_id = v_roster.id
        and public.resolve_canonical_player_id(roster_entry.player_id) is not distinct from membership.player_id
        and roster_entry.division = membership.division
    );

  insert into public.player_league_memberships(player_id, league_type, season_number, division)
  select distinct
    public.resolve_canonical_player_id(roster_entry.player_id),
    'solo',
    v_season_number,
    roster_entry.division
  from public.solo_roster_entries as roster_entry
  where roster_entry.roster_version_id = v_roster.id
    and public.resolve_canonical_player_id(roster_entry.player_id) is not null
  on conflict (player_id, league_type, season_number, division) do nothing;

  return query
  select v_roster.season_id, v_roster.id, 'approved'::text, v_count;
end;
$function$;

-- Backfill only the current approved roster per Solo season. This is intentionally
-- idempotent and does not read or write any Solo Historical Recovery tables.
with current_approved_rosters as (
  select distinct on (roster.season_id)
    roster.season_id,
    roster.id as roster_version_id,
    season.season_number
  from public.solo_roster_versions as roster
  join public.seasons as season on season.id = roster.season_id
  where lower(btrim(season.league_type)) = 'solo'
    and roster.status = 'approved'
  order by roster.season_id, roster.approved_at desc nulls last, roster.version_number desc
)
insert into public.player_league_memberships(player_id, league_type, season_number, division)
select distinct
  public.resolve_canonical_player_id(roster_entry.player_id),
  'solo',
  current_roster.season_number,
  roster_entry.division
from current_approved_rosters as current_roster
join public.solo_roster_entries as roster_entry on roster_entry.roster_version_id = current_roster.roster_version_id
where public.resolve_canonical_player_id(roster_entry.player_id) is not null
on conflict (player_id, league_type, season_number, division) do nothing;

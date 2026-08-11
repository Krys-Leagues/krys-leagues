begin;

create or replace function public.approve_solo_roster_version(
  p_roster_version_id uuid,
  p_approval_note text default null
) returns table(
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

  perform 1
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

  return query
  select v_roster.season_id, v_roster.id, 'approved'::text, v_count;
end;
$function$;

revoke all on function public.approve_solo_roster_version(uuid,text)
from public, anon, authenticated;
grant execute on function public.approve_solo_roster_version(uuid,text)
to authenticated;

commit;

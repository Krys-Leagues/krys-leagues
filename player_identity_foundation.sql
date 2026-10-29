begin;

create table if not exists public.player_identity_links (
  historical_player_id uuid primary key references public.players(id) on delete restrict,
  canonical_player_id uuid not null references public.players(id) on delete restrict,
  merged_at timestamptz not null default now(),
  merged_by uuid null references auth.users(id) on delete restrict,
  constraint player_identity_links_distinct_players
    check (historical_player_id <> canonical_player_id)
);

create index if not exists player_identity_links_canonical_player_idx
  on public.player_identity_links(canonical_player_id);

create table if not exists public.player_identity_not_matches (
  player1_id uuid not null references public.players(id) on delete restrict,
  player2_id uuid not null references public.players(id) on delete restrict,
  evidence_signature text not null,
  reviewed_at timestamptz not null default now(),
  reviewed_by uuid null references auth.users(id) on delete restrict,
  primary key (player1_id, player2_id),
  constraint player_identity_not_matches_ordered_pair
    check (player1_id < player2_id)
);

alter table public.player_identity_links enable row level security;
alter table public.player_identity_not_matches enable row level security;

drop policy if exists "Site admins can read player identity links"
  on public.player_identity_links;
create policy "Site admins can read player identity links"
  on public.player_identity_links
  for select
  to authenticated
  using (public.is_current_user_site_admin());

drop policy if exists "Site admins can read player identity not matches"
  on public.player_identity_not_matches;
create policy "Site admins can read player identity not matches"
  on public.player_identity_not_matches
  for select
  to authenticated
  using (public.is_current_user_site_admin());

revoke all on table public.player_identity_links from public, anon, authenticated;
revoke all on table public.player_identity_not_matches from public, anon, authenticated;
grant select on table public.player_identity_links to authenticated;
grant select on table public.player_identity_not_matches to authenticated;

create or replace function public.resolve_canonical_player_id(
  p_player_id uuid
)
returns uuid
language sql
stable
security definer
set search_path to ''
as $function$
  with recursive identity_path as (
    select p_player_id as player_id, array[p_player_id]::uuid[] as visited
    where p_player_id is not null

    union all

    select link.canonical_player_id, path.visited || link.canonical_player_id
    from identity_path as path
    join public.player_identity_links as link
      on link.historical_player_id = path.player_id
    where not link.canonical_player_id = any(path.visited)
  )
  select path.player_id
  from identity_path as path
  order by cardinality(path.visited) desc
  limit 1;
$function$;

revoke all on function public.resolve_canonical_player_id(uuid) from public;
revoke all on function public.resolve_canonical_player_id(uuid) from anon;
revoke all on function public.resolve_canonical_player_id(uuid) from authenticated;
grant execute on function public.resolve_canonical_player_id(uuid) to anon;
grant execute on function public.resolve_canonical_player_id(uuid) to authenticated;

create or replace function public.get_canonical_player_identity_ids(
  p_player_id uuid
)
returns table(player_id uuid)
language sql
stable
security definer
set search_path to ''
as $function$
  select player.id
  from public.players as player
  where public.resolve_canonical_player_id(player.id)
    = public.resolve_canonical_player_id(p_player_id)
  order by player.id;
$function$;

revoke all on function public.get_canonical_player_identity_ids(uuid) from public;
revoke all on function public.get_canonical_player_identity_ids(uuid) from anon;
revoke all on function public.get_canonical_player_identity_ids(uuid) from authenticated;
grant execute on function public.get_canonical_player_identity_ids(uuid) to anon;
grant execute on function public.get_canonical_player_identity_ids(uuid) to authenticated;

create or replace function public.get_public_player_canonical_identity(
  p_player_id uuid
)
returns table(
  canonical_player_id uuid,
  canonical_screen_name text,
  identity_player_ids uuid[],
  aliases text[],
  discord_linked boolean
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_canonical_id uuid;
begin
  if p_player_id is null then
    raise exception 'Player ID is required';
  end if;

  v_canonical_id := public.resolve_canonical_player_id(p_player_id);

  if v_canonical_id is null or not exists (
    select 1 from public.players as player where player.id = v_canonical_id
  ) then
    return;
  end if;

  return query
  select
    canonical.id,
    canonical.screen_name,
    (select array_agg(identity_player.player_id order by identity_player.player_id)
     from public.get_canonical_player_identity_ids(v_canonical_id) as identity_player),
    coalesce((select array_agg(distinct alias_row.alias order by alias_row.alias)
              from public.player_aliases as alias_row
              where alias_row.player_id = v_canonical_id), array[]::text[]),
    nullif(btrim(canonical.discord_id), '') is not null
  from public.players as canonical
  where canonical.id = v_canonical_id;
end;
$function$;

revoke all on function public.get_public_player_canonical_identity(uuid) from public;
revoke all on function public.get_public_player_canonical_identity(uuid) from anon;
revoke all on function public.get_public_player_canonical_identity(uuid) from authenticated;
grant execute on function public.get_public_player_canonical_identity(uuid) to anon;
grant execute on function public.get_public_player_canonical_identity(uuid) to authenticated;

create or replace function public.normalize_player_identity_name(
  p_name text
)
returns text
language sql
immutable
parallel safe
set search_path to ''
as $function$
  select lower(regexp_replace(coalesce(p_name, ''), '[^[:alnum:]]+', '', 'g'));
$function$;

revoke all on function public.normalize_player_identity_name(text) from public;
revoke all on function public.normalize_player_identity_name(text) from anon;
revoke all on function public.normalize_player_identity_name(text) from authenticated;
grant execute on function public.normalize_player_identity_name(text) to authenticated;

create or replace function public.canonicalize_managed_roster_slot_player()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_canonical_id uuid;
  v_canonical_name text;
begin
  if new.player_id is null then
    return new;
  end if;

  v_canonical_id := public.resolve_canonical_player_id(new.player_id);
  select player.screen_name into v_canonical_name
  from public.players as player
  where player.id = v_canonical_id;

  if v_canonical_name is null then
    raise exception 'Roster slot player identity could not be resolved';
  end if;

  new.player_id := v_canonical_id;
  new.player_screen_name := v_canonical_name;
  return new;
end;
$function$;

drop trigger if exists canonicalize_stroke_roster_slot_player
  on public.stroke_division_roster_slots;
create trigger canonicalize_stroke_roster_slot_player
before insert or update of player_id
on public.stroke_division_roster_slots
for each row execute function public.canonicalize_managed_roster_slot_player();

drop trigger if exists canonicalize_match_roster_slot_player
  on public.match_division_roster_slots;
create trigger canonicalize_match_roster_slot_player
before insert or update of player_id
on public.match_division_roster_slots
for each row execute function public.canonicalize_managed_roster_slot_player();

drop trigger if exists canonicalize_pyp_roster_slot_player
  on public.pyp_division_roster_slots;
create trigger canonicalize_pyp_roster_slot_player
before insert or update of player_id
on public.pyp_division_roster_slots
for each row execute function public.canonicalize_managed_roster_slot_player();

create or replace function public.canonicalize_major_player_reference()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_canonical_id uuid;
  v_canonical_name text;
begin
  if new.player_id is null then
    return new;
  end if;

  v_canonical_id := public.resolve_canonical_player_id(new.player_id);

  select player.screen_name
  into v_canonical_name
  from public.players as player
  where player.id = v_canonical_id
    and player.active is not false;

  if v_canonical_name is null then
    raise exception 'Major player identity could not be resolved to an active canonical player';
  end if;

  new.player_id := v_canonical_id;
  new.player_screen_name_snapshot := v_canonical_name;
  return new;
end;
$function$;

revoke all on function public.canonicalize_major_player_reference()
from public;
revoke all on function public.canonicalize_major_player_reference()
from anon;
revoke all on function public.canonicalize_major_player_reference()
from authenticated;

drop trigger if exists canonicalize_major_entry_player
  on public.major_entries;
create trigger canonicalize_major_entry_player
before insert
on public.major_entries
for each row execute function public.canonicalize_major_player_reference();

drop trigger if exists canonicalize_major_scoring_participant_player
  on public.major_scoring_participants;
create trigger canonicalize_major_scoring_participant_player
before insert
on public.major_scoring_participants
for each row execute function public.canonicalize_major_player_reference();

create or replace function public.canonicalize_reopened_major_event_entries()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if new.status in ('complete', 'cancelled')
     or old.status not in ('complete', 'cancelled') then
    return new;
  end if;

  if exists (
    select public.resolve_canonical_player_id(entry.player_id)
    from public.major_entries as entry
    where entry.major_event_id = new.id
    group by public.resolve_canonical_player_id(entry.player_id)
    having count(*) > 1
  ) then
    raise exception 'This Major event contains duplicate canonical player identities and cannot be reopened';
  end if;

  update public.major_entries as entry
  set player_id = public.resolve_canonical_player_id(entry.player_id)
  where entry.major_event_id = new.id
    and entry.player_id is distinct from public.resolve_canonical_player_id(entry.player_id);

  return new;
end;
$function$;

revoke all on function public.canonicalize_reopened_major_event_entries()
from public;
revoke all on function public.canonicalize_reopened_major_event_entries()
from anon;
revoke all on function public.canonicalize_reopened_major_event_entries()
from authenticated;

drop trigger if exists canonicalize_reopened_major_event_entries
  on public.major_events;
create trigger canonicalize_reopened_major_event_entries
before update of status
on public.major_events
for each row execute function public.canonicalize_reopened_major_event_entries();

create or replace function public.canonicalize_activated_major_session_participants()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if not new.is_active or old.is_active then
    return new;
  end if;

  if exists (
    select public.resolve_canonical_player_id(participant.player_id)
    from public.major_scoring_participants as participant
    where participant.session_id = new.id
    group by public.resolve_canonical_player_id(participant.player_id)
    having count(*) > 1
  ) then
    raise exception 'This Major scoring session contains duplicate canonical player identities and cannot be activated';
  end if;

  update public.major_scoring_participants as participant
  set player_id = public.resolve_canonical_player_id(participant.player_id)
  where participant.session_id = new.id
    and participant.player_id is distinct from public.resolve_canonical_player_id(participant.player_id);

  return new;
end;
$function$;

revoke all on function public.canonicalize_activated_major_session_participants()
from public;
revoke all on function public.canonicalize_activated_major_session_participants()
from anon;
revoke all on function public.canonicalize_activated_major_session_participants()
from authenticated;

drop trigger if exists canonicalize_activated_major_session_participants
  on public.major_scoring_sessions;
create trigger canonicalize_activated_major_session_participants
before update of is_active
on public.major_scoring_sessions
for each row execute function public.canonicalize_activated_major_session_participants();

commit;

-- Masters wait list.  Waiting players are preferences only and never occupy
-- a confirmed major_entries row or a released field spot.

create table if not exists public.major_waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  major_event_id uuid not null references public.major_events(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete restrict,
  player_screen_name_snapshot text not null check (btrim(player_screen_name_snapshot) <> ''),
  joined_at timestamptz not null default now(),
  state text not null default 'waiting' check (state in ('waiting', 'promoted', 'removed')),
  promoted_at timestamptz,
  promoted_by uuid,
  removed_at timestamptz,
  removed_by uuid,
  notes text,
  audit_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists major_waitlist_active_player_idx
  on public.major_waitlist_entries (major_event_id, player_id)
  where state = 'waiting';

create index if not exists major_waitlist_queue_idx
  on public.major_waitlist_entries (major_event_id, state, joined_at, id);

create table if not exists public.major_waitlist_day_choices (
  id uuid primary key default gen_random_uuid(),
  waitlist_entry_id uuid not null references public.major_waitlist_entries(id) on delete cascade,
  play_day_id uuid not null references public.major_play_days(id) on delete restrict,
  time_slot_id uuid not null references public.major_time_slots(id) on delete restrict,
  selected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (waitlist_entry_id, play_day_id)
);

create index if not exists major_waitlist_choices_slot_idx
  on public.major_waitlist_day_choices (time_slot_id);

alter table public.major_waitlist_entries enable row level security;
alter table public.major_waitlist_day_choices enable row level security;
revoke all on public.major_waitlist_entries, public.major_waitlist_day_choices from public, anon, authenticated;

drop trigger if exists major_waitlist_entries_touch_updated_at on public.major_waitlist_entries;
create trigger major_waitlist_entries_touch_updated_at
before update on public.major_waitlist_entries
for each row execute function public.touch_major_updated_at();

drop trigger if exists major_waitlist_choices_touch_updated_at on public.major_waitlist_day_choices;
create trigger major_waitlist_choices_touch_updated_at
before update on public.major_waitlist_day_choices
for each row execute function public.touch_major_updated_at();

create or replace function public.get_major_waitlist_status(p_major_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  provider_id text;
  matched_player_id uuid;
  matched_count integer;
  entry_row public.major_waitlist_entries%rowtype;
  queue_position integer;
begin
  if auth.uid() is null then
    return jsonb_build_object('entry_id', null, 'state', null, 'position', null, 'choices', '[]'::jsonb);
  end if;

  provider_id := coalesce(
    nullif(btrim(auth.jwt() -> 'user_metadata' ->> 'provider_id'), ''),
    nullif(btrim(auth.jwt() -> 'user_metadata' ->> 'sub'), '')
  );
  if provider_id is null then
    return jsonb_build_object('entry_id', null, 'state', null, 'position', null, 'choices', '[]'::jsonb);
  end if;

  select count(*) into matched_count from public.players where discord_id = provider_id;
  if matched_count <> 1 then
    return jsonb_build_object('entry_id', null, 'state', null, 'position', null, 'choices', '[]'::jsonb);
  end if;
  select id into matched_player_id from public.players where discord_id = provider_id;

  select * into entry_row
  from public.major_waitlist_entries
  where major_event_id = p_major_event_id and player_id = matched_player_id
  order by joined_at desc, id desc
  limit 1;

  if entry_row.id is null then
    return jsonb_build_object('entry_id', null, 'state', null, 'position', null, 'choices', '[]'::jsonb);
  end if;

  if entry_row.state = 'waiting' then
    select count(*) + 1 into queue_position
    from public.major_waitlist_entries earlier
    where earlier.major_event_id = entry_row.major_event_id
      and earlier.state = 'waiting'
      and (earlier.joined_at, earlier.id) < (entry_row.joined_at, entry_row.id);
  end if;

  return jsonb_build_object(
    'entry_id', entry_row.id,
    'state', entry_row.state,
    'position', queue_position,
    'joined_at', entry_row.joined_at,
    'choices', coalesce((
      select jsonb_agg(jsonb_build_object(
        'play_day_id', choice.play_day_id,
        'time_slot_id', choice.time_slot_id
      ) order by day.day_number)
      from public.major_waitlist_day_choices choice
      join public.major_play_days day on day.id = choice.play_day_id
      where choice.waitlist_entry_id = entry_row.id
    ), '[]'::jsonb)
  );
end;
$function$;

create or replace function public.join_major_waitlist_with_slots(
  p_major_event_id uuid,
  p_time_slot_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  provider_id text;
  matched_player public.players%rowtype;
  matched_count integer;
  signup_event public.major_events%rowtype;
  claimed_count integer;
  existing_entry public.major_waitlist_entries%rowtype;
  existing_major_entry public.major_entries%rowtype;
  saved_entry public.major_waitlist_entries%rowtype;
  day_row record;
  selected_slot uuid;
begin
  if auth.uid() is null then raise exception 'You must sign in with Discord.' using errcode = '42501'; end if;
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'provider', '') <> 'discord'
    and not (coalesce(auth.jwt() -> 'app_metadata' -> 'providers', '[]'::jsonb) ? 'discord')
  then raise exception 'A linked Discord identity is required.' using errcode = '42501'; end if;

  provider_id := coalesce(
    nullif(btrim(auth.jwt() -> 'user_metadata' ->> 'provider_id'), ''),
    nullif(btrim(auth.jwt() -> 'user_metadata' ->> 'sub'), '')
  );
  if provider_id is null then raise exception 'Discord identity could not be verified.' using errcode = '42501'; end if;
  select count(*) into matched_count from public.players where discord_id = provider_id;
  if matched_count = 0 then raise exception 'No player is linked to this Discord account.' using errcode = '42501'; end if;
  if matched_count > 1 then raise exception 'This Discord account matches multiple players. Contact an administrator.' using errcode = '21000'; end if;
  select * into matched_player from public.players where discord_id = provider_id;
  if lower(coalesce(matched_player.status, 'active')) = 'memorial' then raise exception 'This player is not eligible for the Masters.' using errcode = '42501'; end if;

  select * into signup_event
  from public.major_events
  where id = p_major_event_id and is_public and signup_open
  for update;
  if not found then raise exception 'Signup is not open for this Major.'; end if;
  if lower(signup_event.slug) <> 'masters' then raise exception 'The Masters wait list is only available for the Masters event.'; end if;

  select count(*) into claimed_count
  from public.major_entries
  where major_event_id = p_major_event_id and status in ('registered', 'confirmed');
  if signup_event.signup_capacity is null or claimed_count < signup_event.signup_capacity then
    raise exception 'The released Masters field is not full.';
  end if;

  select * into existing_major_entry
  from public.major_entries
  where major_event_id = p_major_event_id and player_id = matched_player.id
    and status not in ('withdrawn', 'declined')
  limit 1;
  if existing_major_entry.id is not null then raise exception 'This player is already registered for this Major.' using errcode = '23505'; end if;

  select * into existing_entry
  from public.major_waitlist_entries
  where major_event_id = p_major_event_id and player_id = matched_player.id and state = 'waiting'
  for update;
  if existing_entry.id is not null then raise exception 'This player is already on the Masters wait list.' using errcode = '23505'; end if;

  if coalesce(array_length(p_time_slot_ids, 1), 0) <> 4
    or (select count(distinct slot_id) from unnest(p_time_slot_ids) slot_id) <> 4
  then raise exception 'Choose exactly one time for each of the four tournament days.'; end if;
  if (select count(*) from public.major_play_days where major_event_id = p_major_event_id) <> 4 then
    raise exception 'All four tournament days must be configured before joining the wait list.';
  end if;

  insert into public.major_waitlist_entries (major_event_id, player_id, player_screen_name_snapshot)
  values (p_major_event_id, matched_player.id, matched_player.screen_name)
  returning * into saved_entry;

  for day_row in
    select * from public.major_play_days where major_event_id = p_major_event_id order by day_number
  loop
    select slot.id into selected_slot
    from public.major_time_slots slot
    where slot.id = any(p_time_slot_ids)
      and slot.play_day_id = day_row.id
      and slot.is_available
    for update;
    if selected_slot is null then raise exception 'Choose one available time for Day %.', day_row.day_number; end if;
    insert into public.major_waitlist_day_choices (waitlist_entry_id, play_day_id, time_slot_id)
    values (saved_entry.id, day_row.id, selected_slot);
    selected_slot := null;
  end loop;

  return public.get_major_waitlist_status(p_major_event_id);
end;
$function$;

create or replace function public.get_major_waitlist(p_major_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.major_events where id = p_major_event_id and slug = 'masters') then
    raise exception 'The Masters wait list is only available for the Masters event.';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', entry.id,
      'major_event_id', entry.major_event_id,
      'player_id', entry.player_id,
      'screen_name', entry.player_screen_name_snapshot,
      'joined_at', entry.joined_at,
      'state', entry.state,
      'promoted_at', entry.promoted_at,
      'promoted_by', entry.promoted_by,
      'removed_at', entry.removed_at,
      'removed_by', entry.removed_by,
      'notes', entry.notes,
      'choices', coalesce((
        select jsonb_agg(jsonb_build_object(
          'play_day_id', choice.play_day_id,
          'time_slot_id', choice.time_slot_id,
          'play_date', day.play_date,
          'day_label', day.label,
          'starts_at', slot.starts_at,
          'slot_label', slot.label
        ) order by day.day_number)
        from public.major_waitlist_day_choices choice
        join public.major_play_days day on day.id = choice.play_day_id
        join public.major_time_slots slot on slot.id = choice.time_slot_id
        where choice.waitlist_entry_id = entry.id
      ), '[]'::jsonb)
    ) order by entry.joined_at, entry.id)
    from public.major_waitlist_entries entry
    where entry.major_event_id = p_major_event_id
  ), '[]'::jsonb);
end;
$function$;

create or replace function public.promote_major_waitlist_entry(p_entry_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  entry_row public.major_waitlist_entries%rowtype;
  signup_event public.major_events%rowtype;
  player_row public.players%rowtype;
  confirmed_count integer;
  selected_count integer;
  day_row record;
  selected_slot uuid;
  saved_entry public.major_entries%rowtype;
begin
  if not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required.' using errcode = '42501'; end if;
  select * into entry_row from public.major_waitlist_entries where id = p_entry_id for update;
  if not found then raise exception 'Wait-list entry not found.'; end if;
  if entry_row.state <> 'waiting' then raise exception 'Only a waiting entry can be promoted.'; end if;
  if exists (
    select 1 from public.major_waitlist_entries earlier
    where earlier.major_event_id = entry_row.major_event_id
      and earlier.state = 'waiting'
      and (earlier.joined_at, earlier.id) < (entry_row.joined_at, entry_row.id)
  ) then
    raise exception 'Only the next waiting player may be promoted. Remove or explicitly bypass earlier entries first.';
  end if;
  select * into signup_event from public.major_events where id = entry_row.major_event_id for update;
  if not found then raise exception 'Major event not found.'; end if;
  if signup_event.slug <> 'masters' then raise exception 'The Masters wait list is only available for the Masters event.'; end if;
  select * into player_row from public.players where id = entry_row.player_id;
  if not found then raise exception 'Canonical player not found.'; end if;
  if lower(coalesce(player_row.status, 'active')) = 'memorial' then raise exception 'Player is not eligible for promotion.'; end if;

  select count(*) into confirmed_count from public.major_entries where major_event_id = entry_row.major_event_id and status in ('registered', 'confirmed');
  if signup_event.signup_capacity is null or confirmed_count >= signup_event.signup_capacity then raise exception 'No released field spot is currently available.'; end if;
  if exists (select 1 from public.major_entries where major_event_id = entry_row.major_event_id and player_id = entry_row.player_id and status not in ('withdrawn', 'declined')) then raise exception 'Player is already entered in this Major.'; end if;

  select count(*) into selected_count from public.major_waitlist_day_choices where waitlist_entry_id = entry_row.id;
  if selected_count <> 4 then raise exception 'Every four-day time preference must be present before promotion.'; end if;
  for day_row in select * from public.major_play_days where major_event_id = entry_row.major_event_id order by day_number loop
    select slot.id into selected_slot
    from public.major_waitlist_day_choices choice
    join public.major_time_slots slot on slot.id = choice.time_slot_id
    where choice.waitlist_entry_id = entry_row.id and choice.play_day_id = day_row.id and slot.play_day_id = day_row.id and slot.is_available
    for update;
    if selected_slot is null then raise exception 'A saved time for Day % is no longer available. Choose a replacement before promoting this player.', day_row.day_number; end if;
    selected_slot := null;
  end loop;

  insert into public.major_entries (major_event_id, player_id, player_screen_name_snapshot)
  values (entry_row.major_event_id, entry_row.player_id, entry_row.player_screen_name_snapshot)
  returning * into saved_entry;
  for day_row in select * from public.major_play_days where major_event_id = entry_row.major_event_id order by day_number loop
    select choice.time_slot_id into selected_slot from public.major_waitlist_day_choices choice where choice.waitlist_entry_id = entry_row.id and choice.play_day_id = day_row.id;
    insert into public.major_entry_day_choices (entry_id, play_day_id, time_slot_id) values (saved_entry.id, day_row.id, selected_slot);
  end loop;
  update public.major_waitlist_entries
  set state = 'promoted', promoted_at = now(), promoted_by = auth.uid()
  where id = entry_row.id;
  return jsonb_build_object('entry_id', entry_row.id, 'major_entry_id', saved_entry.id, 'state', 'promoted');
end;
$function$;

create or replace function public.remove_major_waitlist_entry(p_entry_id uuid, p_notes text default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare updated_entry public.major_waitlist_entries%rowtype;
begin
  if not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required.' using errcode = '42501'; end if;
  update public.major_waitlist_entries
  set state = 'removed', removed_at = now(), removed_by = auth.uid(), notes = nullif(btrim(p_notes), '')
  where id = p_entry_id and state = 'waiting'
  returning * into updated_entry;
  if updated_entry.id is null then raise exception 'Only a waiting entry can be removed.'; end if;
  return jsonb_build_object('entry_id', updated_entry.id, 'state', updated_entry.state, 'removed_at', updated_entry.removed_at);
end;
$function$;

revoke all on function public.get_major_waitlist_status(uuid) from public, anon;
revoke all on function public.join_major_waitlist_with_slots(uuid, uuid[]) from public, anon;
revoke all on function public.get_major_waitlist(uuid) from public, anon;
revoke all on function public.promote_major_waitlist_entry(uuid) from public, anon;
revoke all on function public.remove_major_waitlist_entry(uuid, text) from public, anon;
grant execute on function public.get_major_waitlist_status(uuid) to authenticated;
grant execute on function public.join_major_waitlist_with_slots(uuid, uuid[]) to authenticated;
grant execute on function public.get_major_waitlist(uuid) to authenticated;
grant execute on function public.promote_major_waitlist_entry(uuid) to authenticated;
grant execute on function public.remove_major_waitlist_entry(uuid, text) to authenticated;

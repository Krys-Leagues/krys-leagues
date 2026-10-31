begin;

alter table public.major_entries
  add column if not exists registration_source text not null default 'normal_signup'
    check (registration_source in ('normal_signup', 'admin_exception')),
  add column if not exists administratively_added_at timestamptz,
  add column if not exists administratively_added_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists administratively_added_by_player_id uuid references public.players(id) on delete set null,
  add column if not exists administratively_added_by_screen_name_snapshot text,
  add column if not exists administrative_add_note text,
  add column if not exists withdrawn_from_status text
    check (withdrawn_from_status is null or withdrawn_from_status in ('registered', 'confirmed')),
  add column if not exists withdrawn_at timestamptz,
  add column if not exists withdrawn_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists withdrawn_by_player_id uuid references public.players(id) on delete set null,
  add column if not exists withdrawn_by_screen_name_snapshot text,
  add column if not exists withdrawal_reason text;

create table public.major_entry_participation_audit (
  id uuid primary key default gen_random_uuid(),
  major_event_id uuid not null references public.major_events(id) on delete restrict,
  entry_id uuid not null references public.major_entries(id) on delete restrict,
  player_id uuid not null references public.players(id) on delete restrict,
  action text not null check (action in ('admin_add', 'withdraw', 'reactivate')),
  previous_status text not null,
  next_status text not null,
  reason text,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_player_id uuid references public.players(id) on delete set null,
  actor_screen_name_snapshot text not null,
  room_changes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index major_entry_participation_audit_entry_created_idx
  on public.major_entry_participation_audit(entry_id, created_at desc);

create index major_entry_participation_audit_event_created_idx
  on public.major_entry_participation_audit(major_event_id, created_at desc);

alter table public.major_entry_participation_audit enable row level security;
alter table public.major_entry_participation_audit force row level security;
revoke all on table public.major_entry_participation_audit from public, anon, authenticated;
grant select, insert on table public.major_entry_participation_audit to service_role;

create or replace function public.admin_add_major_entrant_exception(
  p_major_event_id uuid,
  p_player_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  event_row public.major_events%rowtype;
  player_row public.players%rowtype;
  existing_entry public.major_entries%rowtype;
  saved_entry public.major_entries%rowtype;
  actor_user uuid;
  actor_player uuid;
  actor_name text;
  normalized_note text;
begin
  actor_user := auth.uid();
  if actor_user is null or not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required.' using errcode = '42501';
  end if;

  select *
  into event_row
  from public.major_events
  where id = p_major_event_id
  for update;
  if not found then
    raise exception 'Major event not found.';
  end if;

  select *
  into player_row
  from public.players
  where id = p_player_id;
  if not found then
    raise exception 'Canonical Global Player not found.';
  end if;
  if lower(coalesce(player_row.status, 'active')) = 'memorial' then
    raise exception 'This canonical Global Player is not eligible for Masters participation.' using errcode = '42501';
  end if;

  select *
  into existing_entry
  from public.major_entries
  where major_event_id = p_major_event_id
    and player_id = p_player_id
  for update;

  if found then
    if existing_entry.status = 'withdrawn' then
      raise exception 'This player already has a WITHDRAWN Masters entry. Use REACTIVATE PLAYER; do not add a duplicate.' using errcode = '23505';
    end if;
    raise exception 'This player is already entered in this Major.' using errcode = '23505';
  end if;

  normalized_note := nullif(btrim(coalesce(p_note, '')), '');
  actor_player := public.current_major_player_id();
  select p.screen_name
  into actor_name
  from public.players p
  where p.id = actor_player;
  actor_name := coalesce(
    nullif(btrim(actor_name), ''),
    nullif(btrim(auth.jwt()->'user_metadata'->>'full_name'), ''),
    nullif(btrim(auth.jwt()->'user_metadata'->>'name'), ''),
    actor_user::text
  );

  insert into public.major_entries (
    major_event_id,
    player_id,
    player_screen_name_snapshot,
    status,
    registration_source,
    administratively_added_at,
    administratively_added_by_user_id,
    administratively_added_by_player_id,
    administratively_added_by_screen_name_snapshot,
    administrative_add_note
  ) values (
    event_row.id,
    player_row.id,
    player_row.screen_name,
    'registered',
    'admin_exception',
    now(),
    actor_user,
    actor_player,
    actor_name,
    normalized_note
  )
  returning * into saved_entry;

  insert into public.major_entry_participation_audit (
    major_event_id,
    entry_id,
    player_id,
    action,
    previous_status,
    next_status,
    reason,
    actor_user_id,
    actor_player_id,
    actor_screen_name_snapshot,
    room_changes
  ) values (
    event_row.id,
    saved_entry.id,
    saved_entry.player_id,
    'admin_add',
    'not_entered',
    saved_entry.status,
    normalized_note,
    actor_user,
    actor_player,
    actor_name,
    '[]'::jsonb
  );

  return jsonb_build_object(
    'entry', to_jsonb(saved_entry),
    'signup_open', event_row.signup_open,
    'requires_scheduling', true,
    'selected_time_count', 0,
    'room_assignment_count', 0
  );
end
$function$;

revoke all on function public.admin_add_major_entrant_exception(uuid, uuid, text)
from public, anon, authenticated;
grant execute on function public.admin_add_major_entrant_exception(uuid, uuid, text) to authenticated;

create or replace function public.admin_register_major_player(
  p_major_event_id uuid,
  p_player_id uuid
)
returns public.major_entries
language plpgsql
security definer
set search_path to ''
as $function$
declare
  result jsonb;
  saved public.major_entries%rowtype;
begin
  result := public.admin_add_major_entrant_exception(p_major_event_id, p_player_id, null);
  select *
  into strict saved
  from public.major_entries
  where id = (result->'entry'->>'id')::uuid;
  return saved;
end
$function$;

revoke all on function public.admin_register_major_player(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.admin_register_major_player(uuid, uuid) to authenticated;

create or replace function public.admin_set_major_entry_participation(
  p_entry_id uuid,
  p_action text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  current_entry public.major_entries%rowtype;
  saved_entry public.major_entries%rowtype;
  actor_user uuid;
  actor_player uuid;
  actor_name text;
  normalized_action text;
  normalized_reason text;
  restore_status text;
  room_state record;
  score_activity boolean;
  remaining_active_players integer;
  room_changes jsonb := '[]'::jsonb;
begin
  actor_user := auth.uid();
  if actor_user is null or not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required.' using errcode = '42501';
  end if;

  normalized_action := lower(btrim(coalesce(p_action, '')));
  if normalized_action not in ('withdraw', 'reactivate') then
    raise exception 'Masters participation action must be withdraw or reactivate.' using errcode = '22023';
  end if;
  normalized_reason := nullif(btrim(coalesce(p_reason, '')), '');

  select *
  into current_entry
  from public.major_entries
  where id = p_entry_id
  for update;

  if not found then
    raise exception 'Major entry not found.';
  end if;

  actor_player := public.current_major_player_id();
  select p.screen_name
  into actor_name
  from public.players p
  where p.id = actor_player;
  actor_name := coalesce(
    nullif(btrim(actor_name), ''),
    nullif(btrim(auth.jwt()->'user_metadata'->>'full_name'), ''),
    nullif(btrim(auth.jwt()->'user_metadata'->>'name'), ''),
    actor_user::text
  );

  if normalized_action = 'withdraw' then
    if current_entry.status = 'withdrawn' then
      return jsonb_build_object('entry', to_jsonb(current_entry), 'room_changes', room_changes, 'unchanged', true);
    end if;
    if current_entry.status not in ('registered', 'confirmed') then
      raise exception 'Only an active registered or confirmed Masters entrant may be withdrawn.' using errcode = '22023';
    end if;

    update public.major_entries
    set status = 'withdrawn',
        withdrawn_from_status = current_entry.status,
        withdrawn_at = now(),
        withdrawn_by_user_id = actor_user,
        withdrawn_by_player_id = actor_player,
        withdrawn_by_screen_name_snapshot = actor_name,
        withdrawal_reason = normalized_reason,
        updated_at = now()
    where id = current_entry.id
    returning * into saved_entry;

    for room_state in
      select membership.group_id,
             membership.play_day_id,
             membership.time_slot_id,
             room.group_label,
             room.is_published,
             room.is_finalized,
             slot.starts_at
      from public.major_schedule_group_members membership
      join public.major_schedule_groups room on room.id = membership.group_id
      join public.major_time_slots slot on slot.id = membership.time_slot_id
      where membership.entry_id = current_entry.id
      order by slot.starts_at, membership.group_id
      for update of room
    loop
      select
        exists (
          select 1
          from public.major_player_scorecards card
          join public.major_schedule_group_members card_member
            on card_member.entry_id = card.entry_id
           and card_member.play_day_id = card.play_day_id
          where card_member.group_id = room_state.group_id
        )
        or exists (
          select 1
          from public.major_room_scorecard_proofs proof
          where proof.schedule_group_id = room_state.group_id
        )
      into score_activity;

      if room_state.starts_at <= now() or score_activity then
        room_changes := room_changes || jsonb_build_array(jsonb_build_object(
          'group_id', room_state.group_id,
          'group_label', room_state.group_label,
          'action', 'history_preserved',
          'reason', case when score_activity then 'score_activity' else 'room_started' end
        ));
        continue;
      end if;

      delete from public.major_schedule_group_members
      where group_id = room_state.group_id
        and entry_id = current_entry.id;

      select count(*)::integer
      into remaining_active_players
      from public.major_schedule_group_members remaining_member
      join public.major_entries remaining_entry on remaining_entry.id = remaining_member.entry_id
      where remaining_member.group_id = room_state.group_id
        and remaining_entry.status in ('registered', 'confirmed');

      if remaining_active_players < 2 then
        update public.major_schedule_groups
        set is_finalized = false,
            is_published = false,
            updated_at = now()
        where id = room_state.group_id;
      end if;

      room_changes := room_changes || jsonb_build_array(jsonb_build_object(
        'group_id', room_state.group_id,
        'group_label', room_state.group_label,
        'action', 'withdrawn_player_removed',
        'active_players_remaining', remaining_active_players,
        'room_state', case
          when remaining_active_players < 2 then 'needs_player_solo_play_not_allowed'
          else 'playable'
        end,
        'publication_cleared', remaining_active_players < 2
      ));
    end loop;

    insert into public.major_entry_participation_audit (
      major_event_id,
      entry_id,
      player_id,
      action,
      previous_status,
      next_status,
      reason,
      actor_user_id,
      actor_player_id,
      actor_screen_name_snapshot,
      room_changes
    ) values (
      current_entry.major_event_id,
      current_entry.id,
      current_entry.player_id,
      'withdraw',
      current_entry.status,
      saved_entry.status,
      normalized_reason,
      actor_user,
      actor_player,
      actor_name,
      room_changes
    );
  else
    if current_entry.status <> 'withdrawn' then
      return jsonb_build_object('entry', to_jsonb(current_entry), 'room_changes', room_changes, 'unchanged', true);
    end if;

    restore_status := case
      when current_entry.withdrawn_from_status in ('registered', 'confirmed') then current_entry.withdrawn_from_status
      else 'registered'
    end;

    update public.major_entries
    set status = restore_status,
        withdrawn_from_status = null,
        withdrawn_at = null,
        withdrawn_by_user_id = null,
        withdrawn_by_player_id = null,
        withdrawn_by_screen_name_snapshot = null,
        withdrawal_reason = null,
        updated_at = now()
    where id = current_entry.id
    returning * into saved_entry;

    insert into public.major_entry_participation_audit (
      major_event_id,
      entry_id,
      player_id,
      action,
      previous_status,
      next_status,
      reason,
      actor_user_id,
      actor_player_id,
      actor_screen_name_snapshot,
      room_changes
    ) values (
      current_entry.major_event_id,
      current_entry.id,
      current_entry.player_id,
      'reactivate',
      current_entry.status,
      saved_entry.status,
      normalized_reason,
      actor_user,
      actor_player,
      actor_name,
      room_changes
    );
  end if;

  return jsonb_build_object('entry', to_jsonb(saved_entry), 'room_changes', room_changes, 'unchanged', false);
end
$function$;

revoke all on function public.admin_set_major_entry_participation(uuid, text, text)
from public, anon, authenticated;
grant execute on function public.admin_set_major_entry_participation(uuid, text, text) to authenticated;

create or replace function public.set_major_entry_status(p_entry_id uuid, p_status text)
returns public.major_entries
language plpgsql
security definer
set search_path to ''
as $function$
declare
  current_entry public.major_entries%rowtype;
  saved public.major_entries%rowtype;
begin
  if auth.uid() is null or not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required.' using errcode = '42501';
  end if;
  if p_status not in ('registered', 'confirmed', 'waitlisted', 'withdrawn', 'declined') then
    raise exception 'Invalid Major entry status.' using errcode = '22023';
  end if;

  select * into current_entry
  from public.major_entries
  where id = p_entry_id
  for update;
  if not found then
    raise exception 'Major entry not found.';
  end if;

  if current_entry.status = 'withdrawn' or p_status = 'withdrawn' then
    raise exception 'Withdrawal and reactivation require the audited Masters participation action.' using errcode = '22023';
  end if;

  update public.major_entries
  set status = p_status,
      updated_at = now()
  where id = p_entry_id
  returning * into saved;
  return saved;
end
$function$;

revoke all on function public.set_major_entry_status(uuid, text) from public, anon, authenticated;
grant execute on function public.set_major_entry_status(uuid, text) to authenticated;

create or replace function public.admin_set_major_day_choice(
  p_entry_id uuid,
  p_play_day_id uuid,
  p_time_slot_id uuid
)
returns public.major_entry_day_choices
language plpgsql
security definer
set search_path to ''
as $function$
declare
  saved public.major_entry_day_choices%rowtype;
  event_id uuid;
begin
  if auth.uid() is null or not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required.' using errcode = '42501';
  end if;

  select entry.major_event_id
  into event_id
  from public.major_entries entry
  where entry.id = p_entry_id
    and entry.status in ('registered', 'confirmed');

  if event_id is null then
    raise exception 'Only an active Masters entrant may receive an administrative time assignment.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.major_play_days day
    where day.id = p_play_day_id and day.major_event_id = event_id
  ) or not exists (
    select 1 from public.major_time_slots slot
    where slot.id = p_time_slot_id and slot.play_day_id = p_play_day_id
  ) then
    raise exception 'Entry, day, and time slot must belong to the same Major.';
  end if;

  delete from public.major_schedule_group_members
  where entry_id = p_entry_id
    and play_day_id = p_play_day_id;

  insert into public.major_entry_day_choices(entry_id, play_day_id, time_slot_id)
  values (p_entry_id, p_play_day_id, p_time_slot_id)
  on conflict (entry_id, play_day_id) do update
  set time_slot_id = excluded.time_slot_id,
      selected_at = now(),
      updated_at = now()
  returning * into saved;

  return saved;
end
$function$;

revoke all on function public.admin_set_major_day_choice(uuid, uuid, uuid)
from public, anon, authenticated;
grant execute on function public.admin_set_major_day_choice(uuid, uuid, uuid) to authenticated;

create or replace function public.save_major_schedule_group(
  p_id uuid,
  p_major_event_id uuid,
  p_play_day_id uuid,
  p_time_slot_id uuid,
  p_group_label text,
  p_competition text,
  p_location text,
  p_instructions text,
  p_admin_notes text,
  p_is_finalized boolean,
  p_is_published boolean,
  p_entry_ids uuid[]
)
returns public.major_schedule_groups
language plpgsql
security definer
set search_path to ''
as $function$
declare
  saved public.major_schedule_groups%rowtype;
  existing_group public.major_schedule_groups%rowtype;
  member_id uuid;
  member_count integer;
  protected_history boolean := false;
begin
  if auth.uid() is null or not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required.' using errcode = '42501';
  end if;
  if nullif(btrim(p_group_label), '') is null then
    raise exception 'A room/group label is required.';
  end if;
  if p_competition not in ('qualifying', 'main', 'secondary') then
    raise exception 'Invalid room competition.';
  end if;
  member_count := cardinality(coalesce(p_entry_ids, array[]::uuid[]));
  if member_count not between 1 and 4 then
    raise exception 'Masters rooms require 1 to 4 players.' using errcode = '22023';
  end if;
  if cardinality(p_entry_ids) <> (select count(distinct entry_id) from unnest(p_entry_ids) as entry_id) then
    raise exception 'A player may appear only once in a Masters room.' using errcode = '22023';
  end if;
  if member_count = 1 and (coalesce(p_is_finalized, false) or coalesce(p_is_published, false)) then
    raise exception 'A one-player Masters room is incomplete and may only be saved privately without finalizing.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.major_play_days where id = p_play_day_id and major_event_id = p_major_event_id
  ) or not exists (
    select 1 from public.major_time_slots where id = p_time_slot_id and play_day_id = p_play_day_id
  ) then
    raise exception 'Room day and time must belong to the selected Major.';
  end if;

  if p_id is not null then
    select *
    into existing_group
    from public.major_schedule_groups
    where id = p_id
      and major_event_id = p_major_event_id
    for update;

    if found then
      select
        slot.starts_at <= now()
        or exists (
          select 1
          from public.major_player_scorecards card
          join public.major_schedule_group_members card_member
            on card_member.entry_id = card.entry_id
           and card_member.play_day_id = card.play_day_id
          where card_member.group_id = existing_group.id
        )
        or exists (
          select 1
          from public.major_room_scorecard_proofs proof
          where proof.schedule_group_id = existing_group.id
        )
      into protected_history
      from public.major_time_slots slot
      where slot.id = existing_group.time_slot_id;

      if protected_history then
        raise exception 'A started Masters room or room with score activity has protected history. Use instruction-only republish for instructions.' using errcode = '22023';
      end if;
    end if;
  end if;

  insert into public.major_schedule_groups (
    id,
    major_event_id,
    play_day_id,
    time_slot_id,
    group_label,
    competition,
    location,
    instructions,
    admin_notes,
    is_finalized,
    is_published
  ) values (
    coalesce(p_id, gen_random_uuid()),
    p_major_event_id,
    p_play_day_id,
    p_time_slot_id,
    btrim(p_group_label),
    p_competition,
    nullif(btrim(p_location), ''),
    nullif(btrim(p_instructions), ''),
    nullif(btrim(p_admin_notes), ''),
    coalesce(p_is_finalized, false),
    coalesce(p_is_published, false)
  )
  on conflict (id) do update
  set play_day_id = excluded.play_day_id,
      time_slot_id = excluded.time_slot_id,
      group_label = excluded.group_label,
      competition = excluded.competition,
      location = excluded.location,
      instructions = excluded.instructions,
      admin_notes = excluded.admin_notes,
      is_finalized = excluded.is_finalized,
      is_published = excluded.is_published,
      updated_at = now()
  where public.major_schedule_groups.major_event_id = p_major_event_id
  returning * into saved;

  if saved.id is null then
    raise exception 'Room/group does not belong to this Major.';
  end if;

  delete from public.major_schedule_group_members where group_id = saved.id;
  foreach member_id in array p_entry_ids loop
    if not exists (
      select 1
      from public.major_entries entry
      join public.major_entry_day_choices choice on choice.entry_id = entry.id
      where entry.id = member_id
        and entry.major_event_id = p_major_event_id
        and entry.status in ('registered', 'confirmed')
        and choice.play_day_id = p_play_day_id
        and choice.time_slot_id = p_time_slot_id
    ) then
      raise exception 'Every assigned player must be active, registered, and currently selected for this room time.';
    end if;
    if p_competition in ('main', 'secondary') and not exists (
      select 1
      from public.major_entry_weekend_status weekend
      where weekend.entry_id = member_id
        and weekend.competition_status = p_competition
    ) then
      raise exception 'Weekend room assignments must match each player''s staged weekend-field status.';
    end if;
    insert into public.major_schedule_group_members (
      group_id,
      major_event_id,
      play_day_id,
      time_slot_id,
      entry_id
    ) values (
      saved.id,
      p_major_event_id,
      p_play_day_id,
      p_time_slot_id,
      member_id
    );
  end loop;
  return saved;
end
$function$;

revoke all on function public.save_major_schedule_group(uuid, uuid, uuid, uuid, text, text, text, text, text, boolean, boolean, uuid[])
from public, anon, authenticated;
grant execute on function public.save_major_schedule_group(uuid, uuid, uuid, uuid, text, text, text, text, text, boolean, boolean, uuid[])
to authenticated;

create or replace function public.delete_major_schedule_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  protected_history boolean;
begin
  if auth.uid() is null or not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required.' using errcode = '42501';
  end if;

  select
    slot.starts_at <= now()
    or exists (
      select 1
      from public.major_player_scorecards card
      join public.major_schedule_group_members card_member
        on card_member.entry_id = card.entry_id
       and card_member.play_day_id = card.play_day_id
      where card_member.group_id = room.id
    )
    or exists (
      select 1
      from public.major_room_scorecard_proofs proof
      where proof.schedule_group_id = room.id
    )
  into protected_history
  from public.major_schedule_groups room
  join public.major_time_slots slot on slot.id = room.time_slot_id
  where room.id = p_group_id
  for update of room;

  if not found then
    raise exception 'Masters room was not found.';
  end if;
  if protected_history then
    raise exception 'A started Masters room or room with score activity has protected history and cannot be deleted.' using errcode = '22023';
  end if;

  delete from public.major_schedule_groups where id = p_group_id;
end
$function$;

revoke all on function public.delete_major_schedule_group(uuid) from public, anon, authenticated;
grant execute on function public.delete_major_schedule_group(uuid) to authenticated;

create or replace function public.get_my_major_signup_schedule(p_major_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  provider_id text;
  matched_player_id uuid;
  matched_count integer;
begin
  if auth.uid() is null
     or (
       coalesce(auth.jwt()->'app_metadata'->>'provider', '') <> 'discord'
       and not (coalesce(auth.jwt()->'app_metadata'->'providers', '[]'::jsonb) ? 'discord')
     ) then
    return '[]'::jsonb;
  end if;

  provider_id := coalesce(
    nullif(btrim(auth.jwt()->'user_metadata'->>'provider_id'), ''),
    nullif(btrim(auth.jwt()->'user_metadata'->>'sub'), '')
  );
  if provider_id is null then
    return '[]'::jsonb;
  end if;

  select count(*)
  into matched_count
  from public.players player
  where player.discord_id = provider_id;

  if matched_count <> 1 then
    return '[]'::jsonb;
  end if;

  select player.id
  into strict matched_player_id
  from public.players player
  where player.discord_id = provider_id;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', choice.id,
        'entry_id', choice.entry_id,
        'play_day_id', choice.play_day_id,
        'time_slot_id', choice.time_slot_id,
        'assignment_location', case
          when day.day_number <= 2 or event.weekend_status_published_at is not null
            then coalesce(room.location, choice.assignment_location)
          else null
        end,
        'starts_at', slot.starts_at,
        'slot_label', slot.label,
        'selection_locks_at', day.selection_locks_at,
        'is_locked', day.choices_locked
          or (day.selection_locks_at is not null and now() >= day.selection_locks_at),
        'weekend_competition_status', case
          when event.weekend_status_published_at is null then 'pending'
          else coalesce(weekend.competition_status, 'pending')
        end,
        'group_label', case
          when day.day_number <= 2 or event.weekend_status_published_at is not null then room.group_label
          else null
        end,
        'group_competition', case
          when day.day_number <= 2 or event.weekend_status_published_at is not null then room.competition
          else null
        end,
        'group_instructions', case
          when day.day_number <= 2 or event.weekend_status_published_at is not null then room.instructions
          else null
        end,
        'room_roster', case
          when room.id is not null
           and (day.day_number <= 2 or event.weekend_status_published_at is not null)
          then coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'player_id', room_entry.player_id,
                'player_screen_name_snapshot', room_entry.player_screen_name_snapshot
              )
              order by room_entry.player_screen_name_snapshot, room_entry.player_id
            )
            from public.major_schedule_group_members room_member
            join public.major_entries room_entry on room_entry.id = room_member.entry_id
            where room_member.group_id = room.id
              and room_member.major_event_id = event.id
          ), '[]'::jsonb)
          else '[]'::jsonb
        end
      )
      order by day.day_number
    )
    from public.major_entries entry
    join public.major_events event on event.id = entry.major_event_id
    join public.major_entry_day_choices choice on choice.entry_id = entry.id
    join public.major_play_days day on day.id = choice.play_day_id
    join public.major_time_slots slot on slot.id = choice.time_slot_id
    left join public.major_entry_weekend_status weekend on weekend.entry_id = entry.id
    left join public.major_schedule_group_members membership
      on membership.entry_id = entry.id
     and membership.play_day_id = day.id
    left join public.major_schedule_groups room
      on room.id = membership.group_id
     and room.major_event_id = event.id
     and room.is_published
    where entry.major_event_id = p_major_event_id
      and entry.player_id = matched_player_id
      and entry.status in ('registered', 'confirmed')
  ), '[]'::jsonb);
end
$function$;

revoke all on function public.get_my_major_signup_schedule(uuid) from public, anon, authenticated;
grant execute on function public.get_my_major_signup_schedule(uuid) to authenticated;

commit;

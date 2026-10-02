-- Masters weekend scheduling and competition classification are independent.
-- Admins may prepare private Round 3 / Final Round rooms before the weekend
-- field is classified. Publication still requires every assigned weekend
-- player to have a staged player-specific classification.

create or replace function public.validate_major_group_member_row()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if not exists (
    select 1
    from public.major_schedule_groups room
    join public.major_entries entry
      on entry.id = new.entry_id
     and entry.major_event_id = new.major_event_id
    join public.major_entry_day_choices choice
      on choice.entry_id = entry.id
     and choice.play_day_id = new.play_day_id
     and choice.time_slot_id = new.time_slot_id
    where room.id = new.group_id
      and room.major_event_id = new.major_event_id
      and room.play_day_id = new.play_day_id
      and room.time_slot_id = new.time_slot_id
  ) then
    raise exception 'Assigned player must belong to the Major and currently select the room time.';
  end if;

  return new;
end
$function$;

create or replace function public.set_major_weekend_status(p_entry_id uuid, p_status text)
returns public.major_entry_weekend_status
language plpgsql
security definer
set search_path to ''
as $function$
declare
  saved public.major_entry_weekend_status%rowtype;
  event_id uuid;
begin
  if not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required.' using errcode = '42501';
  end if;
  if p_status not in ('pending', 'main', 'secondary') then
    raise exception 'Weekend status must be pending, main, or secondary.';
  end if;
  if exists (
    select 1
    from public.major_final_placements result
    where result.entry_id = p_entry_id
      and result.is_finalized
      and result.weekend_field is distinct from p_status
  ) then
    raise exception 'A finalized Major result prevents changing this player''s weekend field.';
  end if;

  select major_event_id
  into event_id
  from public.major_entries
  where id = p_entry_id;

  if event_id is null then
    raise exception 'Major entry not found.';
  end if;

  insert into public.major_entry_weekend_status (
    entry_id,
    major_event_id,
    competition_status,
    decided_at,
    decided_by
  ) values (
    p_entry_id,
    event_id,
    p_status,
    case when p_status = 'pending' then null else now() end,
    case when p_status = 'pending' then null else auth.uid() end
  )
  on conflict (entry_id) do update
  set competition_status = excluded.competition_status,
      decided_at = excluded.decided_at,
      decided_by = excluded.decided_by,
      updated_at = now()
  returning * into saved;

  update public.major_final_placements
  set weekend_field = case when p_status = 'pending' then null else p_status end,
      field_placement = case
        when weekend_field is distinct from case when p_status = 'pending' then null else p_status end then null
        else field_placement
      end,
      result_status = case
        when weekend_field is distinct from case when p_status = 'pending' then null else p_status end then 'pending'
        else result_status
      end,
      is_tied = case
        when weekend_field is distinct from case when p_status = 'pending' then null else p_status end then false
        else is_tied
      end,
      is_winner = case
        when weekend_field is distinct from case when p_status = 'pending' then null else p_status end then false
        else is_winner
      end
  where entry_id = p_entry_id
    and not is_finalized;

  return saved;
end
$function$;

revoke all on function public.set_major_weekend_status(uuid, text)
from public, anon, authenticated;
grant execute on function public.set_major_weekend_status(uuid, text) to authenticated;

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
  play_day_number integer;
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
  if cardinality(p_entry_ids) <> (
    select count(distinct entry_id) from unnest(p_entry_ids) as entry_id
  ) then
    raise exception 'A player may appear only once in a Masters room.' using errcode = '22023';
  end if;
  if member_count = 1 and (coalesce(p_is_finalized, false) or coalesce(p_is_published, false)) then
    raise exception 'A one-player Masters room is incomplete and may only be saved privately without finalizing.' using errcode = '22023';
  end if;

  select day.day_number
  into play_day_number
  from public.major_play_days day
  join public.major_time_slots slot
    on slot.play_day_id = day.id
   and slot.id = p_time_slot_id
  where day.id = p_play_day_id
    and day.major_event_id = p_major_event_id;

  if play_day_number is null then
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
  foreach member_id in array coalesce(p_entry_ids, array[]::uuid[]) loop
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

    if coalesce(p_is_published, false)
      and play_day_number > 2
      and not exists (
        select 1
        from public.major_entry_weekend_status weekend
        where weekend.entry_id = member_id
          and weekend.major_event_id = p_major_event_id
          and weekend.competition_status in ('main', 'secondary')
      )
    then
      raise exception 'Weekend rooms may be published only after every assigned player has a staged competition classification.' using errcode = '22023';
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

comment on function public.save_major_schedule_group(uuid, uuid, uuid, uuid, text, text, text, text, text, boolean, boolean, uuid[])
is 'Saves Masters physical rooms independently of player-specific weekend competition classification; weekend publication still requires every assigned player to be classified.';

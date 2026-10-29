begin;

create table if not exists public.major_entry_day_choice_audit (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.major_entries(id),
  major_event_id uuid not null references public.major_events(id),
  play_day_id uuid not null references public.major_play_days(id),
  previous_time_slot_id uuid references public.major_time_slots(id),
  new_time_slot_id uuid not null references public.major_time_slots(id),
  actor_user_id uuid not null,
  action text not null default 'admin_override',
  reason text not null default 'Administrator scheduling override via admin_set_major_day_choice',
  created_at timestamptz not null default now()
);

create index if not exists major_entry_day_choice_audit_entry_idx
  on public.major_entry_day_choice_audit(entry_id, created_at desc);
create index if not exists major_entry_day_choice_audit_event_idx
  on public.major_entry_day_choice_audit(major_event_id, created_at desc);

alter table public.major_entry_day_choice_audit enable row level security;
revoke all on table public.major_entry_day_choice_audit from public, anon, authenticated;
grant select on table public.major_entry_day_choice_audit to service_role;
grant select on table public.major_entry_day_choice_audit to authenticated;

do $policy$
begin
  if not exists (
    select 1
    from pg_policy p
    where p.polrelid = 'public.major_entry_day_choice_audit'::regclass
      and p.polname = 'krys_admin_major_entry_day_choice_audit_read_v1'
  ) then
    execute 'create policy krys_admin_major_entry_day_choice_audit_read_v1
      on public.major_entry_day_choice_audit
      for select
      to authenticated
      using (public.is_current_user_site_admin())';
  end if;
end
$policy$;

create or replace function public.guard_major_day_choice_lock()
returns trigger language plpgsql security definer set search_path to '' as $function$
declare
  old_starts_at timestamptz;
  new_starts_at timestamptz;
  admin_override boolean := public.is_current_user_site_admin();
begin
  select s.starts_at into new_starts_at
  from public.major_time_slots s
  where s.id = new.time_slot_id and s.play_day_id = new.play_day_id and s.is_available;
  if new_starts_at is null then raise exception 'The selected time slot is not available.'; end if;

  if tg_op = 'UPDATE' then
    select s.starts_at into old_starts_at
    from public.major_time_slots s where s.id = old.time_slot_id;
  end if;

  if not admin_override
     and (tg_op = 'INSERT' or new.time_slot_id is distinct from old.time_slot_id)
     and new_starts_at <= now() then
    raise exception 'Players cannot move into a started or past time slot.';
  end if;

  if not admin_override
     and tg_op = 'UPDATE'
     and new.time_slot_id is distinct from old.time_slot_id
     and old_starts_at is not null
     and now() >= old_starts_at - interval '12 hours' then
    raise exception 'This selected time slot is locked for player changes 12 hours before it starts.';
  end if;

  if admin_override
     and (tg_op = 'INSERT' or new.time_slot_id is distinct from old.time_slot_id) then
    insert into public.major_entry_day_choice_audit(
      entry_id,
      major_event_id,
      play_day_id,
      previous_time_slot_id,
      new_time_slot_id,
      actor_user_id,
      action,
      reason
    )
    select
      new.entry_id,
      e.major_event_id,
      new.play_day_id,
      case when tg_op = 'UPDATE' then old.time_slot_id else null end,
      new.time_slot_id,
      auth.uid(),
      'admin_override',
      'Administrator scheduling override via admin_set_major_day_choice'
    from public.major_entries e
    where e.id = new.entry_id;
  end if;

  return new;
end
$function$;

do $verification$
begin
  if not exists (
    select 1
    from pg_trigger t
    where t.tgrelid = 'public.major_entry_day_choices'::regclass
      and t.tgname = 'major_choices_guard_day_lock'
      and not t.tgisinternal
  ) then
    raise exception 'Required major_entry_day_choices lock trigger is missing.';
  end if;
end
$verification$;

revoke all on function public.guard_major_day_choice_lock() from public, anon, authenticated;

create or replace function public.signup_for_major_with_slots(
  p_major_event_id uuid, p_time_slot_ids uuid[]
)
returns public.major_entries
language plpgsql security definer set search_path to '' as $function$
declare
  provider_id text;
  matched_player public.players%rowtype;
  matched_count integer;
  saved_entry public.major_entries%rowtype;
  signup_event public.major_events%rowtype;
  day_row record;
  selected_slot uuid;
  claimed_count integer;
  guaranteed_capacity integer;
begin
  if auth.uid() is null then raise exception 'You must sign in with Discord.'; end if;
  if coalesce(auth.jwt()->'app_metadata'->>'provider','') <> 'discord'
     and not (coalesce(auth.jwt()->'app_metadata'->'providers','[]'::jsonb) ? 'discord') then
    raise exception 'A linked Discord identity is required.';
  end if;
  select i.provider_id
  into provider_id
  from auth.identities i
  where i.user_id = auth.uid()
    and i.provider = 'discord'
  order by i.last_sign_in_at desc nulls last, i.created_at desc nulls last
  limit 1;
  if provider_id is null then raise exception 'Discord identity could not be verified.'; end if;
  select count(*) into matched_count from public.players where discord_id = provider_id;
  if matched_count = 0 then raise exception 'No player is linked to this Discord account.'; end if;
  if matched_count > 1 then raise exception 'This Discord account matches multiple players. Contact an administrator.'; end if;
  select * into strict matched_player from public.players where discord_id = provider_id;

  select * into signup_event from public.major_events where id = p_major_event_id and signup_open for update;
  if not found then raise exception 'Signup is not open for this Major.'; end if;
  if signup_event.is_test_event then
    if not exists(select 1 from public.major_test_event_testers where major_event_id = p_major_event_id and player_id = matched_player.id) then
      raise exception 'This TEST event is limited to trusted testers.' using errcode='42501';
    end if;
  elsif not signup_event.is_public then
    raise exception 'Signup is not open for this Major.';
  end if;

  if signup_event.public_signup_opens_at is not null and now() < signup_event.public_signup_opens_at then
    if not signup_event.priority_signup_enabled
       or signup_event.priority_signup_opens_at is null
       or now() < signup_event.priority_signup_opens_at
       or signup_event.priority_source_event_id is null
       or not exists(
         select 1 from public.major_final_placements placement
         where placement.major_event_id = signup_event.priority_source_event_id
           and placement.player_id = matched_player.id
           and placement.weekend_field = 'main'
           and placement.field_placement between 1 and 10
           and placement.result_status = 'completed'
           and placement.is_finalized
       ) then
      raise exception 'Public signup has not opened yet.';
    end if;
  end if;

  if signup_event.public_signup_opens_at is not null and now() >= signup_event.public_signup_opens_at and signup_event.public_capacity_adjusted_at is null then
    select count(*) into claimed_count from public.major_entries where major_event_id = p_major_event_id and status in ('registered','confirmed');
    guaranteed_capacity := greatest(signup_event.signup_capacity, claimed_count + coalesce(signup_event.minimum_public_spots_at_open, 0));
    if guaranteed_capacity > 100 then raise exception 'The configured public-opening guarantee would exceed the 100-player hard maximum.'; end if;
    perform set_config('app.major_capacity_operation','public_opening',true);
    update public.major_events set signup_capacity = guaranteed_capacity, public_capacity_adjusted_at = now()
    where id = p_major_event_id returning * into signup_event;
  end if;

  select count(*) into claimed_count from public.major_entries
  where major_event_id = p_major_event_id and status in ('registered','confirmed') and player_id <> matched_player.id;
  if claimed_count >= signup_event.signup_capacity then raise exception 'This Major has reached its currently released capacity.'; end if;
  if (select count(*) from public.major_play_days where major_event_id = p_major_event_id) <> 4 then raise exception 'All four tournament days must be configured before signup.'; end if;
  if coalesce(array_length(p_time_slot_ids,1),0) <> 4 or (select count(distinct x) from unnest(p_time_slot_ids) x) <> 4 then raise exception 'Choose exactly one time for each of the four days.'; end if;

  insert into public.major_entries(major_event_id, player_id, player_screen_name_snapshot)
  values (p_major_event_id, matched_player.id, matched_player.screen_name)
  on conflict(major_event_id, player_id) do update
    set player_screen_name_snapshot = excluded.player_screen_name_snapshot, updated_at = now()
  returning * into saved_entry;
  if saved_entry.status in ('withdrawn','declined') then raise exception 'Contact an administrator before changing this entry.'; end if;

  for day_row in select * from public.major_play_days where major_event_id = p_major_event_id order by day_number loop
    select s.id into selected_slot from public.major_time_slots s
    where s.id = any(p_time_slot_ids) and s.play_day_id = day_row.id and s.is_available for update;
    if selected_slot is null then raise exception 'Choose one available time for Day %.', day_row.day_number; end if;
    insert into public.major_entry_day_choices(entry_id, play_day_id, time_slot_id)
    values (saved_entry.id, day_row.id, selected_slot)
    on conflict(entry_id, play_day_id) do update
      set time_slot_id = excluded.time_slot_id, selected_at = now(), updated_at = now();
    selected_slot := null;
  end loop;

  insert into public.major_entry_weekend_status(entry_id, major_event_id)
  values (saved_entry.id, p_major_event_id) on conflict(entry_id) do nothing;
  return saved_entry;
end
$function$;

revoke all on function public.signup_for_major_with_slots(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.signup_for_major_with_slots(uuid, uuid[]) to authenticated;

commit;

-- Staging-only owner-managed VIP list for THE MGA CHAMPIONSHIP.
-- The list is canonical-player keyed and does not modify Masters results.

begin;

create table if not exists public.major_owner_vip_list_entries (
  major_event_id uuid not null references public.major_events(id) on delete restrict,
  player_id uuid not null references public.players(id) on delete restrict,
  is_active boolean not null default true,
  added_at timestamptz not null default now(),
  added_by uuid references auth.users(id) on delete set null,
  removed_at timestamptz,
  removed_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (major_event_id, player_id)
);

create index if not exists major_owner_vip_list_active_idx
  on public.major_owner_vip_list_entries(major_event_id, is_active, player_id);

create table if not exists public.major_owner_vip_list_audit (
  id uuid primary key default gen_random_uuid(),
  major_event_id uuid not null references public.major_events(id) on delete restrict,
  player_id uuid not null references public.players(id) on delete restrict,
  action text not null check (action in ('added', 'removed')),
  changed_at timestamptz not null default now(),
  changed_by uuid references auth.users(id) on delete set null
);

create index if not exists major_owner_vip_list_audit_event_idx
  on public.major_owner_vip_list_audit(major_event_id, changed_at desc);

alter table public.major_owner_vip_list_entries enable row level security;
alter table public.major_owner_vip_list_audit enable row level security;
revoke all on table public.major_owner_vip_list_entries, public.major_owner_vip_list_audit from public, anon, authenticated;
grant all on table public.major_owner_vip_list_entries, public.major_owner_vip_list_audit to service_role;

create or replace function public.is_current_user_major_vip_owner()
returns boolean
language plpgsql stable security definer set search_path to '' as $function$
declare
  provider_id text;
  matched_count integer;
begin
  if auth.uid() is null then return false; end if;
  if coalesce(auth.jwt()->'app_metadata'->>'provider','') <> 'discord'
     and not (coalesce(auth.jwt()->'app_metadata'->'providers','[]'::jsonb) ? 'discord') then
    return false;
  end if;

  select i.provider_id into provider_id
  from auth.identities i
  where i.user_id = auth.uid() and i.provider = 'discord'
  order by i.last_sign_in_at desc nulls last, i.created_at desc nulls last
  limit 1;

  if provider_id is null then return false; end if;
  select count(*) into matched_count
  from public.players p
  where p.discord_id = provider_id
    and public.resolve_canonical_player_id(p.id) = p.id
    and coalesce(p.profile_badges, array[]::text[]) @> array['Owner']::text[];
  return matched_count = 1;
end;
$function$;

revoke all on function public.is_current_user_major_vip_owner() from public, anon;
grant execute on function public.is_current_user_major_vip_owner() to authenticated;

create or replace function public.get_major_owner_vip_list(p_major_event_id uuid)
returns table(
  player_id uuid,
  player_screen_name text,
  added_at timestamptz,
  added_by uuid
)
language plpgsql stable security definer set search_path to '' as $function$
begin
  if not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required.' using errcode='42501';
  end if;

  return query
  select entry.player_id, player.screen_name, entry.added_at, entry.added_by
  from public.major_owner_vip_list_entries entry
  join public.players player on player.id = entry.player_id
  where entry.major_event_id = p_major_event_id and entry.is_active
  order by player.screen_name;
end;
$function$;

revoke all on function public.get_major_owner_vip_list(uuid) from public, anon;
grant execute on function public.get_major_owner_vip_list(uuid) to authenticated;

create or replace function public.set_major_owner_vip_list_entry(
  p_major_event_id uuid,
  p_player_id uuid,
  p_is_active boolean
)
returns public.major_owner_vip_list_entries
language plpgsql security definer set search_path to '' as $function$
declare
  current_entry public.major_owner_vip_list_entries%rowtype;
  saved_entry public.major_owner_vip_list_entries%rowtype;
  canonical_id uuid;
  event_slug text;
  event_name text;
begin
  if not public.is_current_user_major_vip_owner() then
    raise exception 'Only the designated owner may edit the MGA Championship VIP list.' using errcode='42501';
  end if;

  select slug, name into event_slug, event_name
  from public.major_events
  where id = p_major_event_id and not is_test_event;
  if event_slug is null or (event_slug <> 'major-2' and upper(btrim(event_name)) <> 'THE MGA CHAMPIONSHIP') then
    raise exception 'The owner-managed VIP list is only available for THE MGA CHAMPIONSHIP.';
  end if;

  canonical_id := public.resolve_canonical_player_id(p_player_id);
  if canonical_id is null or canonical_id is distinct from p_player_id then
    raise exception 'VIP entries must target an existing canonical Global Player UUID.';
  end if;
  if not exists (select 1 from public.players where id = p_player_id) then
    raise exception 'Canonical Global Player was not found.';
  end if;

  select * into current_entry
  from public.major_owner_vip_list_entries
  where major_event_id = p_major_event_id and player_id = p_player_id
  for update;

  if current_entry.player_id is null then
    insert into public.major_owner_vip_list_entries(
      major_event_id, player_id, is_active, added_at, added_by, removed_at, removed_by, updated_at
    ) values (
      p_major_event_id, p_player_id, coalesce(p_is_active, true),
      case when coalesce(p_is_active, true) then now() else now() end,
      case when coalesce(p_is_active, true) then auth.uid() else null end,
      case when coalesce(p_is_active, true) then null else now() end,
      case when coalesce(p_is_active, true) then null else auth.uid() end,
      now()
    ) returning * into saved_entry;
    if coalesce(p_is_active, true) then
      insert into public.major_owner_vip_list_audit(major_event_id, player_id, action, changed_by)
      values (p_major_event_id, p_player_id, 'added', auth.uid());
    end if;
    return saved_entry;
  end if;

  if current_entry.is_active is distinct from coalesce(p_is_active, true) then
    update public.major_owner_vip_list_entries
    set is_active = coalesce(p_is_active, true),
        added_at = case when coalesce(p_is_active, true) then now() else added_at end,
        added_by = case when coalesce(p_is_active, true) then auth.uid() else added_by end,
        removed_at = case when coalesce(p_is_active, true) then null else now() end,
        removed_by = case when coalesce(p_is_active, true) then null else auth.uid() end,
        updated_at = now()
    where major_event_id = p_major_event_id and player_id = p_player_id
    returning * into saved_entry;

    insert into public.major_owner_vip_list_audit(major_event_id, player_id, action, changed_by)
    values (p_major_event_id, p_player_id, case when p_is_active then 'added' else 'removed' end, auth.uid());
    return saved_entry;
  end if;

  return current_entry;
end;
$function$;

revoke all on function public.set_major_owner_vip_list_entry(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_major_owner_vip_list_entry(uuid, uuid, boolean) to authenticated;

-- Replace only THE MGA CHAMPIONSHIP's early-access check. Other Majors retain
-- their existing previous-Major priority source behavior.
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

  select i.provider_id into provider_id
  from auth.identities i
  where i.user_id = auth.uid() and i.provider = 'discord'
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
       or (
         (signup_event.slug = 'major-2' or upper(btrim(signup_event.name)) = 'THE MGA CHAMPIONSHIP')
         and not exists(
           select 1 from public.major_owner_vip_list_entries vip
           where vip.major_event_id = signup_event.id
             and vip.player_id = matched_player.id
             and vip.is_active
         )
       )
       or (
         signup_event.slug <> 'major-2'
         and upper(btrim(signup_event.name)) <> 'THE MGA CHAMPIONSHIP'
         and (
           signup_event.priority_source_event_id is null
           or not exists(
             select 1 from public.major_final_placements placement
             where placement.major_event_id = signup_event.priority_source_event_id
               and placement.player_id = matched_player.id
               and placement.weekend_field = 'main'
               and placement.field_placement between 1 and 10
               and placement.result_status = 'completed'
               and placement.is_finalized
           )
         )
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
  on conflict(major_event_id, player_id) do update set player_screen_name_snapshot = excluded.player_screen_name_snapshot, updated_at = now()
  returning * into saved_entry;
  if saved_entry.status in ('withdrawn','declined') then raise exception 'Contact an administrator before changing this entry.'; end if;

  for day_row in select * from public.major_play_days where major_event_id = p_major_event_id order by day_number loop
    select s.id into selected_slot from public.major_time_slots s
    where s.id = any(p_time_slot_ids) and s.play_day_id = day_row.id and s.is_available for update;
    if selected_slot is null then raise exception 'Choose one available time for Day %.', day_row.day_number; end if;
    insert into public.major_entry_day_choices(entry_id, play_day_id, time_slot_id)
    values (saved_entry.id, day_row.id, selected_slot)
    on conflict(entry_id, play_day_id) do update set time_slot_id = excluded.time_slot_id, selected_at = now(), updated_at = now();
    selected_slot := null;
  end loop;

  insert into public.major_entry_weekend_status(entry_id, major_event_id)
  values (saved_entry.id, p_major_event_id) on conflict(entry_id) do nothing;
  return saved_entry;
end;
$function$;

revoke all on function public.signup_for_major_with_slots(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.signup_for_major_with_slots(uuid, uuid[]) to authenticated;

commit;

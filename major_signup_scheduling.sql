-- Four-day Major signup scheduling. Safe to rerun after majors_foundation.sql.
alter table public.major_events add column if not exists signup_capacity integer not null default 50;
alter table public.major_events alter column signup_capacity set default 50;
update public.major_events set signup_capacity=50 where signup_capacity is null;
alter table public.major_events alter column signup_capacity set not null;
alter table public.major_events add column if not exists public_signup_opens_at timestamptz;
alter table public.major_events add column if not exists priority_signup_enabled boolean not null default false;
alter table public.major_events add column if not exists priority_signup_opens_at timestamptz;
alter table public.major_events add column if not exists priority_source_event_id uuid references public.major_events(id) on delete set null;
alter table public.major_events add column if not exists minimum_public_spots_at_open integer check (minimum_public_spots_at_open is null or minimum_public_spots_at_open > 0);
alter table public.major_events add column if not exists public_capacity_adjusted_at timestamptz;
alter table public.major_events add column if not exists later_release_used_at timestamptz;
alter table public.major_events add column if not exists later_release_spots integer check (later_release_spots is null or later_release_spots between 10 and 50);

do $$ begin
  if not exists (select 1 from pg_constraint where conname='major_events_priority_source_required') then
    alter table public.major_events add constraint major_events_priority_source_required check (not priority_signup_enabled or priority_source_event_id is not null);
  end if;
  if not exists (select 1 from pg_constraint where conname='major_events_signup_capacity_positive') then
    alter table public.major_events add constraint major_events_signup_capacity_positive check (signup_capacity > 0);
  end if;
end $$;
create table if not exists public.major_play_days (
  id uuid primary key default gen_random_uuid(),
  major_event_id uuid not null references public.major_events(id) on delete cascade,
  day_number smallint not null check (day_number between 1 and 4),
  label text not null check (length(trim(label)) > 0),
  play_date date not null,
  choices_locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (major_event_id, day_number),
  unique (id, major_event_id)
);

create table if not exists public.major_time_slots (
  id uuid primary key default gen_random_uuid(),
  play_day_id uuid not null references public.major_play_days(id) on delete cascade,
  starts_at timestamptz not null,
  label text,
  is_available boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (play_day_id, starts_at)
);
alter table public.major_time_slots drop column if exists capacity;

create table if not exists public.major_entry_day_choices (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.major_entries(id) on delete cascade,
  play_day_id uuid not null references public.major_play_days(id) on delete restrict,
  time_slot_id uuid not null references public.major_time_slots(id) on delete restrict,
  assignment_location text,
  selected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entry_id, play_day_id)
);

create index if not exists major_play_days_event_idx on public.major_play_days(major_event_id, day_number);
create index if not exists major_time_slots_day_idx on public.major_time_slots(play_day_id, starts_at);
create index if not exists major_choices_slot_idx on public.major_entry_day_choices(time_slot_id);

alter table public.major_play_days enable row level security;
alter table public.major_time_slots enable row level security;
alter table public.major_entry_day_choices enable row level security;

drop policy if exists "Public can read visible Major play days" on public.major_play_days;
create policy "Public can read visible Major play days" on public.major_play_days for select
using (exists (select 1 from public.major_events e where e.id = major_event_id and e.is_public));
drop policy if exists "Public can read visible Major time slots" on public.major_time_slots;
create policy "Public can read visible Major time slots" on public.major_time_slots for select
using (exists (select 1 from public.major_play_days d join public.major_events e on e.id = d.major_event_id where d.id = play_day_id and e.is_public));
drop policy if exists "Site admins manage Major play days" on public.major_play_days;
create policy "Site admins manage Major play days" on public.major_play_days for all using (public.is_current_user_site_admin()) with check (public.is_current_user_site_admin());
drop policy if exists "Site admins manage Major time slots" on public.major_time_slots;
create policy "Site admins manage Major time slots" on public.major_time_slots for all using (public.is_current_user_site_admin()) with check (public.is_current_user_site_admin());
drop policy if exists "Site admins manage Major day choices" on public.major_entry_day_choices;
create policy "Site admins manage Major day choices" on public.major_entry_day_choices for all using (public.is_current_user_site_admin()) with check (public.is_current_user_site_admin());

drop trigger if exists major_play_days_touch_updated_at on public.major_play_days;
create trigger major_play_days_touch_updated_at before update on public.major_play_days for each row execute function public.touch_major_updated_at();
drop trigger if exists major_time_slots_touch_updated_at on public.major_time_slots;
create trigger major_time_slots_touch_updated_at before update on public.major_time_slots for each row execute function public.touch_major_updated_at();
drop trigger if exists major_choices_touch_updated_at on public.major_entry_day_choices;
create trigger major_choices_touch_updated_at before update on public.major_entry_day_choices for each row execute function public.touch_major_updated_at();

create or replace function public.guard_major_signup_capacity()
returns trigger language plpgsql set search_path to '' as $$
declare claimed_count integer; operation text;
begin
  operation := current_setting('app.major_capacity_operation', true);
  select count(*) into claimed_count from public.major_entries where major_event_id=old.id and status in ('registered','confirmed');
  if new.minimum_public_spots_at_open is distinct from old.minimum_public_spots_at_open and old.public_capacity_adjusted_at is not null then
    raise exception 'The public-opening minimum cannot change after its capacity guarantee is applied.';
  end if;
  if new.public_capacity_adjusted_at is distinct from old.public_capacity_adjusted_at and operation <> 'public_opening' then
    raise exception 'Public-opening capacity adjustment is server controlled.';
  end if;
  if new.later_release_used_at is distinct from old.later_release_used_at or new.later_release_spots is distinct from old.later_release_spots then
    if operation <> 'later_release' then raise exception 'Later capacity release is server controlled.'; end if;
  end if;
  if new.signup_capacity is distinct from old.signup_capacity then
    if claimed_count=0 and old.later_release_used_at is null and old.public_capacity_adjusted_at is null and (old.public_signup_opens_at is null or now()<old.public_signup_opens_at) then return new; end if;
    if operation='public_opening' and old.public_capacity_adjusted_at is null and new.public_capacity_adjusted_at is not null and new.signup_capacity>=old.signup_capacity then return new; end if;
    if operation='later_release' and old.later_release_used_at is null and new.later_release_used_at is not null and new.later_release_spots between 10 and 50 and new.signup_capacity=old.signup_capacity+new.later_release_spots then return new; end if;
    raise exception 'Event capacity can only change through the public-opening guarantee or the one-time later release.';
  end if;
  return new;
end $$;
drop trigger if exists major_events_guard_signup_capacity on public.major_events;
create trigger major_events_guard_signup_capacity before update on public.major_events for each row execute function public.guard_major_signup_capacity();

create or replace function public.get_my_major_signup_schedule(p_major_event_id uuid)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare provider_id text; matched_player_id uuid; matched_count integer;
begin
  if auth.uid() is null or (coalesce(auth.jwt()->'app_metadata'->>'provider','') <> 'discord' and not (coalesce(auth.jwt()->'app_metadata'->'providers','[]'::jsonb) ? 'discord')) then return '[]'::jsonb; end if;
  provider_id := coalesce(nullif(btrim(auth.jwt()->'user_metadata'->>'provider_id'),''), nullif(btrim(auth.jwt()->'user_metadata'->>'sub'),''));
  if provider_id is null then return '[]'::jsonb; end if;
  select count(*) into matched_count from public.players where discord_id = provider_id;
  if matched_count <> 1 then return '[]'::jsonb; end if;
  select id into strict matched_player_id from public.players where discord_id = provider_id;
  return coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'entry_id', c.entry_id, 'play_day_id', c.play_day_id, 'time_slot_id', c.time_slot_id, 'assignment_location', c.assignment_location, 'starts_at', s.starts_at, 'slot_label', s.label) order by d.day_number)
    from public.major_entries e join public.major_entry_day_choices c on c.entry_id=e.id join public.major_play_days d on d.id=c.play_day_id join public.major_time_slots s on s.id=c.time_slot_id
    where e.major_event_id=p_major_event_id and e.player_id=matched_player_id), '[]'::jsonb);
end $$;
revoke all on function public.get_my_major_signup_schedule(uuid) from public, anon;

create or replace function public.signup_for_major_with_slots(p_major_event_id uuid, p_time_slot_ids uuid[])
returns public.major_entries language plpgsql security definer set search_path to '' as $$
declare provider_id text; matched_player public.players%rowtype; matched_count integer; saved_entry public.major_entries%rowtype; signup_event public.major_events%rowtype; day_row record; selected_slot uuid; claimed_count integer;
begin
  if auth.uid() is null then raise exception 'You must sign in with Discord.'; end if;
  if coalesce(auth.jwt()->'app_metadata'->>'provider','') <> 'discord' and not (coalesce(auth.jwt()->'app_metadata'->'providers','[]'::jsonb) ? 'discord') then raise exception 'A linked Discord identity is required.'; end if;
  provider_id := coalesce(nullif(btrim(auth.jwt()->'user_metadata'->>'provider_id'),''), nullif(btrim(auth.jwt()->'user_metadata'->>'sub'),''));
  if provider_id is null then raise exception 'Discord identity could not be verified.'; end if;
  select count(*) into matched_count from public.players where discord_id=provider_id;
  if matched_count=0 then raise exception 'No player is linked to this Discord account.'; end if;
  if matched_count>1 then raise exception 'This Discord account matches multiple players. Contact an administrator.'; end if;
  select * into matched_player from public.players where discord_id=provider_id;
  select * into signup_event from public.major_events where id=p_major_event_id and is_public and signup_open for update;
  if not found then raise exception 'Signup is not open for this Major.'; end if;
  if signup_event.public_signup_opens_at is not null and now() < signup_event.public_signup_opens_at then
    if not signup_event.priority_signup_enabled
      or signup_event.priority_signup_opens_at is null
      or now() < signup_event.priority_signup_opens_at
      or signup_event.priority_source_event_id is null
      or not exists(select 1 from public.major_entries where major_event_id=signup_event.priority_source_event_id and player_id=matched_player.id and status not in ('withdrawn','declined'))
    then raise exception 'Public signup has not opened yet.'; end if;
  end if;
  if signup_event.public_signup_opens_at is not null and now() >= signup_event.public_signup_opens_at and signup_event.public_capacity_adjusted_at is null then
    select count(*) into claimed_count from public.major_entries where major_event_id=p_major_event_id and status in ('registered','confirmed');
    perform set_config('app.major_capacity_operation','public_opening',true);
    update public.major_events set
      signup_capacity=greatest(signup_capacity, claimed_count+coalesce(minimum_public_spots_at_open,0)),
      public_capacity_adjusted_at=now()
    where id=p_major_event_id returning * into signup_event;
  end if;
  select count(*) into claimed_count from public.major_entries where major_event_id=p_major_event_id and status in ('registered','confirmed') and player_id<>matched_player.id;
  if signup_event.signup_capacity is not null and claimed_count >= signup_event.signup_capacity then raise exception 'This Major field is full.'; end if;
  if (select count(*) from public.major_play_days where major_event_id=p_major_event_id) <> 4 then raise exception 'All four tournament days must be configured before signup.'; end if;
  if coalesce(array_length(p_time_slot_ids,1),0)<>4 or (select count(distinct x) from unnest(p_time_slot_ids) x)<>4 then raise exception 'Choose exactly one time for each of the four days.'; end if;
  insert into public.major_entries(major_event_id,player_id,player_screen_name_snapshot)
  values(p_major_event_id,matched_player.id,matched_player.screen_name)
  on conflict(major_event_id,player_id) do update set player_screen_name_snapshot=excluded.player_screen_name_snapshot, updated_at=now()
  returning * into saved_entry;
  if saved_entry.status in ('withdrawn','declined') then raise exception 'Contact an administrator before changing this entry.'; end if;
  for day_row in select * from public.major_play_days where major_event_id=p_major_event_id order by day_number loop
    select s.id into selected_slot from public.major_time_slots s where s.id=any(p_time_slot_ids) and s.play_day_id=day_row.id and s.is_available for update;
    if selected_slot is null then raise exception 'Choose one available time for Day %.', day_row.day_number; end if;
    if day_row.choices_locked and not exists(select 1 from public.major_entry_day_choices where entry_id=saved_entry.id and play_day_id=day_row.id and time_slot_id=selected_slot) then raise exception 'Day % choices are locked.', day_row.day_number; end if;
    insert into public.major_entry_day_choices(entry_id,play_day_id,time_slot_id) values(saved_entry.id,day_row.id,selected_slot)
    on conflict(entry_id,play_day_id) do update set time_slot_id=excluded.time_slot_id, selected_at=now(), updated_at=now();
    selected_slot := null;
  end loop;
  return saved_entry;
end $$;
revoke all on function public.signup_for_major_with_slots(uuid,uuid[]) from public, anon;

create or replace function public.release_additional_major_spots(p_major_event_id uuid, p_additional_spots integer)
returns public.major_events language plpgsql security definer set search_path to '' as $$
declare saved public.major_events%rowtype;
begin
  if not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required.' using errcode='42501'; end if;
  if p_additional_spots is null or p_additional_spots<10 or p_additional_spots>50 then raise exception 'The one-time release must add between 10 and 50 spots.'; end if;
  select * into saved from public.major_events where id=p_major_event_id for update;
  if not found then raise exception 'Major event not found.'; end if;
  if saved.public_signup_opens_at is null or now()<saved.public_signup_opens_at then raise exception 'Additional spots can only be released after public signup opens.'; end if;
  if saved.later_release_used_at is not null then raise exception 'The one-time additional release has already been used.'; end if;
  perform set_config('app.major_capacity_operation','later_release',true);
  update public.major_events set signup_capacity=signup_capacity+p_additional_spots, later_release_spots=p_additional_spots, later_release_used_at=now(), signup_open=true
  where id=p_major_event_id returning * into saved;
  return saved;
end $$;
revoke all on function public.release_additional_major_spots(uuid,integer) from public, anon;

create or replace function public.get_major_signup_status(p_major_event_id uuid)
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object(
    'spots_claimed', (select count(*) from public.major_entries x where x.major_event_id=e.id and x.status in ('registered','confirmed')),
    'capacity', case when e.public_signup_opens_at is not null and now()>=e.public_signup_opens_at and e.public_capacity_adjusted_at is null then greatest(e.signup_capacity, (select count(*) from public.major_entries x where x.major_event_id=e.id and x.status in ('registered','confirmed'))+coalesce(e.minimum_public_spots_at_open,0)) else e.signup_capacity end,
    'signup_open', e.signup_open,
    'public_signup_opens_at', e.public_signup_opens_at,
    'priority_signup_enabled', e.priority_signup_enabled,
    'state', case
      when not e.signup_open then 'closed'
      when (select count(*) from public.major_entries x where x.major_event_id=e.id and x.status in ('registered','confirmed')) >= (case when e.public_signup_opens_at is not null and now()>=e.public_signup_opens_at and e.public_capacity_adjusted_at is null then greatest(e.signup_capacity, (select count(*) from public.major_entries y where y.major_event_id=e.id and y.status in ('registered','confirmed'))+coalesce(e.minimum_public_spots_at_open,0)) else e.signup_capacity end) then 'full'
      when e.public_signup_opens_at is not null and now() < e.public_signup_opens_at
        and e.priority_signup_enabled and e.priority_signup_opens_at is not null and now() >= e.priority_signup_opens_at then 'priority'
      when e.public_signup_opens_at is not null and now() < e.public_signup_opens_at then 'upcoming'
      else 'open'
    end
  ) from public.major_events e where e.id=p_major_event_id and e.is_public
$$;
revoke all on function public.get_major_signup_status(uuid) from public;

revoke all on public.major_play_days, public.major_time_slots, public.major_entry_day_choices from anon, authenticated;
grant select on public.major_play_days, public.major_time_slots to anon, authenticated;
grant select, insert, update, delete on public.major_play_days, public.major_time_slots, public.major_entry_day_choices to authenticated;
grant execute on function public.get_my_major_signup_schedule(uuid) to authenticated;
grant execute on function public.signup_for_major_with_slots(uuid,uuid[]) to authenticated;
grant execute on function public.get_major_signup_status(uuid) to anon, authenticated;
grant execute on function public.release_additional_major_spots(uuid,integer) to authenticated;

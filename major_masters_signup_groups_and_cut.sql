-- Masters signup groups, day-wide locks, and administrator-managed weekend status.
-- Install after major_signup_scheduling.sql. Safe to rerun after partial failure.

-- Capacity remains event-level. signup_capacity is the currently released capacity;
-- the hard ceiling is fixed at 100 and there is at most one later release.
alter table public.major_events add column if not exists signup_hard_capacity integer not null default 100;
alter table public.major_events add column if not exists initial_release_capacity integer not null default 50;
alter table public.major_events add column if not exists schedule_timezone text not null default 'America/New_York';
alter table public.major_events add column if not exists signup_instructions text;
alter table public.major_events add column if not exists scheduling_instructions text;
alter table public.major_events add column if not exists qualifier_information text;
alter table public.major_events add column if not exists cut_information text;
alter table public.major_events add column if not exists weekend_information text;
alter table public.major_events add column if not exists room_rules text;
alter table public.major_events add column if not exists stream_information text;
alter table public.major_events add column if not exists weekend_status_published_at timestamptz;
alter table public.major_events add column if not exists secondary_trophy_display_name text;
alter table public.major_events add column if not exists is_test_event boolean not null default false;
alter table public.major_events add column if not exists test_event_listed boolean not null default false;
alter table public.major_events drop constraint if exists major_events_test_event_private;
alter table public.major_events add constraint major_events_test_event_private check (not is_test_event or not is_public);

insert into public.major_events (slug,name,is_public,is_test_event,test_event_listed,signup_open,signup_capacity)
values ('test','Test',false,true,false,false,50)
on conflict (slug) do nothing;

do $block$
begin
  if not exists(select 1 from public.major_events where slug='test' and is_test_event) then
    raise exception 'The reserved test slug already belongs to a non-TEST Major event.';
  end if;
end $block$;

create table if not exists public.major_test_event_testers (
  major_event_id uuid not null references public.major_events(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete restrict,
  added_at timestamptz not null default now(),
  added_by uuid references auth.users(id) on delete set null,
  primary key (major_event_id,player_id)
);
create index if not exists major_test_event_testers_player_idx on public.major_test_event_testers(player_id,major_event_id);
alter table public.major_test_event_testers enable row level security;
drop policy if exists "Site admins manage Major TEST testers" on public.major_test_event_testers;
create policy "Site admins manage Major TEST testers" on public.major_test_event_testers
for all to authenticated using (public.is_current_user_site_admin()) with check (public.is_current_user_site_admin());

create or replace function public.is_current_user_major_test_tester(p_major_event_id uuid)
returns boolean language plpgsql stable security definer set search_path to '' as $function$
declare provider_id text; matched_player_id uuid; matched_count integer;
begin
  if auth.uid() is null or (coalesce(auth.jwt()->'app_metadata'->>'provider','')<>'discord'
    and not (coalesce(auth.jwt()->'app_metadata'->'providers','[]'::jsonb) ? 'discord')) then return false; end if;
  provider_id:=coalesce(nullif(btrim(auth.jwt()->'user_metadata'->>'provider_id'),''),nullif(btrim(auth.jwt()->'user_metadata'->>'sub'),''));
  if provider_id is null then return false; end if;
  select count(*) into matched_count from public.players where discord_id=provider_id;
  if matched_count<>1 then return false; end if;
  select id into strict matched_player_id from public.players where discord_id=provider_id;
  return exists(select 1 from public.major_events e join public.major_test_event_testers t on t.major_event_id=e.id
    where e.id=p_major_event_id and e.is_test_event and t.player_id=matched_player_id);
end $function$;
revoke all on function public.is_current_user_major_test_tester(uuid) from public,anon,authenticated;

create or replace function public.guard_major_test_tester_event()
returns trigger language plpgsql set search_path to '' as $function$
begin
  if not exists(select 1 from public.major_events where id=new.major_event_id and is_test_event) then
    raise exception 'Trusted TEST players can only be assigned to a TEST event.';
  end if;
  return new;
end $function$;
drop trigger if exists major_test_event_testers_guard_event on public.major_test_event_testers;
create trigger major_test_event_testers_guard_event before insert or update on public.major_test_event_testers
for each row execute function public.guard_major_test_tester_event();

create or replace function public.guard_major_test_entry_allowlist()
returns trigger language plpgsql set search_path to '' as $function$
begin
  if exists(select 1 from public.major_events where id=new.major_event_id and is_test_event)
    and not exists(select 1 from public.major_test_event_testers where major_event_id=new.major_event_id and player_id=new.player_id)
  then raise exception 'Only trusted testers can be registered for a TEST event.' using errcode='42501'; end if;
  return new;
end $function$;
drop trigger if exists major_entries_guard_test_allowlist on public.major_entries;
create trigger major_entries_guard_test_allowlist before insert on public.major_entries
for each row execute function public.guard_major_test_entry_allowlist();

drop policy if exists "Trusted testers can read their TEST Major" on public.major_events;
create policy "Trusted testers can read their TEST Major" on public.major_events for select to authenticated
using (is_test_event and public.is_current_user_major_test_tester(id));
drop policy if exists "Trusted testers can read TEST Major entrants" on public.major_entries;
create policy "Trusted testers can read TEST Major entrants" on public.major_entries for select to authenticated
using (status not in ('withdrawn','declined') and public.is_current_user_major_test_tester(major_event_id));
drop policy if exists "Trusted testers can read TEST Major play days" on public.major_play_days;
create policy "Trusted testers can read TEST Major play days" on public.major_play_days for select to authenticated
using (public.is_current_user_major_test_tester(major_event_id));
drop policy if exists "Trusted testers can read TEST Major time slots" on public.major_time_slots;
create policy "Trusted testers can read TEST Major time slots" on public.major_time_slots for select to authenticated
using (exists(select 1 from public.major_play_days d where d.id=play_day_id and public.is_current_user_major_test_tester(d.major_event_id)));

do $block$
declare over_limit record;
begin
  select e.id, e.signup_capacity, count(me.id) filter (where me.status in ('registered','confirmed')) as claimed
  into over_limit
  from public.major_events e
  left join public.major_entries me on me.major_event_id=e.id
  group by e.id, e.signup_capacity
  having greatest(e.signup_capacity, count(me.id) filter (where me.status in ('registered','confirmed'))) > 100
  limit 1;
  if found then
    raise exception 'Major % already exceeds the 100-player hard maximum.', over_limit.id;
  end if;
end $block$;

update public.major_events e
set signup_hard_capacity=100,
    signup_capacity=greatest(e.signup_capacity, (
      select count(*) from public.major_entries me
      where me.major_event_id=e.id and me.status in ('registered','confirmed')
    )),
    initial_release_capacity=least(e.signup_capacity, 100, greatest(1, coalesce(e.initial_release_capacity, e.signup_capacity, 50)))
where e.signup_hard_capacity is distinct from 100
   or e.signup_capacity < (select count(*) from public.major_entries me where me.major_event_id=e.id and me.status in ('registered','confirmed'))
   or e.initial_release_capacity is null
   or e.initial_release_capacity>e.signup_capacity;

alter table public.major_events drop constraint if exists major_events_later_release_spots_check;
alter table public.major_events drop constraint if exists major_events_signup_release_limits;
alter table public.major_events add constraint major_events_signup_release_limits check (
  signup_hard_capacity = 100
  and initial_release_capacity between 1 and 100
  and signup_capacity between initial_release_capacity and signup_hard_capacity
  and (later_release_spots is null or later_release_spots between 1 and 100)
  and (later_release_used_at is null) = (later_release_spots is null)
);

alter table public.major_play_days add column if not exists selection_locks_at timestamptz;

create table if not exists public.major_entry_weekend_status (
  entry_id uuid primary key references public.major_entries(id) on delete cascade,
  major_event_id uuid not null references public.major_events(id) on delete cascade,
  competition_status text not null default 'pending' check (competition_status in ('pending','main','secondary')),
  decided_at timestamptz,
  decided_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (entry_id, major_event_id)
);

create table if not exists public.major_schedule_groups (
  id uuid primary key default gen_random_uuid(),
  major_event_id uuid not null references public.major_events(id) on delete cascade,
  play_day_id uuid not null references public.major_play_days(id) on delete cascade,
  time_slot_id uuid not null references public.major_time_slots(id) on delete restrict,
  group_label text not null check (btrim(group_label) <> ''),
  competition text not null default 'qualifying' check (competition in ('qualifying','main','secondary')),
  location text,
  instructions text,
  admin_notes text,
  is_finalized boolean not null default false,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, major_event_id, play_day_id, time_slot_id)
);

create table if not exists public.major_schedule_group_members (
  group_id uuid not null,
  major_event_id uuid not null,
  play_day_id uuid not null,
  time_slot_id uuid not null,
  entry_id uuid not null references public.major_entries(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, entry_id),
  unique (entry_id, play_day_id),
  foreign key (group_id, major_event_id, play_day_id, time_slot_id)
    references public.major_schedule_groups(id, major_event_id, play_day_id, time_slot_id) on delete cascade
);

create table if not exists public.major_final_placements (
  id uuid primary key default gen_random_uuid(),
  major_event_id uuid not null references public.major_events(id) on delete restrict,
  entry_id uuid not null unique references public.major_entries(id) on delete restrict,
  player_id uuid not null references public.players(id) on delete restrict,
  player_screen_name_snapshot text not null check (btrim(player_screen_name_snapshot) <> ''),
  weekend_field text check (weekend_field is null or weekend_field in ('main','secondary')),
  field_placement integer check (field_placement is null or field_placement > 0),
  is_tied boolean not null default false,
  is_winner boolean not null default false,
  result_status text not null default 'pending' check (result_status in ('pending','completed','did_not_finish','withdrawn','disqualified')),
  is_finalized boolean not null default false,
  finalized_at timestamptz,
  finalized_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (major_event_id, player_id),
  constraint major_final_placements_finalized_complete check (
    not is_finalized or (
      weekend_field is not null
      and result_status <> 'pending'
      and (result_status <> 'completed' or field_placement is not null)
      and finalized_at is not null
    )
  )
);
alter table public.major_final_placements add column if not exists is_tied boolean not null default false;
alter table public.major_final_placements add column if not exists is_winner boolean not null default false;
alter table public.major_final_placements drop constraint if exists major_final_placements_winner_consistency;
alter table public.major_final_placements add constraint major_final_placements_winner_consistency check (
  not is_winner or (is_finalized and weekend_field is not null and result_status='completed')
);

create index if not exists major_weekend_status_event_idx on public.major_entry_weekend_status(major_event_id, competition_status);
create index if not exists major_groups_event_day_slot_idx on public.major_schedule_groups(major_event_id, play_day_id, time_slot_id);
create index if not exists major_group_members_day_idx on public.major_schedule_group_members(play_day_id, time_slot_id);
create index if not exists major_final_placements_player_idx on public.major_final_placements(player_id, major_event_id);
drop index if exists public.major_final_placements_field_place_idx;
create unique index if not exists major_final_placements_official_winner_idx
  on public.major_final_placements(major_event_id, weekend_field)
  where is_finalized and is_winner;

alter table public.major_entry_weekend_status enable row level security;
alter table public.major_schedule_groups enable row level security;
alter table public.major_schedule_group_members enable row level security;
alter table public.major_final_placements enable row level security;

drop policy if exists "Site admins manage Major weekend status" on public.major_entry_weekend_status;
create policy "Site admins manage Major weekend status" on public.major_entry_weekend_status
for all to authenticated using (public.is_current_user_site_admin()) with check (public.is_current_user_site_admin());
drop policy if exists "Site admins manage Major schedule groups" on public.major_schedule_groups;
create policy "Site admins manage Major schedule groups" on public.major_schedule_groups
for all to authenticated using (public.is_current_user_site_admin()) with check (public.is_current_user_site_admin());
drop policy if exists "Site admins manage Major group members" on public.major_schedule_group_members;
create policy "Site admins manage Major group members" on public.major_schedule_group_members
for all to authenticated using (public.is_current_user_site_admin()) with check (public.is_current_user_site_admin());
drop policy if exists "Site admins manage Major final placements" on public.major_final_placements;
create policy "Site admins manage Major final placements" on public.major_final_placements
for all to authenticated using (public.is_current_user_site_admin()) with check (public.is_current_user_site_admin());

drop trigger if exists major_weekend_status_touch_updated_at on public.major_entry_weekend_status;
create trigger major_weekend_status_touch_updated_at before update on public.major_entry_weekend_status
for each row execute function public.touch_major_updated_at();
drop trigger if exists major_groups_touch_updated_at on public.major_schedule_groups;
create trigger major_groups_touch_updated_at before update on public.major_schedule_groups
for each row execute function public.touch_major_updated_at();
drop trigger if exists major_final_placements_touch_updated_at on public.major_final_placements;
create trigger major_final_placements_touch_updated_at before update on public.major_final_placements
for each row execute function public.touch_major_updated_at();

create or replace function public.guard_major_final_placement_identity()
returns trigger language plpgsql set search_path to '' as $function$
begin
  if old.is_finalized then raise exception 'Finalized Major placement history is immutable.'; end if;
  if new.major_event_id is distinct from old.major_event_id or new.entry_id is distinct from old.entry_id
    or new.player_id is distinct from old.player_id or new.player_screen_name_snapshot is distinct from old.player_screen_name_snapshot then
    raise exception 'Historical Major result identity and screen-name snapshots are immutable.';
  end if;
  return new;
end $function$;

drop trigger if exists major_final_placements_guard_identity on public.major_final_placements;
create trigger major_final_placements_guard_identity before update on public.major_final_placements
for each row execute function public.guard_major_final_placement_identity();

create or replace function public.create_major_final_placement_for_entry()
returns trigger language plpgsql set search_path to '' as $function$
begin
  insert into public.major_final_placements(major_event_id,entry_id,player_id,player_screen_name_snapshot)
  values(new.major_event_id,new.id,new.player_id,new.player_screen_name_snapshot)
  on conflict(entry_id) do nothing;
  return new;
end $function$;

drop trigger if exists major_entries_create_final_placement on public.major_entries;
create trigger major_entries_create_final_placement after insert on public.major_entries
for each row execute function public.create_major_final_placement_for_entry();

insert into public.major_final_placements(major_event_id,entry_id,player_id,player_screen_name_snapshot)
select e.major_event_id,e.id,e.player_id,e.player_screen_name_snapshot from public.major_entries e
on conflict(entry_id) do nothing;

create or replace function public.validate_major_weekend_status_row()
returns trigger language plpgsql set search_path to '' as $function$
begin
  if not exists(select 1 from public.major_entries e where e.id=new.entry_id and e.major_event_id=new.major_event_id) then
    raise exception 'Weekend status entry must belong to the selected Major.';
  end if;
  return new;
end $function$;

drop trigger if exists major_weekend_status_validate on public.major_entry_weekend_status;
create trigger major_weekend_status_validate before insert or update on public.major_entry_weekend_status
for each row execute function public.validate_major_weekend_status_row();

create or replace function public.validate_major_schedule_group_row()
returns trigger language plpgsql set search_path to '' as $function$
begin
  if not exists(select 1 from public.major_play_days d where d.id=new.play_day_id and d.major_event_id=new.major_event_id)
    or not exists(select 1 from public.major_time_slots s where s.id=new.time_slot_id and s.play_day_id=new.play_day_id) then
    raise exception 'Room/group event, day, and time slot must match.';
  end if;
  return new;
end $function$;

drop trigger if exists major_groups_validate on public.major_schedule_groups;
create trigger major_groups_validate before insert or update on public.major_schedule_groups
for each row execute function public.validate_major_schedule_group_row();

create or replace function public.validate_major_group_member_row()
returns trigger language plpgsql set search_path to '' as $function$
declare room_competition text;
begin
  select g.competition into room_competition from public.major_schedule_groups g
  where g.id=new.group_id and g.major_event_id=new.major_event_id and g.play_day_id=new.play_day_id and g.time_slot_id=new.time_slot_id;
  if room_competition is null or not exists(select 1 from public.major_entries e join public.major_entry_day_choices c on c.entry_id=e.id
    where e.id=new.entry_id and e.major_event_id=new.major_event_id and c.play_day_id=new.play_day_id and c.time_slot_id=new.time_slot_id) then
    raise exception 'Assigned player must belong to the Major and currently select the room time.';
  end if;
  if room_competition in ('main','secondary') and not exists(select 1 from public.major_entry_weekend_status ws where ws.entry_id=new.entry_id and ws.competition_status=room_competition) then
    raise exception 'Weekend room competition must match the player''s Friday decision.';
  end if;
  return new;
end $function$;

drop trigger if exists major_group_members_validate on public.major_schedule_group_members;
create trigger major_group_members_validate before insert or update on public.major_schedule_group_members
for each row execute function public.validate_major_group_member_row();

create or replace function public.sync_major_play_day_lock_deadline()
returns trigger language plpgsql set search_path to '' as $function$
declare affected_day uuid;
begin
  affected_day := case when tg_op='DELETE' then old.play_day_id else new.play_day_id end;
  update public.major_play_days d
  set selection_locks_at=(select min(s.starts_at)-interval '1 hour' from public.major_time_slots s where s.play_day_id=affected_day and s.is_available)
  where d.id=affected_day;
  if tg_op='UPDATE' and old.play_day_id is distinct from new.play_day_id then
    update public.major_play_days d
    set selection_locks_at=(select min(s.starts_at)-interval '1 hour' from public.major_time_slots s where s.play_day_id=old.play_day_id and s.is_available)
    where d.id=old.play_day_id;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $function$;

drop trigger if exists major_slots_sync_day_lock on public.major_time_slots;
create trigger major_slots_sync_day_lock after insert or update or delete on public.major_time_slots
for each row execute function public.sync_major_play_day_lock_deadline();

update public.major_play_days d
set selection_locks_at=(select min(s.starts_at)-interval '1 hour' from public.major_time_slots s where s.play_day_id=d.id and s.is_available);

create or replace function public.guard_major_day_choice_lock()
returns trigger language plpgsql set search_path to '' as $function$
declare locked boolean;
begin
  if public.is_current_user_site_admin() then return new; end if;
  select d.choices_locked or (d.selection_locks_at is not null and now() >= d.selection_locks_at)
  into locked from public.major_play_days d where d.id=new.play_day_id;
  if coalesce(locked,false) and (tg_op='INSERT' or new.time_slot_id is distinct from old.time_slot_id) then
    raise exception 'Selections for this tournament day are locked.';
  end if;
  return new;
end $function$;

drop trigger if exists major_choices_guard_day_lock on public.major_entry_day_choices;
create trigger major_choices_guard_day_lock before insert or update of time_slot_id, play_day_id on public.major_entry_day_choices
for each row execute function public.guard_major_day_choice_lock();

create or replace function public.guard_major_entry_released_capacity()
returns trigger language plpgsql set search_path to '' as $function$
declare released integer; claimed integer;
begin
  if new.status not in ('registered','confirmed') then return new; end if;
  if tg_op='UPDATE' and old.status in ('registered','confirmed') and new.major_event_id=old.major_event_id then return new; end if;
  select signup_capacity into released from public.major_events where id=new.major_event_id for update;
  select count(*) into claimed from public.major_entries
  where major_event_id=new.major_event_id and status in ('registered','confirmed') and id<>new.id;
  if claimed >= released then raise exception 'This Major has reached its currently released capacity.'; end if;
  return new;
end $function$;

drop trigger if exists major_entries_guard_released_capacity on public.major_entries;
create trigger major_entries_guard_released_capacity before insert or update of status, major_event_id on public.major_entries
for each row execute function public.guard_major_entry_released_capacity();

create or replace function public.guard_major_signup_capacity()
returns trigger language plpgsql set search_path to '' as $function$
declare claimed_count integer; operation text;
begin
  operation := current_setting('app.major_capacity_operation', true);
  select count(*) into claimed_count from public.major_entries where major_event_id=old.id and status in ('registered','confirmed');
  if new.signup_hard_capacity<>100 then raise exception 'The Major hard maximum is 100 golfers.'; end if;
  if new.signup_capacity<claimed_count then raise exception 'Released capacity cannot be lower than the existing field.'; end if;
  if new.signup_capacity>100 or new.initial_release_capacity>100 then raise exception 'Released capacity cannot exceed 100 golfers.'; end if;
  if new.minimum_public_spots_at_open is distinct from old.minimum_public_spots_at_open and old.public_capacity_adjusted_at is not null then
    raise exception 'The public-opening minimum cannot change after its guarantee is applied.';
  end if;
  if new.public_capacity_adjusted_at is distinct from old.public_capacity_adjusted_at and operation<>'public_opening' then
    raise exception 'Public-opening capacity adjustment is server controlled.';
  end if;
  if new.later_release_used_at is distinct from old.later_release_used_at or new.later_release_spots is distinct from old.later_release_spots then
    if operation<>'later_release' then raise exception 'The optional second release is server controlled.'; end if;
  end if;
  if new.signup_capacity is distinct from old.signup_capacity or new.initial_release_capacity is distinct from old.initial_release_capacity then
    if operation='initial_release' and old.later_release_used_at is null
      and (old.public_signup_opens_at is null or now()<old.public_signup_opens_at)
      and claimed_count<=new.signup_capacity
      and new.signup_capacity=new.initial_release_capacity then return new; end if;
    if operation='public_opening' and old.public_capacity_adjusted_at is null
      and new.public_capacity_adjusted_at is not null
      and new.signup_capacity>=old.signup_capacity and new.signup_capacity<=100 then return new; end if;
    if operation='later_release' and old.later_release_used_at is null
      and new.later_release_used_at is not null and new.later_release_spots>0
      and new.signup_capacity=old.signup_capacity+new.later_release_spots and new.signup_capacity<=100 then return new; end if;
    raise exception 'Capacity can only change in Release 1 or the single optional Release 2.';
  end if;
  return new;
end $function$;

drop trigger if exists major_events_guard_signup_capacity on public.major_events;
create trigger major_events_guard_signup_capacity before update on public.major_events
for each row execute function public.guard_major_signup_capacity();

create or replace function public.configure_major_signup_release(
  p_major_event_id uuid, p_release_1_capacity integer, p_public_signup_opens_at timestamptz,
  p_minimum_public_spots_at_open integer, p_priority_signup_enabled boolean,
  p_priority_signup_opens_at timestamptz, p_priority_source_event_id uuid, p_schedule_timezone text
)
returns public.major_events language plpgsql security definer set search_path to '' as $function$
declare saved public.major_events%rowtype; claimed integer;
begin
  if not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required.' using errcode='42501'; end if;
  if p_release_1_capacity is null or p_release_1_capacity not between 1 and 100 then raise exception 'Release 1 must be between 1 and 100 spots.'; end if;
  if p_minimum_public_spots_at_open is not null and p_minimum_public_spots_at_open not between 1 and 100 then raise exception 'The public minimum must be between 1 and 100.'; end if;
  if p_priority_signup_enabled and (p_priority_signup_opens_at is null or p_priority_source_event_id is null) then raise exception 'Priority signup requires an opening and a source Major.'; end if;
  if nullif(btrim(p_schedule_timezone),'') is null then raise exception 'An IANA schedule timezone is required.'; end if;
  perform 1 from pg_catalog.pg_timezone_names where name=p_schedule_timezone;
  if not found then raise exception 'Unknown IANA timezone: %', p_schedule_timezone; end if;
  select count(*) into claimed from public.major_entries where major_event_id=p_major_event_id and status in ('registered','confirmed');
  select * into saved from public.major_events where id=p_major_event_id for update;
  if not found then raise exception 'Major event not found.'; end if;
  if p_priority_signup_enabled and (saved.slug in ('major-1','masters') or lower(saved.name) in ('major 1','masters')) then
    raise exception 'Priority signup is disabled for the first Major.';
  end if;
  if p_priority_signup_enabled and not saved.is_test_event
    and exists(select 1 from public.major_events where id=p_priority_source_event_id and is_test_event)
  then raise exception 'TEST participation cannot provide eligibility for a real Major.'; end if;
  if saved.later_release_used_at is not null then raise exception 'Release 1 settings cannot change after Release 2.'; end if;
  if saved.public_signup_opens_at is not null and now()>=saved.public_signup_opens_at then raise exception 'Release 1 settings cannot change after public signup opens.'; end if;
  if p_release_1_capacity<claimed then raise exception 'Release 1 cannot be lower than the existing field of %.', claimed; end if;
  perform set_config('app.major_capacity_operation','initial_release',true);
  update public.major_events set signup_hard_capacity=100, initial_release_capacity=p_release_1_capacity,
    signup_capacity=p_release_1_capacity, public_signup_opens_at=p_public_signup_opens_at,
    minimum_public_spots_at_open=p_minimum_public_spots_at_open,
    priority_signup_enabled=coalesce(p_priority_signup_enabled,false),
    priority_signup_opens_at=case when p_priority_signup_enabled then p_priority_signup_opens_at else null end,
    priority_source_event_id=case when p_priority_signup_enabled then p_priority_source_event_id else null end,
    schedule_timezone=p_schedule_timezone
  where id=p_major_event_id returning * into saved;
  return saved;
end $function$;
revoke all on function public.configure_major_signup_release(uuid,integer,timestamptz,integer,boolean,timestamptz,uuid,text) from public,anon,authenticated;

create or replace function public.create_major_time_slot(p_play_day_id uuid,p_local_starts_at timestamp,p_label text)
returns public.major_time_slots language plpgsql security definer set search_path to '' as $function$
declare saved public.major_time_slots%rowtype; zone_name text;
begin
  if not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required.' using errcode='42501'; end if;
  select e.schedule_timezone into zone_name from public.major_play_days d join public.major_events e on e.id=d.major_event_id where d.id=p_play_day_id;
  if zone_name is null then raise exception 'Major play day not found.'; end if;
  insert into public.major_time_slots(play_day_id,starts_at,label)
  values(p_play_day_id,p_local_starts_at at time zone zone_name,nullif(btrim(p_label),'')) returning * into saved;
  return saved;
end $function$;
revoke all on function public.create_major_time_slot(uuid,timestamp,text) from public,anon,authenticated;

create or replace function public.release_additional_major_spots(p_major_event_id uuid, p_additional_spots integer)
returns public.major_events language plpgsql security definer set search_path to '' as $function$
declare saved public.major_events%rowtype; claimed integer; guaranteed_capacity integer;
begin
  if not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required.' using errcode='42501'; end if;
  if p_additional_spots is null or p_additional_spots<1 then raise exception 'Release 2 must add at least one spot.'; end if;
  select * into saved from public.major_events where id=p_major_event_id for update;
  if not found then raise exception 'Major event not found.'; end if;
  if saved.public_signup_opens_at is null or now()<saved.public_signup_opens_at then raise exception 'Release 2 is available only after public signup opens.'; end if;
  if saved.later_release_used_at is not null then raise exception 'Release 2 has already been used; there is no third release.'; end if;
  if saved.public_capacity_adjusted_at is null then
    select count(*) into claimed from public.major_entries where major_event_id=p_major_event_id and status in ('registered','confirmed');
    guaranteed_capacity:=greatest(saved.signup_capacity,claimed+coalesce(saved.minimum_public_spots_at_open,0));
    if guaranteed_capacity>100 then raise exception 'The configured public-opening guarantee would exceed the 100-player hard maximum.'; end if;
    perform set_config('app.major_capacity_operation','public_opening',true);
    update public.major_events set signup_capacity=guaranteed_capacity,public_capacity_adjusted_at=now()
    where id=p_major_event_id returning * into saved;
  end if;
  if saved.signup_capacity+p_additional_spots>100 then raise exception 'Release 2 would exceed the 100-player hard maximum. At most % spots remain.', 100-saved.signup_capacity; end if;
  perform set_config('app.major_capacity_operation','later_release',true);
  update public.major_events set signup_capacity=signup_capacity+p_additional_spots,
    later_release_spots=p_additional_spots, later_release_used_at=now(), signup_open=true
  where id=p_major_event_id returning * into saved;
  return saved;
end $function$;
revoke all on function public.release_additional_major_spots(uuid,integer) from public,anon,authenticated;

create or replace function public.signup_for_major_with_slots(p_major_event_id uuid, p_time_slot_ids uuid[])
returns public.major_entries language plpgsql security definer set search_path to '' as $function$
declare provider_id text; matched_player public.players%rowtype; matched_count integer; saved_entry public.major_entries%rowtype; signup_event public.major_events%rowtype; day_row record; selected_slot uuid; claimed_count integer; guaranteed_capacity integer;
begin
  if auth.uid() is null then raise exception 'You must sign in with Discord.'; end if;
  if coalesce(auth.jwt()->'app_metadata'->>'provider','')<>'discord' and not (coalesce(auth.jwt()->'app_metadata'->'providers','[]'::jsonb) ? 'discord') then raise exception 'A linked Discord identity is required.'; end if;
  provider_id := coalesce(nullif(btrim(auth.jwt()->'user_metadata'->>'provider_id'),''),nullif(btrim(auth.jwt()->'user_metadata'->>'sub'),''));
  if provider_id is null then raise exception 'Discord identity could not be verified.'; end if;
  select count(*) into matched_count from public.players where discord_id=provider_id;
  if matched_count=0 then raise exception 'No player is linked to this Discord account.'; end if;
  if matched_count>1 then raise exception 'This Discord account matches multiple players. Contact an administrator.'; end if;
  select * into strict matched_player from public.players where discord_id=provider_id;
  select * into signup_event from public.major_events where id=p_major_event_id and signup_open for update;
  if not found then raise exception 'Signup is not open for this Major.'; end if;
  if signup_event.is_test_event then
    if not exists(select 1 from public.major_test_event_testers where major_event_id=p_major_event_id and player_id=matched_player.id) then
      raise exception 'This TEST event is limited to trusted testers.' using errcode='42501';
    end if;
  elsif not signup_event.is_public then
    raise exception 'Signup is not open for this Major.';
  end if;
  if signup_event.public_signup_opens_at is not null and now()<signup_event.public_signup_opens_at then
    if not signup_event.priority_signup_enabled or signup_event.priority_signup_opens_at is null or now()<signup_event.priority_signup_opens_at
      or signup_event.priority_source_event_id is null or not exists(select 1 from public.major_entries where major_event_id=signup_event.priority_source_event_id and player_id=matched_player.id and status not in ('withdrawn','declined'))
    then raise exception 'Public signup has not opened yet.'; end if;
  end if;
  if signup_event.public_signup_opens_at is not null and now()>=signup_event.public_signup_opens_at and signup_event.public_capacity_adjusted_at is null then
    select count(*) into claimed_count from public.major_entries where major_event_id=p_major_event_id and status in ('registered','confirmed');
    guaranteed_capacity := greatest(signup_event.signup_capacity,claimed_count+coalesce(signup_event.minimum_public_spots_at_open,0));
    if guaranteed_capacity>100 then raise exception 'The configured public-opening guarantee would exceed the 100-player hard maximum.'; end if;
    perform set_config('app.major_capacity_operation','public_opening',true);
    update public.major_events set signup_capacity=guaranteed_capacity,public_capacity_adjusted_at=now()
    where id=p_major_event_id returning * into signup_event;
  end if;
  select count(*) into claimed_count from public.major_entries where major_event_id=p_major_event_id and status in ('registered','confirmed') and player_id<>matched_player.id;
  if claimed_count>=signup_event.signup_capacity then raise exception 'This Major has reached its currently released capacity.'; end if;
  if (select count(*) from public.major_play_days where major_event_id=p_major_event_id)<>4 then raise exception 'All four tournament days must be configured before signup.'; end if;
  if coalesce(array_length(p_time_slot_ids,1),0)<>4 or (select count(distinct x) from unnest(p_time_slot_ids) x)<>4 then raise exception 'Choose exactly one time for each of the four days.'; end if;
  insert into public.major_entries(major_event_id,player_id,player_screen_name_snapshot)
  values(p_major_event_id,matched_player.id,matched_player.screen_name)
  on conflict(major_event_id,player_id) do update set player_screen_name_snapshot=excluded.player_screen_name_snapshot,updated_at=now()
  returning * into saved_entry;
  if saved_entry.status in ('withdrawn','declined') then raise exception 'Contact an administrator before changing this entry.'; end if;
  for day_row in select * from public.major_play_days where major_event_id=p_major_event_id order by day_number loop
    select s.id into selected_slot from public.major_time_slots s where s.id=any(p_time_slot_ids) and s.play_day_id=day_row.id and s.is_available for update;
    if selected_slot is null then raise exception 'Choose one available time for Day %.',day_row.day_number; end if;
    if (day_row.choices_locked or (day_row.selection_locks_at is not null and now()>=day_row.selection_locks_at))
      and not exists(select 1 from public.major_entry_day_choices where entry_id=saved_entry.id and play_day_id=day_row.id and time_slot_id=selected_slot)
    then raise exception 'Day % choices are locked.',day_row.day_number; end if;
    insert into public.major_entry_day_choices(entry_id,play_day_id,time_slot_id) values(saved_entry.id,day_row.id,selected_slot)
    on conflict(entry_id,play_day_id) do update set time_slot_id=excluded.time_slot_id,selected_at=now(),updated_at=now();
    selected_slot:=null;
  end loop;
  insert into public.major_entry_weekend_status(entry_id,major_event_id) values(saved_entry.id,p_major_event_id)
  on conflict(entry_id) do nothing;
  return saved_entry;
end $function$;
revoke all on function public.signup_for_major_with_slots(uuid,uuid[]) from public,anon,authenticated;

create or replace function public.get_major_signup_status(p_major_event_id uuid)
returns jsonb language sql stable security definer set search_path to '' as $function$
  with status_data as (
    select e.*,
      (select count(*) from public.major_entries x where x.major_event_id=e.id and x.status in ('registered','confirmed')) as claimed
    from public.major_events e where e.id=p_major_event_id
      and ((e.is_public and not e.is_test_event) or (e.is_test_event and public.is_current_user_major_test_tester(e.id)))
  ), capacity_data as (
    select s.*,case when s.public_signup_opens_at is not null and now()>=s.public_signup_opens_at and s.public_capacity_adjusted_at is null
      then least(100,greatest(s.signup_capacity,s.claimed+coalesce(s.minimum_public_spots_at_open,0))) else s.signup_capacity end as released
    from status_data s
  )
  select jsonb_build_object(
    'spots_claimed',e.claimed,
    'capacity',e.released,
    'hard_capacity',100,'release_2_used',e.later_release_used_at is not null,'signup_open',e.signup_open,
    'public_signup_opens_at',e.public_signup_opens_at,'priority_signup_enabled',e.priority_signup_enabled,
    'state',case when not e.signup_open then 'closed'
      when e.claimed>=e.released then 'full'
      when e.public_signup_opens_at is not null and now()<e.public_signup_opens_at and e.priority_signup_enabled and e.priority_signup_opens_at is not null and now()>=e.priority_signup_opens_at then 'priority'
      when e.public_signup_opens_at is not null and now()<e.public_signup_opens_at then 'upcoming' else 'open' end
  ) from capacity_data e
$function$;
revoke all on function public.get_major_signup_status(uuid) from public,anon,authenticated;

create or replace function public.get_my_major_signup_schedule(p_major_event_id uuid)
returns jsonb language plpgsql security definer set search_path to '' as $function$
declare provider_id text; matched_player_id uuid; matched_count integer;
begin
  if auth.uid() is null or (coalesce(auth.jwt()->'app_metadata'->>'provider','')<>'discord' and not (coalesce(auth.jwt()->'app_metadata'->'providers','[]'::jsonb) ? 'discord')) then return '[]'::jsonb; end if;
  provider_id:=coalesce(nullif(btrim(auth.jwt()->'user_metadata'->>'provider_id'),''),nullif(btrim(auth.jwt()->'user_metadata'->>'sub'),''));
  if provider_id is null then return '[]'::jsonb; end if;
  select count(*) into matched_count from public.players where discord_id=provider_id;
  if matched_count<>1 then return '[]'::jsonb; end if;
  select id into strict matched_player_id from public.players where discord_id=provider_id;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',c.id,'entry_id',c.entry_id,'play_day_id',c.play_day_id,'time_slot_id',c.time_slot_id,
    'assignment_location',case when d.day_number<=2 or ev.weekend_status_published_at is not null then coalesce(g.location,c.assignment_location) else null end,
    'starts_at',s.starts_at,'slot_label',s.label,
    'selection_locks_at',d.selection_locks_at,'is_locked',d.choices_locked or (d.selection_locks_at is not null and now()>=d.selection_locks_at),
    'weekend_competition_status',case when ev.weekend_status_published_at is null then 'pending' else coalesce(ws.competition_status,'pending') end,
    'group_label',case when d.day_number<=2 or ev.weekend_status_published_at is not null then g.group_label else null end,
    'group_competition',case when d.day_number<=2 or ev.weekend_status_published_at is not null then g.competition else null end,
    'group_instructions',case when d.day_number<=2 or ev.weekend_status_published_at is not null then g.instructions else null end
  ) order by d.day_number)
  from public.major_entries e join public.major_events ev on ev.id=e.major_event_id join public.major_entry_day_choices c on c.entry_id=e.id
  join public.major_play_days d on d.id=c.play_day_id join public.major_time_slots s on s.id=c.time_slot_id
  left join public.major_entry_weekend_status ws on ws.entry_id=e.id
  left join public.major_schedule_group_members gm on gm.entry_id=e.id and gm.play_day_id=d.id
  left join public.major_schedule_groups g on g.id=gm.group_id and g.is_published
  where e.major_event_id=p_major_event_id and e.player_id=matched_player_id),'[]'::jsonb);
end $function$;
revoke all on function public.get_my_major_signup_schedule(uuid) from public,anon,authenticated;

create or replace function public.admin_set_major_day_choice(p_entry_id uuid,p_play_day_id uuid,p_time_slot_id uuid)
returns public.major_entry_day_choices language plpgsql security definer set search_path to '' as $function$
declare saved public.major_entry_day_choices%rowtype; event_id uuid;
begin
  if not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required.' using errcode='42501'; end if;
  select major_event_id into event_id from public.major_entries where id=p_entry_id;
  if event_id is null or not exists(select 1 from public.major_play_days where id=p_play_day_id and major_event_id=event_id)
    or not exists(select 1 from public.major_time_slots where id=p_time_slot_id and play_day_id=p_play_day_id)
  then raise exception 'Entry, day, and time slot must belong to the same Major.'; end if;
  delete from public.major_schedule_group_members where entry_id=p_entry_id and play_day_id=p_play_day_id;
  insert into public.major_entry_day_choices(entry_id,play_day_id,time_slot_id)
  values(p_entry_id,p_play_day_id,p_time_slot_id)
  on conflict(entry_id,play_day_id) do update set time_slot_id=excluded.time_slot_id,selected_at=now(),updated_at=now()
  returning * into saved;
  return saved;
end $function$;
revoke all on function public.admin_set_major_day_choice(uuid,uuid,uuid) from public,anon,authenticated;

create or replace function public.set_major_weekend_status(p_entry_id uuid,p_status text)
returns public.major_entry_weekend_status language plpgsql security definer set search_path to '' as $function$
declare saved public.major_entry_weekend_status%rowtype; event_id uuid;
begin
  if not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required.' using errcode='42501'; end if;
  if p_status not in ('pending','main','secondary') then raise exception 'Weekend status must be pending, main, or secondary.'; end if;
  if exists(select 1 from public.major_final_placements r where r.entry_id=p_entry_id and r.is_finalized and r.weekend_field is distinct from p_status) then
    raise exception 'A finalized Major result prevents changing this player''s weekend field.';
  end if;
  select major_event_id into event_id from public.major_entries where id=p_entry_id;
  if event_id is null then raise exception 'Major entry not found.'; end if;
  delete from public.major_schedule_group_members gm using public.major_schedule_groups g
  where gm.group_id=g.id and gm.entry_id=p_entry_id and g.competition in ('main','secondary') and g.competition<>p_status;
  insert into public.major_entry_weekend_status(entry_id,major_event_id,competition_status,decided_at,decided_by)
  values(p_entry_id,event_id,p_status,case when p_status='pending' then null else now() end,case when p_status='pending' then null else auth.uid() end)
  on conflict(entry_id) do update set competition_status=excluded.competition_status,decided_at=excluded.decided_at,decided_by=excluded.decided_by,updated_at=now()
  returning * into saved;
  update public.major_final_placements set weekend_field=case when p_status='pending' then null else p_status end,
    field_placement=case when weekend_field is distinct from case when p_status='pending' then null else p_status end then null else field_placement end,
    result_status=case when weekend_field is distinct from case when p_status='pending' then null else p_status end then 'pending' else result_status end,
    is_tied=case when weekend_field is distinct from case when p_status='pending' then null else p_status end then false else is_tied end,
    is_winner=case when weekend_field is distinct from case when p_status='pending' then null else p_status end then false else is_winner end
  where entry_id=p_entry_id and not is_finalized;
  return saved;
end $function$;
revoke all on function public.set_major_weekend_status(uuid,text) from public,anon,authenticated;

drop function if exists public.save_major_final_placement(uuid,text,integer,text,boolean);
create or replace function public.save_major_final_placement(
  p_entry_id uuid,p_weekend_field text,p_field_placement integer,p_result_status text,p_is_tied boolean,p_is_winner boolean,p_finalize boolean
)
returns public.major_final_placements language plpgsql security definer set search_path to '' as $function$
declare saved public.major_final_placements%rowtype; staged_field text;
begin
  if not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required.' using errcode='42501'; end if;
  if p_weekend_field not in ('main','secondary') then raise exception 'Final field must be main or secondary.'; end if;
  if p_result_status not in ('pending','completed','did_not_finish','withdrawn','disqualified') then raise exception 'Invalid Major result status.'; end if;
  if p_field_placement is not null and p_field_placement<1 then raise exception 'Field placement must be a positive number.'; end if;
  if p_finalize and (p_result_status='pending' or (p_result_status='completed' and p_field_placement is null)) then
    raise exception 'A finalized result needs a completion status and completed players need a field placement.';
  end if;
  if p_is_winner and (not p_finalize or p_result_status<>'completed') then
    raise exception 'An official winner designation requires a finalized completed result.';
  end if;
  select ws.competition_status into staged_field from public.major_entry_weekend_status ws where ws.entry_id=p_entry_id;
  if staged_field is null or staged_field='pending' then raise exception 'Stage the player''s weekend field before recording a placement.'; end if;
  if staged_field<>p_weekend_field then raise exception 'Final placement field must match the staged weekend field.'; end if;
  select * into saved from public.major_final_placements where entry_id=p_entry_id for update;
  if not found then raise exception 'Major placement record not found.'; end if;
  if saved.is_finalized then raise exception 'This Major placement is finalized and cannot be rewritten through normal controls.'; end if;
  update public.major_final_placements set weekend_field=p_weekend_field,field_placement=p_field_placement,
    is_tied=coalesce(p_is_tied,false),is_winner=coalesce(p_is_winner,false),
    result_status=p_result_status,is_finalized=coalesce(p_finalize,false),
    finalized_at=case when p_finalize then now() else null end,finalized_by=case when p_finalize then auth.uid() else null end
  where entry_id=p_entry_id returning * into saved;
  return saved;
end $function$;
revoke all on function public.save_major_final_placement(uuid,text,integer,text,boolean,boolean,boolean) from public,anon,authenticated;

create or replace function public.get_public_major_results(p_major_event_id uuid)
returns jsonb language sql stable security definer set search_path to '' as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'major_event_id',r.major_event_id,'player_id',r.player_id,'player_screen_name_snapshot',r.player_screen_name_snapshot,
    'weekend_field',r.weekend_field,'field_placement',r.field_placement,'is_tied',r.is_tied,'is_winner',r.is_winner,'result_status',r.result_status,
    'finalized_at',r.finalized_at,'secondary_trophy_display_name',e.secondary_trophy_display_name
  ) order by r.weekend_field,r.field_placement nulls last,r.player_screen_name_snapshot),'[]'::jsonb)
  from public.major_final_placements r join public.major_events e on e.id=r.major_event_id
  where r.major_event_id=p_major_event_id and r.is_finalized and e.is_public and not e.is_test_event
$function$;
revoke all on function public.get_public_major_results(uuid) from public,anon,authenticated;

create or replace function public.get_public_major_player_history(p_player_id uuid)
returns jsonb language sql stable security definer set search_path to '' as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'major_event_id',e.id,'major_slug',e.slug,'major_name',e.name,'year',e.year,
    'player_id',r.player_id,'player_screen_name_snapshot',r.player_screen_name_snapshot,
    'weekend_field',r.weekend_field,'field_placement',r.field_placement,'is_tied',r.is_tied,'is_winner',r.is_winner,'result_status',r.result_status,
    'finalized_at',r.finalized_at,'secondary_trophy_display_name',e.secondary_trophy_display_name
  ) order by e.year desc nulls last,e.starts_at desc nulls last),'[]'::jsonb)
  from public.major_final_placements r join public.major_events e on e.id=r.major_event_id
  where r.player_id=p_player_id and r.is_finalized and e.is_public and not e.is_test_event
$function$;
revoke all on function public.get_public_major_player_history(uuid) from public,anon,authenticated;

create or replace function public.publish_major_weekend_field(p_major_event_id uuid)
returns public.major_events language plpgsql security definer set search_path to '' as $function$
declare saved public.major_events%rowtype;
begin
  if not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required.' using errcode='42501'; end if;
  select * into saved from public.major_events where id=p_major_event_id for update;
  if not found then raise exception 'Major event not found.'; end if;
  if saved.weekend_status_published_at is not null then return saved; end if;
  if exists(
    select 1 from public.major_entries e
    left join public.major_entry_weekend_status ws on ws.entry_id=e.id
    where e.major_event_id=p_major_event_id and e.status in ('registered','confirmed')
      and coalesce(ws.competition_status,'pending')='pending'
  ) then raise exception 'Every active entrant must have a staged Main Event or secondary-field decision before publication.'; end if;
  update public.major_events set weekend_status_published_at=now() where id=p_major_event_id returning * into saved;
  return saved;
end $function$;
revoke all on function public.publish_major_weekend_field(uuid) from public,anon,authenticated;

create or replace function public.save_major_schedule_group(
  p_id uuid,p_major_event_id uuid,p_play_day_id uuid,p_time_slot_id uuid,p_group_label text,p_competition text,
  p_location text,p_instructions text,p_admin_notes text,p_is_finalized boolean,p_is_published boolean,p_entry_ids uuid[]
)
returns public.major_schedule_groups language plpgsql security definer set search_path to '' as $function$
declare saved public.major_schedule_groups%rowtype; member_id uuid;
begin
  if not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required.' using errcode='42501'; end if;
  if nullif(btrim(p_group_label),'') is null then raise exception 'A room/group label is required.'; end if;
  if p_competition not in ('qualifying','main','secondary') then raise exception 'Invalid room competition.'; end if;
  if not exists(select 1 from public.major_play_days where id=p_play_day_id and major_event_id=p_major_event_id)
    or not exists(select 1 from public.major_time_slots where id=p_time_slot_id and play_day_id=p_play_day_id)
  then raise exception 'Room day and time must belong to the selected Major.'; end if;
  insert into public.major_schedule_groups(id,major_event_id,play_day_id,time_slot_id,group_label,competition,location,instructions,admin_notes,is_finalized,is_published)
  values(coalesce(p_id,gen_random_uuid()),p_major_event_id,p_play_day_id,p_time_slot_id,btrim(p_group_label),p_competition,nullif(btrim(p_location),''),nullif(btrim(p_instructions),''),nullif(btrim(p_admin_notes),''),coalesce(p_is_finalized,false),coalesce(p_is_published,false))
  on conflict(id) do update set play_day_id=excluded.play_day_id,time_slot_id=excluded.time_slot_id,group_label=excluded.group_label,
    competition=excluded.competition,location=excluded.location,instructions=excluded.instructions,admin_notes=excluded.admin_notes,
    is_finalized=excluded.is_finalized,is_published=excluded.is_published,updated_at=now()
  where public.major_schedule_groups.major_event_id=p_major_event_id returning * into saved;
  if saved.id is null then raise exception 'Room/group does not belong to this Major.'; end if;
  delete from public.major_schedule_group_members where group_id=saved.id;
  foreach member_id in array coalesce(p_entry_ids,array[]::uuid[]) loop
    if not exists(select 1 from public.major_entries e join public.major_entry_day_choices c on c.entry_id=e.id
      where e.id=member_id and e.major_event_id=p_major_event_id and c.play_day_id=p_play_day_id and c.time_slot_id=p_time_slot_id)
    then raise exception 'Every assigned player must be registered and currently selected for this room time.'; end if;
    if p_competition in ('main','secondary') and not exists(select 1 from public.major_entry_weekend_status ws where ws.entry_id=member_id and ws.competition_status=p_competition)
    then raise exception 'Weekend room assignments must match each player''s staged weekend-field status.'; end if;
    insert into public.major_schedule_group_members(group_id,major_event_id,play_day_id,time_slot_id,entry_id)
    values(saved.id,p_major_event_id,p_play_day_id,p_time_slot_id,member_id);
  end loop;
  return saved;
end $function$;
revoke all on function public.save_major_schedule_group(uuid,uuid,uuid,uuid,text,text,text,text,text,boolean,boolean,uuid[]) from public,anon,authenticated;

create or replace function public.delete_major_schedule_group(p_group_id uuid)
returns void language plpgsql security definer set search_path to '' as $function$
begin
  if not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required.' using errcode='42501'; end if;
  delete from public.major_schedule_groups where id=p_group_id;
end $function$;
revoke all on function public.delete_major_schedule_group(uuid) from public,anon,authenticated;

create or replace function public.save_major_event_information(
  p_major_event_id uuid,p_signup_instructions text,p_scheduling_instructions text,p_qualifier_information text,
  p_cut_information text,p_weekend_information text,p_room_rules text,p_stream_information text,p_secondary_trophy_display_name text
)
returns public.major_events language plpgsql security definer set search_path to '' as $function$
declare saved public.major_events%rowtype;
begin
  if not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required.' using errcode='42501'; end if;
  update public.major_events set signup_instructions=nullif(btrim(p_signup_instructions),''),scheduling_instructions=nullif(btrim(p_scheduling_instructions),''),
    qualifier_information=nullif(btrim(p_qualifier_information),''),cut_information=nullif(btrim(p_cut_information),''),
    weekend_information=nullif(btrim(p_weekend_information),''),room_rules=nullif(btrim(p_room_rules),''),stream_information=nullif(btrim(p_stream_information),''),
    secondary_trophy_display_name=nullif(btrim(p_secondary_trophy_display_name),'')
  where id=p_major_event_id returning * into saved;
  if saved.id is null then raise exception 'Major event not found.'; end if;
  return saved;
end $function$;
revoke all on function public.save_major_event_information(uuid,text,text,text,text,text,text,text,text) from public,anon,authenticated;

create or replace function public.add_major_test_tester(p_major_event_id uuid,p_player_id uuid)
returns jsonb language plpgsql security definer set search_path to '' as $function$
declare tester jsonb;
begin
  if not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required.' using errcode='42501'; end if;
  if not exists(select 1 from public.major_events where id=p_major_event_id and is_test_event) then raise exception 'TEST event not found.'; end if;
  if not exists(select 1 from public.players where id=p_player_id) then raise exception 'Canonical player UUID not found.'; end if;
  insert into public.major_test_event_testers(major_event_id,player_id,added_by) values(p_major_event_id,p_player_id,auth.uid())
  on conflict(major_event_id,player_id) do nothing;
  select jsonb_build_object('major_event_id',t.major_event_id,'player_id',t.player_id,'screen_name',p.screen_name,'added_at',t.added_at)
  into tester from public.major_test_event_testers t join public.players p on p.id=t.player_id
  where t.major_event_id=p_major_event_id and t.player_id=p_player_id;
  return tester;
end $function$;
revoke all on function public.add_major_test_tester(uuid,uuid) from public,anon,authenticated;

create or replace function public.remove_major_test_tester(p_major_event_id uuid,p_player_id uuid)
returns void language plpgsql security definer set search_path to '' as $function$
begin
  if not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required.' using errcode='42501'; end if;
  delete from public.major_test_event_testers where major_event_id=p_major_event_id and player_id=p_player_id;
end $function$;
revoke all on function public.remove_major_test_tester(uuid,uuid) from public,anon,authenticated;

create or replace function public.get_major_test_testers(p_major_event_id uuid)
returns jsonb language sql stable security definer set search_path to '' as $function$
  select case when public.is_current_user_site_admin() then coalesce(jsonb_agg(jsonb_build_object(
    'major_event_id',t.major_event_id,'player_id',t.player_id,'screen_name',p.screen_name,'added_at',t.added_at
  ) order by p.screen_name),'[]'::jsonb) else '[]'::jsonb end
  from public.major_test_event_testers t join public.players p on p.id=t.player_id where t.major_event_id=p_major_event_id
$function$;
revoke all on function public.get_major_test_testers(uuid) from public,anon,authenticated;

create or replace function public.set_major_test_event_listing(p_major_event_id uuid,p_listed boolean)
returns public.major_events language plpgsql security definer set search_path to '' as $function$
declare saved public.major_events%rowtype;
begin
  if not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required.' using errcode='42501'; end if;
  update public.major_events set test_event_listed=coalesce(p_listed,false)
  where id=p_major_event_id and is_test_event returning * into saved;
  if saved.id is null then raise exception 'TEST event not found.'; end if;
  return saved;
end $function$;
revoke all on function public.set_major_test_event_listing(uuid,boolean) from public,anon,authenticated;

-- The legacy one-click signup cannot satisfy the required four-day workflow.
revoke all on function public.signup_for_major(uuid) from public,anon,authenticated;

revoke all on public.major_entry_weekend_status,public.major_schedule_groups,public.major_schedule_group_members,public.major_final_placements,public.major_test_event_testers from public,anon,authenticated;
grant select,insert,update,delete on public.major_entry_weekend_status,public.major_schedule_groups,public.major_schedule_group_members to authenticated;
grant select on public.major_final_placements to authenticated;
grant execute on function public.configure_major_signup_release(uuid,integer,timestamptz,integer,boolean,timestamptz,uuid,text) to authenticated;
grant execute on function public.create_major_time_slot(uuid,timestamp,text) to authenticated;
grant execute on function public.release_additional_major_spots(uuid,integer) to authenticated;
grant execute on function public.signup_for_major_with_slots(uuid,uuid[]) to authenticated;
grant execute on function public.get_major_signup_status(uuid) to anon,authenticated;
grant execute on function public.get_my_major_signup_schedule(uuid) to authenticated;
grant execute on function public.admin_set_major_day_choice(uuid,uuid,uuid) to authenticated;
grant execute on function public.set_major_weekend_status(uuid,text) to authenticated;
grant execute on function public.save_major_final_placement(uuid,text,integer,text,boolean,boolean,boolean) to authenticated;
grant execute on function public.get_public_major_results(uuid) to anon,authenticated;
grant execute on function public.get_public_major_player_history(uuid) to anon,authenticated;
grant execute on function public.publish_major_weekend_field(uuid) to authenticated;
grant execute on function public.save_major_schedule_group(uuid,uuid,uuid,uuid,text,text,text,text,text,boolean,boolean,uuid[]) to authenticated;
grant execute on function public.delete_major_schedule_group(uuid) to authenticated;
grant execute on function public.save_major_event_information(uuid,text,text,text,text,text,text,text,text) to authenticated;
grant execute on function public.is_current_user_major_test_tester(uuid) to authenticated;
grant execute on function public.add_major_test_tester(uuid,uuid) to authenticated;
grant execute on function public.remove_major_test_tester(uuid,uuid) to authenticated;
grant execute on function public.get_major_test_testers(uuid) to authenticated;
grant execute on function public.set_major_test_event_listing(uuid,boolean) to authenticated;

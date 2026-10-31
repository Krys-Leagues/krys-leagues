begin;

create table if not exists public.pyp_roster_versions (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete restrict,
  division_count integer not null check (division_count between 1 and 20),
  status text not null default 'draft' check (status in ('draft', 'approved', 'locked', 'cancelled')),
  source_final_scorecard_id uuid null,
  approved_at timestamptz null,
  approved_by uuid null references auth.users(id) on delete set null,
  approval_note text null,
  locked_at timestamptz null,
  locked_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists pyp_roster_versions_current_season_uidx
  on public.pyp_roster_versions(season_id)
  where status in ('draft', 'approved');

create table if not exists public.pyp_division_roster_slots (
  id uuid primary key default gen_random_uuid(),
  roster_version_id uuid not null references public.pyp_roster_versions(id) on delete restrict,
  season_id uuid not null references public.seasons(id) on delete restrict,
  division_number integer not null check (division_number > 0),
  slot_number smallint not null check (slot_number between 1 and 4),
  player_id uuid null references public.players(id) on delete restrict,
  player_screen_name text null,
  slot_status text not null default 'empty' check (slot_status in ('empty', 'active')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pyp_roster_slot_position_key unique (roster_version_id, division_number, slot_number),
  constraint pyp_roster_slot_empty_consistency check (
    (player_id is null and player_screen_name is null and slot_status = 'empty')
    or
    (player_id is not null and player_screen_name is not null and slot_status = 'active')
  )
);

create unique index if not exists pyp_roster_slot_player_uidx
  on public.pyp_division_roster_slots(roster_version_id, player_id)
  where player_id is not null;

create table if not exists public.pyp_schedule_state (
  season_id uuid primary key references public.seasons(id) on delete restrict,
  change_revision integer not null default 0 check (change_revision >= 0),
  generated_revision integer not null default 0 check (generated_revision >= 0),
  reviewed_revision integer not null default 0 check (reviewed_revision >= 0),
  posted_revision integer not null default 0 check (posted_revision >= 0),
  generated_at timestamptz null,
  generated_by uuid null references auth.users(id) on delete set null,
  reviewed_at timestamptz null,
  reviewed_by uuid null references auth.users(id) on delete set null,
  posted_at timestamptz null,
  posted_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.schedule
  add column if not exists pyp_roster_version_id uuid null;

alter table public.schedule
  add column if not exists pyp_home_player_id uuid null,
  add column if not exists pyp_away_player_id uuid null,
  add column if not exists pyp_home_player_screen_name text null,
  add column if not exists pyp_away_player_screen_name text null;

do $do$
begin
  if not exists(select 1 from pg_catalog.pg_constraint where conname='schedule_pyp_home_player_id_fkey' and conrelid='public.schedule'::regclass) then
    alter table public.schedule add constraint schedule_pyp_home_player_id_fkey foreign key(pyp_home_player_id) references public.players(id) on delete restrict;
  end if;
  if not exists(select 1 from pg_catalog.pg_constraint where conname='schedule_pyp_away_player_id_fkey' and conrelid='public.schedule'::regclass) then
    alter table public.schedule add constraint schedule_pyp_away_player_id_fkey foreign key(pyp_away_player_id) references public.players(id) on delete restrict;
  end if;
end;
$do$;

do $do$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'schedule_pyp_roster_version_id_fkey'
      and conrelid = 'public.schedule'::regclass
  ) then
    alter table public.schedule
      add constraint schedule_pyp_roster_version_id_fkey
      foreign key (pyp_roster_version_id)
      references public.pyp_roster_versions(id)
      on delete restrict;
  end if;
end;
$do$;

alter table public.schedule
  drop constraint if exists schedule_managed_pyp_fixture_check;

alter table public.schedule
  add constraint schedule_managed_pyp_fixture_check check (
    lower(btrim(league_type)) is distinct from 'pyp'
    or season_id is null
    or (
      pyp_roster_version_id is not null
      and roster_version_id is null
      and division_number > 0
      and game_number between 1 and 3
      and player1_id is not null
      and player2_id is not null
      and player1_id <> player2_id
      and pyp_home_player_id = player1_id
      and pyp_away_player_id = player2_id
      and pyp_home_player_screen_name is not null
      and pyp_away_player_screen_name is not null
    )
  ) not valid;

create unique index if not exists schedule_managed_pyp_pair_uidx
  on public.schedule (
    season_id,
    division_number,
    least(player1_id, player2_id),
    greatest(player1_id, player2_id)
  )
  where lower(btrim(league_type)) = 'pyp'
    and season_id is not null
    and pyp_roster_version_id is not null
    and player1_id is not null
    and player2_id is not null;

create unique index if not exists results_managed_pyp_schedule_uidx
  on public.results(schedule_id)
  where lower(btrim(league_type)) = 'pyp'
    and schedule_id is not null;

create or replace function public.set_pyp_managed_updated_at()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

create or replace function public.normalize_pyp_roster_slot()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_roster_season_id uuid;
begin
  select roster.season_id into v_roster_season_id
  from public.pyp_roster_versions as roster
  where roster.id = new.roster_version_id;

  if not found or v_roster_season_id <> new.season_id then
    raise exception 'PYP roster slot season does not match its roster version';
  end if;

  if new.player_id is null then
    new.player_screen_name := null;
    new.slot_status := 'empty';
  else
    select player.screen_name into new.player_screen_name
    from public.players as player
    where player.id = new.player_id;

    if not found then
      raise exception 'Selected PYP roster player does not exist';
    end if;

    new.slot_status := 'active';
  end if;

  return new;
end;
$function$;

drop trigger if exists normalize_pyp_roster_slot_trigger on public.pyp_division_roster_slots;
create trigger normalize_pyp_roster_slot_trigger
before insert or update on public.pyp_division_roster_slots
for each row execute function public.normalize_pyp_roster_slot();

drop trigger if exists pyp_roster_versions_updated_at_trigger on public.pyp_roster_versions;
create trigger pyp_roster_versions_updated_at_trigger
before update on public.pyp_roster_versions
for each row execute function public.set_pyp_managed_updated_at();

drop trigger if exists pyp_roster_slots_updated_at_trigger on public.pyp_division_roster_slots;
create trigger pyp_roster_slots_updated_at_trigger
before update on public.pyp_division_roster_slots
for each row execute function public.set_pyp_managed_updated_at();

drop trigger if exists pyp_schedule_state_updated_at_trigger on public.pyp_schedule_state;
create trigger pyp_schedule_state_updated_at_trigger
before update on public.pyp_schedule_state
for each row execute function public.set_pyp_managed_updated_at();

alter table public.pyp_roster_versions enable row level security;
alter table public.pyp_division_roster_slots enable row level security;
alter table public.pyp_schedule_state enable row level security;

drop policy if exists "Authenticated users can read managed PYP roster versions" on public.pyp_roster_versions;
create policy "Authenticated users can read managed PYP roster versions"
  on public.pyp_roster_versions for select to authenticated using (true);

drop policy if exists "Authenticated users can read managed PYP roster slots" on public.pyp_division_roster_slots;
create policy "Authenticated users can read managed PYP roster slots"
  on public.pyp_division_roster_slots for select to authenticated using (true);

drop policy if exists "Authenticated users can read managed PYP schedule state" on public.pyp_schedule_state;
create policy "Authenticated users can read managed PYP schedule state"
  on public.pyp_schedule_state for select to authenticated using (true);

grant select on public.pyp_roster_versions to authenticated;
grant select on public.pyp_division_roster_slots to authenticated;
grant select on public.pyp_schedule_state to authenticated;

revoke insert, update, delete on public.pyp_roster_versions from anon, authenticated;
revoke insert, update, delete on public.pyp_division_roster_slots from anon, authenticated;
revoke insert, update, delete on public.pyp_schedule_state from anon, authenticated;

commit;

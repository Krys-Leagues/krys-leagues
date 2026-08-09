begin;

create table if not exists public.match_roster_versions (
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

create unique index if not exists match_roster_versions_current_season_uidx
  on public.match_roster_versions(season_id)
  where status in ('draft', 'approved');

create table if not exists public.match_division_roster_slots (
  id uuid primary key default gen_random_uuid(),
  roster_version_id uuid not null references public.match_roster_versions(id) on delete restrict,
  season_id uuid not null references public.seasons(id) on delete restrict,
  division_number integer not null check (division_number > 0),
  slot_number smallint not null check (slot_number between 1 and 4),
  player_id uuid null references public.players(id) on delete restrict,
  player_screen_name text null,
  slot_status text not null default 'empty' check (slot_status in ('empty', 'active')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint match_roster_slot_position_key unique (roster_version_id, division_number, slot_number),
  constraint match_roster_slot_empty_consistency check (
    (player_id is null and player_screen_name is null and slot_status = 'empty')
    or
    (player_id is not null and player_screen_name is not null and slot_status = 'active')
  )
);

create unique index if not exists match_roster_slot_player_uidx
  on public.match_division_roster_slots(roster_version_id, player_id)
  where player_id is not null;

create table if not exists public.match_division_course_overrides (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete restrict,
  division_number integer not null check (division_number > 0),
  game1_course_override text null,
  game2_course_override text null,
  game3_course_override text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint match_division_course_overrides_key unique (season_id, division_number),
  constraint match_course_override_nonblank check (
    (game1_course_override is null or btrim(game1_course_override) <> '')
    and (game2_course_override is null or btrim(game2_course_override) <> '')
    and (game3_course_override is null or btrim(game3_course_override) <> '')
  )
);

create table if not exists public.match_schedule_state (
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
  add column if not exists match_roster_version_id uuid null;

do $do$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'schedule_match_roster_version_id_fkey'
      and conrelid = 'public.schedule'::regclass
  ) then
    alter table public.schedule
      add constraint schedule_match_roster_version_id_fkey
      foreign key (match_roster_version_id)
      references public.match_roster_versions(id)
      on delete restrict;
  end if;
end;
$do$;

alter table public.schedule
  drop constraint if exists schedule_managed_match_fixture_check;

alter table public.schedule
  add constraint schedule_managed_match_fixture_check check (
    lower(btrim(league_type)) is distinct from 'match'
    or season_id is null
    or (
      match_roster_version_id is not null
      and roster_version_id is null
      and division_number > 0
      and game_number between 1 and 3
      and player1_id is not null
      and player2_id is not null
      and player1_id <> player2_id
    )
  ) not valid;

create unique index if not exists schedule_managed_match_pair_uidx
  on public.schedule (
    season_id,
    division_number,
    least(player1_id, player2_id),
    greatest(player1_id, player2_id)
  )
  where lower(btrim(league_type)) = 'match'
    and season_id is not null
    and match_roster_version_id is not null
    and player1_id is not null
    and player2_id is not null;

create unique index if not exists results_managed_match_schedule_uidx
  on public.results(schedule_id)
  where lower(btrim(league_type)) = 'match'
    and schedule_id is not null;

create or replace function public.set_match_managed_updated_at()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

create or replace function public.normalize_match_roster_slot()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_roster_season_id uuid;
begin
  select roster.season_id into v_roster_season_id
  from public.match_roster_versions as roster
  where roster.id = new.roster_version_id;

  if not found or v_roster_season_id <> new.season_id then
    raise exception 'Match roster slot season does not match its roster version';
  end if;

  if new.player_id is null then
    new.player_screen_name := null;
    new.slot_status := 'empty';
  else
    select player.screen_name into new.player_screen_name
    from public.players as player
    where player.id = new.player_id;

    if not found then
      raise exception 'Selected Match roster player does not exist';
    end if;

    new.slot_status := 'active';
  end if;

  return new;
end;
$function$;

drop trigger if exists normalize_match_roster_slot_trigger on public.match_division_roster_slots;
create trigger normalize_match_roster_slot_trigger
before insert or update on public.match_division_roster_slots
for each row execute function public.normalize_match_roster_slot();

drop trigger if exists match_roster_versions_updated_at_trigger on public.match_roster_versions;
create trigger match_roster_versions_updated_at_trigger
before update on public.match_roster_versions
for each row execute function public.set_match_managed_updated_at();

drop trigger if exists match_roster_slots_updated_at_trigger on public.match_division_roster_slots;
create trigger match_roster_slots_updated_at_trigger
before update on public.match_division_roster_slots
for each row execute function public.set_match_managed_updated_at();

drop trigger if exists match_course_overrides_updated_at_trigger on public.match_division_course_overrides;
create trigger match_course_overrides_updated_at_trigger
before update on public.match_division_course_overrides
for each row execute function public.set_match_managed_updated_at();

drop trigger if exists match_schedule_state_updated_at_trigger on public.match_schedule_state;
create trigger match_schedule_state_updated_at_trigger
before update on public.match_schedule_state
for each row execute function public.set_match_managed_updated_at();

alter table public.match_roster_versions enable row level security;
alter table public.match_division_roster_slots enable row level security;
alter table public.match_division_course_overrides enable row level security;
alter table public.match_schedule_state enable row level security;

drop policy if exists "Authenticated users can read managed Match roster versions" on public.match_roster_versions;
create policy "Authenticated users can read managed Match roster versions"
  on public.match_roster_versions for select to authenticated using (true);

drop policy if exists "Authenticated users can read managed Match roster slots" on public.match_division_roster_slots;
create policy "Authenticated users can read managed Match roster slots"
  on public.match_division_roster_slots for select to authenticated using (true);

drop policy if exists "Authenticated users can read managed Match course overrides" on public.match_division_course_overrides;
create policy "Authenticated users can read managed Match course overrides"
  on public.match_division_course_overrides for select to authenticated using (true);

drop policy if exists "Authenticated users can read managed Match schedule state" on public.match_schedule_state;
create policy "Authenticated users can read managed Match schedule state"
  on public.match_schedule_state for select to authenticated using (true);

grant select on public.match_roster_versions to authenticated;
grant select on public.match_division_roster_slots to authenticated;
grant select on public.match_division_course_overrides to authenticated;
grant select on public.match_schedule_state to authenticated;

revoke insert, update, delete on public.match_roster_versions from anon, authenticated;
revoke insert, update, delete on public.match_division_roster_slots from anon, authenticated;
revoke insert, update, delete on public.match_division_course_overrides from anon, authenticated;
revoke insert, update, delete on public.match_schedule_state from anon, authenticated;

commit;

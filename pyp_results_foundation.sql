begin;

create table if not exists public.pyp_managed_results (
  id uuid primary key default gen_random_uuid(),
  result_id uuid not null unique references public.results(id) on delete restrict,
  schedule_id uuid not null unique references public.schedule(id) on delete restrict,
  season_id uuid not null references public.seasons(id) on delete restrict,
  roster_version_id uuid not null references public.pyp_roster_versions(id) on delete restrict,
  division_number integer not null check (division_number > 0),
  game_number integer not null check (game_number between 1 and 3),
  home_player_id uuid not null references public.players(id) on delete restrict,
  away_player_id uuid not null references public.players(id) on delete restrict,
  home_player_screen_name text not null check (btrim(home_player_screen_name) <> ''),
  away_player_screen_name text not null check (btrim(away_player_screen_name) <> ''),
  course1_name text not null check (btrim(course1_name) <> ''),
  course1_difficulty text null check (course1_difficulty in ('Easy', 'Hard')),
  course1_home_hw integer not null check (course1_home_hw >= 0),
  course1_away_hw integer not null check (course1_away_hw >= 0),
  course2_name text not null check (btrim(course2_name) <> ''),
  course2_difficulty text null check (course2_difficulty in ('Easy', 'Hard')),
  course2_home_hw integer not null check (course2_home_hw >= 0),
  course2_away_hw integer not null check (course2_away_hw >= 0),
  home_total_hw integer generated always as (course1_home_hw + course2_home_hw) stored,
  away_total_hw integer generated always as (course1_away_hw + course2_away_hw) stored,
  winner_player_id uuid null references public.players(id) on delete restrict,
  is_draw boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pyp_managed_result_distinct_players check (home_player_id <> away_player_id),
  constraint pyp_managed_result_outcome_consistency check (
    (home_total_hw = away_total_hw and is_draw and winner_player_id is null)
    or (home_total_hw > away_total_hw and not is_draw and winner_player_id = home_player_id)
    or (away_total_hw > home_total_hw and not is_draw and winner_player_id = away_player_id)
  )
);

-- Existing Batch 2 installations may already contain test results. Keep the
-- new fields nullable so those rows are not silently rewritten; correcting a
-- result through save_pyp_result supplies and validates both difficulties.
alter table public.pyp_managed_results
  add column if not exists course1_difficulty text null,
  add column if not exists course2_difficulty text null;

alter table public.pyp_managed_results
  drop constraint if exists pyp_managed_results_course1_difficulty_check,
  add constraint pyp_managed_results_course1_difficulty_check
    check (course1_difficulty is null or course1_difficulty in ('Easy', 'Hard')),
  drop constraint if exists pyp_managed_results_course2_difficulty_check,
  add constraint pyp_managed_results_course2_difficulty_check
    check (course2_difficulty is null or course2_difficulty in ('Easy', 'Hard'));

create index if not exists pyp_managed_results_season_division_idx
  on public.pyp_managed_results(season_id, division_number, game_number);

drop trigger if exists pyp_managed_results_updated_at_trigger on public.pyp_managed_results;
create trigger pyp_managed_results_updated_at_trigger
before update on public.pyp_managed_results
for each row execute function public.set_pyp_managed_updated_at();

alter table public.pyp_managed_results enable row level security;
drop policy if exists "Authenticated users can read managed PYP results" on public.pyp_managed_results;
create policy "Authenticated users can read managed PYP results"
  on public.pyp_managed_results for select to authenticated using (true);
grant select on public.pyp_managed_results to authenticated;
revoke insert, update, delete on public.pyp_managed_results from anon, authenticated;

commit;

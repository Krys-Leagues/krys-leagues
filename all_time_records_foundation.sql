begin;

create table if not exists public.all_time_courses (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]+$'),
  base_map text not null check (btrim(base_map) <> ''),
  difficulty text not null check (difficulty in ('Easy', 'Hard')),
  display_name text not null unique check (btrim(display_name) <> ''),
  photo_path text null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint all_time_courses_base_difficulty_key unique (base_map, difficulty)
);

create table if not exists public.all_time_course_source_mappings (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('historical_workbook', 'manual_admin', 'legacy_combined_snapshot')),
  source_course_name text not null check (btrim(source_course_name) <> ''),
  difficulty text not null check (difficulty in ('Easy', 'Hard')),
  course_id uuid not null references public.all_time_courses(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint all_time_course_source_mapping_key unique (source_type, source_course_name, difficulty)
);

create table if not exists public.all_time_source_batches (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('historical_workbook', 'manual_admin', 'legacy_combined_snapshot')),
  original_filename text not null check (btrim(original_filename) <> ''),
  source_worksheet text null,
  file_sha256 text not null check (file_sha256 ~ '^[0-9a-f]{64}$'),
  imported_by uuid not null references auth.users(id) on delete restrict,
  imported_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists all_time_source_batch_fingerprint_uidx
  on public.all_time_source_batches(source_type, file_sha256, coalesce(source_worksheet, ''));

create table if not exists public.all_time_record_observations (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.all_time_source_batches(id) on delete restrict,
  course_id uuid not null references public.all_time_courses(id) on delete restrict,
  player_id uuid null references public.players(id) on delete set null,
  identity_status text not null check (identity_status in ('resolved', 'unresolved', 'ambiguous')),
  historical_player_name text not null check (btrim(historical_player_name) <> ''),
  score integer not null,
  source_course_name text not null check (btrim(source_course_name) <> ''),
  source_row integer null check (source_row is null or source_row > 0),
  source_name_cell text null,
  source_score_cell text null,
  source_rank integer null check (source_rank is null or source_rank > 0),
  fingerprint text not null unique check (fingerprint ~ '^[0-9a-f]{64}$'),
  observed_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint all_time_observation_identity_check check (
    (identity_status = 'resolved' and player_id is not null)
    or (identity_status in ('unresolved', 'ambiguous') and player_id is null)
  )
);

create index if not exists all_time_observations_course_score_idx
  on public.all_time_record_observations(course_id, score);
create index if not exists all_time_observations_player_idx
  on public.all_time_record_observations(player_id) where player_id is not null;
create index if not exists all_time_observations_historical_name_idx
  on public.all_time_record_observations(historical_player_name);

create table if not exists public.all_time_best_records (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.all_time_courses(id) on delete restrict,
  player_id uuid not null references public.players(id) on delete restrict,
  best_observation_id uuid not null references public.all_time_record_observations(id) on delete restrict,
  score integer not null,
  historical_player_name text not null check (btrim(historical_player_name) <> ''),
  first_recorded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint all_time_best_player_course_key unique (player_id, course_id)
);

create index if not exists all_time_best_course_score_idx
  on public.all_time_best_records(course_id, score, player_id);

create table if not exists public.all_time_combined_observations (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid null references public.all_time_source_batches(id) on delete restrict,
  player_id uuid null references public.players(id) on delete set null,
  historical_player_name text not null check (btrim(historical_player_name) <> ''),
  base_map text not null check (btrim(base_map) <> ''),
  easy_score integer not null,
  hard_score integer not null,
  combined_score integer generated always as (easy_score + hard_score) stored,
  ingestion_method text not null check (ingestion_method in ('manual_admin', 'legacy_snapshot')),
  source_authority text null check (source_authority in ('KWT', 'PRO')),
  verification_status text not null check (verification_status in ('verified', 'pending_source_verification')),
  official_eligible boolean generated always as (
    verification_status = 'verified' and source_authority in ('KWT', 'PRO')
  ) stored,
  legacy_combined_course_record_id uuid null,
  proof_url text null,
  played_at date null,
  notes text null,
  fingerprint text not null unique check (fingerprint ~ '^[0-9a-f]{64}$'),
  recorded_by uuid not null references auth.users(id) on delete restrict,
  recorded_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint all_time_combined_verified_source_check check (
    (verification_status = 'verified' and source_authority in ('KWT', 'PRO'))
    or (verification_status = 'pending_source_verification' and source_authority is null)
  ),
  constraint all_time_combined_manual_source_check check (
    ingestion_method <> 'manual_admin'
    or (verification_status = 'verified' and source_authority in ('KWT', 'PRO'))
  ),
  constraint all_time_combined_legacy_pending_check check (
    ingestion_method <> 'legacy_snapshot'
    or verification_status = 'pending_source_verification'
  )
);

create unique index if not exists all_time_combined_legacy_id_uidx
  on public.all_time_combined_observations(legacy_combined_course_record_id)
  where legacy_combined_course_record_id is not null;
create index if not exists all_time_combined_review_idx
  on public.all_time_combined_observations(base_map, verification_status, source_authority);

create table if not exists public.all_time_combined_best_records (
  id uuid primary key default gen_random_uuid(),
  base_map text not null check (btrim(base_map) <> ''),
  player_id uuid not null references public.players(id) on delete restrict,
  best_observation_id uuid not null references public.all_time_combined_observations(id) on delete restrict,
  easy_score integer not null,
  hard_score integer not null,
  combined_score integer generated always as (easy_score + hard_score) stored,
  historical_player_name text not null check (btrim(historical_player_name) <> ''),
  source_authority text not null check (source_authority in ('KWT', 'PRO')),
  first_recorded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint all_time_combined_best_player_map_key unique (player_id, base_map)
);

create index if not exists all_time_combined_best_map_score_idx
  on public.all_time_combined_best_records(base_map, combined_score, player_id);

insert into public.all_time_courses (code, base_map, difficulty, display_name, photo_path, active)
values
  ('AME', 'Arizona Modern', 'Easy', 'Arizona Modern Easy', null, true),
  ('AMH', 'Arizona Modern', 'Hard', 'Arizona Modern Hard', null, true)
on conflict (code) do update
set base_map = excluded.base_map,
    difficulty = excluded.difficulty,
    display_name = excluded.display_name,
    active = excluded.active,
    updated_at = now();

insert into public.all_time_course_source_mappings (
  source_type,
  source_course_name,
  difficulty,
  course_id
)
select
  'historical_workbook',
  'Arazona Modern',
  course.difficulty,
  course.id
from public.all_time_courses as course
where course.code in ('AME', 'AMH')
on conflict (source_type, source_course_name, difficulty) do update
set course_id = excluded.course_id;

alter table public.all_time_courses enable row level security;
alter table public.all_time_course_source_mappings enable row level security;
alter table public.all_time_source_batches enable row level security;
alter table public.all_time_record_observations enable row level security;
alter table public.all_time_best_records enable row level security;
alter table public.all_time_combined_observations enable row level security;
alter table public.all_time_combined_best_records enable row level security;

drop policy if exists all_time_courses_authenticated_select on public.all_time_courses;
create policy all_time_courses_authenticated_select on public.all_time_courses
  for select to authenticated using (true);
drop policy if exists all_time_course_mappings_authenticated_select on public.all_time_course_source_mappings;
create policy all_time_course_mappings_authenticated_select on public.all_time_course_source_mappings
  for select to authenticated using (true);
drop policy if exists all_time_batches_admin_select on public.all_time_source_batches;
create policy all_time_batches_admin_select on public.all_time_source_batches
  for select to authenticated using (public.is_current_user_site_admin());
drop policy if exists all_time_observations_admin_select on public.all_time_record_observations;
create policy all_time_observations_admin_select on public.all_time_record_observations
  for select to authenticated using (public.is_current_user_site_admin());
drop policy if exists all_time_best_admin_select on public.all_time_best_records;
create policy all_time_best_admin_select on public.all_time_best_records
  for select to authenticated using (public.is_current_user_site_admin());
drop policy if exists all_time_combined_observations_admin_select on public.all_time_combined_observations;
create policy all_time_combined_observations_admin_select on public.all_time_combined_observations
  for select to authenticated using (public.is_current_user_site_admin());
drop policy if exists all_time_combined_best_admin_select on public.all_time_combined_best_records;
create policy all_time_combined_best_admin_select on public.all_time_combined_best_records
  for select to authenticated using (public.is_current_user_site_admin());

grant select on public.all_time_courses, public.all_time_course_source_mappings to authenticated;
grant select on public.all_time_source_batches, public.all_time_record_observations,
  public.all_time_best_records, public.all_time_combined_observations,
  public.all_time_combined_best_records to authenticated;

revoke insert, update, delete on public.all_time_courses, public.all_time_course_source_mappings,
  public.all_time_source_batches, public.all_time_record_observations,
  public.all_time_best_records, public.all_time_combined_observations,
  public.all_time_combined_best_records from public, anon, authenticated;

commit;

begin;

create table if not exists public.all_time_scorecard_attachments (
  id uuid primary key default gen_random_uuid(),
  observation_id uuid not null unique references public.all_time_record_observations(id) on delete restrict,
  player_id uuid not null references public.players(id) on delete restrict,
  course_id uuid not null references public.all_time_courses(id) on delete restrict,
  storage_path text not null unique check (btrim(storage_path) <> ''),
  original_file_name text not null check (btrim(original_file_name) <> ''),
  content_type text not null check (content_type in ('image/jpeg','image/png','image/webp','image/gif')),
  byte_size bigint not null check (byte_size > 0 and byte_size <= 10485760),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  uploaded_at timestamptz not null default clock_timestamp(),
  uploaded_by uuid not null references auth.users(id) on delete restrict
);

create index if not exists all_time_scorecard_attachments_player_course_idx
  on public.all_time_scorecard_attachments(player_id, course_id, uploaded_at desc);

alter table public.all_time_scorecard_attachments enable row level security;
revoke all on table public.all_time_scorecard_attachments from public, anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'all-time-scorecards',
  'all-time-scorecards',
  false,
  10485760,
  array['image/jpeg','image/png','image/webp','image/gif']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

commit;

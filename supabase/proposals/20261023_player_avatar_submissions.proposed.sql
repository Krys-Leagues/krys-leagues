-- Local proposal only. Do not execute without separate Production authorization.
begin;

insert into storage.buckets (id, name, public)
values ('player-avatar-submissions', 'player-avatar-submissions', false)
on conflict (id) do update set public = false;

create table if not exists public.player_avatar_submissions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete restrict,
  storage_bucket text not null default 'player-avatar-submissions' check (storage_bucket = 'player-avatar-submissions'),
  storage_path text not null unique,
  original_filename text not null check (char_length(original_filename) between 1 and 255),
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp', 'image/gif')),
  file_size_bytes integer not null check (file_size_bytes between 1 and 5242880),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'UPLOADING' check (status in ('UPLOADING', 'PENDING', 'APPROVED', 'REJECTED')),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  review_note text
);

create index if not exists player_avatar_submissions_player_pending_idx
  on public.player_avatar_submissions (player_id, submitted_at desc)
  where status = 'PENDING';

alter table public.player_avatar_submissions enable row level security;
revoke all on public.player_avatar_submissions from anon, authenticated;

commit;

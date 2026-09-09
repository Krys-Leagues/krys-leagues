-- Course Challenges foundation for review. This file is intentionally not run by the
-- Course Challenges build pass. It stores evidence and awards separately from the
-- authoritative all_time_courses / hole_pars catalog.

create table if not exists public.course_challenge_progress (
  player_id uuid not null references public.players(id) on delete cascade,
  course_slug text not null,
  level_number integer not null check (level_number between 1 and 5),
  easy_status text not null default 'pending' check (easy_status in ('pending','approved','rejected')),
  hard_status text not null default 'pending' check (hard_status in ('pending','approved','rejected')),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (player_id, course_slug, level_number)
);

create table if not exists public.course_challenge_submissions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  course_slug text not null,
  challenge_key text not null default 'level' check (challenge_key in ('level','ace')),
  level_number integer not null check (level_number between 1 and 5),
  difficulty text not null check (difficulty in ('Easy','Hard')),
  proof_photo_path text not null,
  round_date date not null,
  round_time time not null,
  game_mode text not null check (game_mode in ('solo','multiplayer')),
  hole_scores jsonb not null,
  calculated_total integer not null,
  total_par integer not null,
  relative_to_par integer not null,
  metrics jsonb not null,
  requirements_evaluation jsonb not null,
  auto_evaluation_status text not null check (auto_evaluation_status in ('auto_pass','auto_fail','needs_review')),
  photo_total_check text not null check (photo_total_check in ('passed','needs_review')),
  status text not null default 'needs_review' check (status in ('pending','needs_review','approved','rejected')),
  review_reason text,
  review_notes text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists course_challenge_submissions_review_idx on public.course_challenge_submissions(status, created_at);
create index if not exists course_challenge_submissions_player_idx on public.course_challenge_submissions(player_id, course_slug, level_number, difficulty);

create table if not exists public.course_challenge_rewards (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  reward_key text not null,
  label text not null,
  kind text not null check (kind in ('sticker','badge')),
  course_slug text not null,
  level integer,
  awarded_by uuid references auth.users(id) on delete set null,
  earned_at timestamptz not null default now(),
  unique (player_id, reward_key)
);

create table if not exists public.course_challenge_profile_selections (
  player_id uuid primary key references public.players(id) on delete cascade,
  selected_reward_key text,
  updated_at timestamptz not null default now()
);

alter table public.course_challenge_progress enable row level security;
alter table public.course_challenge_submissions enable row level security;
alter table public.course_challenge_rewards enable row level security;
alter table public.course_challenge_profile_selections enable row level security;

-- Course Challenge player_id columns are canonical public.players.id values. The
-- existing current_user_canonical_player_id() resolver maps the signed-in
-- Discord identity to that canonical player UUID. Do not compare these columns
-- directly to auth.uid(), which is an auth.users UUID.
drop policy if exists course_challenge_progress_public_read on public.course_challenge_progress;
create policy course_challenge_progress_public_read on public.course_challenge_progress
  for select to anon, authenticated using (true);
drop policy if exists course_challenge_rewards_public_read on public.course_challenge_rewards;
create policy course_challenge_rewards_public_read on public.course_challenge_rewards
  for select to anon, authenticated using (true);

drop policy if exists course_challenge_submissions_own_read on public.course_challenge_submissions;
create policy course_challenge_submissions_own_read on public.course_challenge_submissions
  for select to authenticated
  using (player_id = public.current_user_canonical_player_id() or public.is_current_user_site_admin());
drop policy if exists course_challenge_submissions_own_insert on public.course_challenge_submissions;
create policy course_challenge_submissions_own_insert on public.course_challenge_submissions
  for insert to authenticated
  with check (player_id = public.current_user_canonical_player_id());

drop policy if exists course_challenge_profile_selection_own_read on public.course_challenge_profile_selections;
create policy course_challenge_profile_selection_own_read on public.course_challenge_profile_selections
  for select to authenticated
  using (player_id = public.current_user_canonical_player_id() or public.is_current_user_site_admin());
drop policy if exists course_challenge_profile_selection_own_write on public.course_challenge_profile_selections;
create policy course_challenge_profile_selection_own_write on public.course_challenge_profile_selections
  for all to authenticated
  using (player_id = public.current_user_canonical_player_id())
  with check (
    player_id = public.current_user_canonical_player_id()
    and (
      selected_reward_key is null
      or exists (
        select 1
        from public.course_challenge_rewards as reward
        where reward.player_id = public.current_user_canonical_player_id()
          and reward.reward_key = selected_reward_key
      )
    )
  );

insert into storage.buckets (id, name, public)
values ('course-challenge-proof', 'course-challenge-proof', false)
on conflict (id) do nothing;

-- Proof objects use the established auth-owned folder namespace. This is a
-- storage ownership boundary, not the Course Challenge player identity; the
-- database player_id columns above remain canonical public.players.id values.
drop policy if exists course_challenge_proof_own_upload on storage.objects;
create policy course_challenge_proof_own_upload on storage.objects
  for insert to authenticated
  with check (bucket_id = 'course-challenge-proof' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists course_challenge_proof_admin_read on storage.objects;
drop policy if exists course_challenge_proof_owner_or_admin_read on storage.objects;
create policy course_challenge_proof_owner_or_admin_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'course-challenge-proof'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_current_user_site_admin()
    )
  );
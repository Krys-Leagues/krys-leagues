alter table public.course_challenge_submissions
  add column if not exists submission_source text not null default 'player_submission',
  add column if not exists source_idempotency_key text,
  add column if not exists source_discord_user_id text,
  add column if not exists source_metadata jsonb not null default '{}'::jsonb;

alter table public.course_challenge_submissions
  drop constraint if exists course_challenge_submissions_submission_source_check;

alter table public.course_challenge_submissions
  add constraint course_challenge_submissions_submission_source_check
  check (submission_source in ('player_submission', 'discord_course_challenge_game'));

create unique index if not exists course_challenge_submissions_source_idempotency_idx
  on public.course_challenge_submissions(source_idempotency_key)
  where source_idempotency_key is not null;

comment on column public.course_challenge_submissions.source_idempotency_key is
  'Stable server-to-server delivery key. Retries return the existing review submission.';
comment on column public.course_challenge_submissions.source_metadata is
  'Non-authoritative provenance for admin review; never used to award progress automatically.';

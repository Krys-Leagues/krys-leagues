-- Additive Course Challenges tester UX support.
-- Player-entered scores remain the numeric evaluation source. Date/time and
-- Game Mode stay nullable because the player no longer enters them; missing
-- proof metadata is routed to admin review instead of being guessed.

alter table public.course_challenge_submissions
  alter column round_date drop not null,
  alter column round_time drop not null,
  alter column game_mode drop not null;

alter table public.course_challenge_submissions
  add column if not exists entered_final_score integer,
  add column if not exists final_score_check text;

alter table public.course_challenge_submissions
  drop constraint if exists course_challenge_submissions_final_score_check_check;

alter table public.course_challenge_submissions
  add constraint course_challenge_submissions_final_score_check_check
  check (final_score_check is null or final_score_check in ('passed','needs_review'));

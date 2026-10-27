-- Additive production repair for the Course Challenge -> All-Time -> Climbers integration.
-- Safe to run after course_challenges_all_time_integration.sql; unrelated history is untouched.

alter table public.climbers_events
  add column if not exists effective_order integer,
  add column if not exists effective_time_precision text not null default 'exact';

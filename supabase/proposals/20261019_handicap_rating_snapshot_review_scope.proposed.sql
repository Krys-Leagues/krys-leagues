-- Phase 65 proposal only. Do not execute against Production without the
-- read-only preflight in docs/handicap/phase65/production_review_scope_preflight.sql.
-- This migration preserves existing rows and does not import rating data.

begin;

do $phase65$
declare
  has_bad_scope boolean;
begin
  if to_regclass('public.handicap_rating_snapshots') is null then
    raise exception 'handicap_rating_snapshots is missing';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.handicap_rating_snapshots'::regclass
      and conname = 'handicap_rating_snapshots_calculation_run_id_course_id_diff_key'
      and pg_get_constraintdef(oid) = 'UNIQUE (calculation_run_id, course_id, difficulty, model_version)'
  ) then
    raise exception 'expected Phase 59 snapshot uniqueness constraint is missing or differs';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'handicap_rating_snapshots'
      and column_name = 'review_scope'
      and data_type <> 'text'
  ) then
    raise exception 'review_scope already exists with an incompatible type';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'handicap_rating_snapshots'
      and column_name = 'review_scope'
  ) then
      execute $check$
        select exists (
          select 1
          from public.handicap_rating_snapshots
          where review_scope is not null
            and review_scope not in ('KWT_ONLY', 'WEEKLY_ONLY', 'KWT_PLUS_WEEKLY')
        )
      $check$ into has_bad_scope;
      if has_bad_scope then
          raise exception 'existing review_scope values are outside the approved contract';
      end if;

      execute $check$
        select exists (
          select 1
          from public.handicap_rating_snapshots
          group by calculation_run_id, course_id, difficulty, model_version, review_scope
          having review_scope is not null and count(*) > 1
        )
      $check$ into has_bad_scope;
      if has_bad_scope then
          raise exception 'existing non-null review_scope rows collide under the corrected identity';
      end if;
  elsif exists (select 1 from public.handicap_rating_snapshots limit 1) then
    raise exception 'existing snapshots require an evidence-backed review_scope backfill before this correction';
  end if;
end $phase65$;

-- A nullable column is intentional: historical rows, if any, cannot be
-- assigned a scope without evidence. The NOT VALID check protects all new
-- rows while preserving those existing records for separate review.
alter table public.handicap_rating_snapshots
  add column review_scope text;

alter table public.handicap_rating_snapshots
  add constraint handicap_rating_snapshots_review_scope_check
  check (review_scope is not null and review_scope in ('KWT_ONLY', 'WEEKLY_ONLY', 'KWT_PLUS_WEEKLY'))
  not valid;

alter table public.handicap_rating_snapshots
  drop constraint handicap_rating_snapshots_calculation_run_id_course_id_diff_key;

alter table public.handicap_rating_snapshots
  add constraint handicap_rating_snapshots_calculation_run_scope_key
  unique (calculation_run_id, course_id, difficulty, model_version, review_scope);

commit;

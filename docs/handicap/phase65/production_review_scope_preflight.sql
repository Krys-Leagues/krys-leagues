-- Read-only Production preflight for Phase 65. Execute statements separately
-- if the SQL client does not return multiple result sets.

select to_regclass('public.handicap_rating_snapshots') as rating_snapshot_table;

select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'handicap_rating_snapshots'
  and column_name = 'review_scope';

select conname, pg_get_constraintdef(oid) as definition, convalidated
from pg_constraint
where conrelid = 'public.handicap_rating_snapshots'::regclass
order by conname;

select count(*) as existing_snapshots
from public.handicap_rating_snapshots;

select attname, format_type(atttypid, atttypmod) as data_type, not attnotnull as is_nullable
from pg_attribute
where attrelid = 'public.handicap_rating_snapshots'::regclass
  and attname = 'review_scope'
  and not attisdropped;

select calculation_run_id, course_id, difficulty, model_version, count(*) as row_count
from public.handicap_rating_snapshots
group by calculation_run_id, course_id, difficulty, model_version
having count(*) > 1;

select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as force_rls,
  pg_get_userbyid(c.relowner) as owner
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'handicap_calculation_runs',
    'handicap_rating_snapshots',
    'handicap_index_snapshots',
    'handicap_review_evidence',
    'handicap_review_decisions',
    'handicap_source_provenance'
  )
order by c.relname;

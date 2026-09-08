
-- READ-ONLY Monthlies Production schema diagnostic.
-- Uses information_schema and pg_catalog only. No DDL/DML/RPC/write operation.
-- Run before the overlap preflight to see whether the unexecuted repaired migration
-- is required before any future import.
WITH expected_columns(table_name, column_name, purpose) AS (
  VALUES
    ('historical_monthly_score_observations', 'id', 'existing observation identifier'),
    ('historical_monthly_score_observations', 'period_id', 'historical period key'),
    ('historical_monthly_score_observations', 'period_year', 'historical year'),
    ('historical_monthly_score_observations', 'period_month', 'historical month'),
    ('historical_monthly_score_observations', 'division', 'historical division label'),
    ('historical_monthly_score_observations', 'historical_player_name', 'exact historical source name'),
    ('historical_monthly_score_observations', 'canonical_player_id', 'public.players.id identity target'),
    ('historical_monthly_score_observations', 'source_player_id', 'source player identifier'),
    ('historical_monthly_score_observations', 'course_name', 'course/game key'),
    ('historical_monthly_score_observations', 'difficulty', 'course difficulty key'),
    ('historical_monthly_score_observations', 'score', 'numeric played score; expected NOT NULL'),
    ('historical_monthly_score_observations', 'played_state', 'explicit PLAYED state added by repaired migration'),
    ('historical_monthly_score_observations', 'source_score_text', 'exact source score text added by repaired migration'),
    ('historical_monthly_score_observations', 'logical_observation_key', 'logical deduplication key added by repaired migration'),
    ('historical_monthly_score_observations', 'source_provenance', 'source attestations added by repaired migration'),
    ('historical_monthly_observation_provenance', 'historical_monthly_score_observation_id', 'provenance foreign key'),
    ('historical_monthly_observation_provenance', 'source_kind', 'old/fresh/admin source kind'),
    ('historical_monthly_observation_provenance', 'source_fingerprint', 'source-level provenance key'),
    ('historical_monthly_observation_provenance', 'source_file', 'source file provenance'),
    ('historical_monthly_observation_provenance', 'source_url', 'source URL provenance'),
    ('historical_monthly_observation_provenance', 'source_score_text', 'exact source score text'),
    ('historical_monthly_observation_provenance', 'played_state', 'provenance played state'),
    ('historical_monthly_observation_provenance', 'raw_sha256', 'raw evidence hash'),
    ('historical_monthly_imports', 'source_sha256', 'import idempotency hash'),
    ('historical_monthly_imports', 'source_row_count', 'source package count'),
    ('historical_monthly_imports', 'applied_row_count', 'applied payload count')
),
current_columns AS (
  SELECT c.table_name, c.column_name, c.data_type, c.is_nullable, c.udt_name
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name IN ('historical_monthly_score_observations', 'historical_monthly_observation_provenance', 'historical_monthly_imports')
),
column_diagnostic AS (
  SELECT 'CURRENT_COLUMN'::text AS result_kind, 'public.' || c.table_name AS object_name,
    c.column_name, c.data_type, c.is_nullable, 'udt=' || c.udt_name AS detail
  FROM current_columns c
  UNION ALL
  SELECT 'EXPECTED_COLUMN', 'public.' || e.table_name, e.column_name,
    coalesce(c.data_type, 'ABSENT'), coalesce(c.is_nullable, 'ABSENT'),
    CASE WHEN c.column_name IS NULL THEN 'MISSING: ' || e.purpose ELSE 'PRESENT: ' || e.purpose END
  FROM expected_columns e
  LEFT JOIN current_columns c ON c.table_name = e.table_name AND c.column_name = e.column_name
),
constraint_diagnostic AS (
  SELECT 'CONSTRAINT'::text AS result_kind, n.nspname || '.' || cls.relname AS object_name,
    con.conname AS column_name, 'constraint'::text AS data_type, NULL::text AS is_nullable,
    pg_get_constraintdef(con.oid) AS detail
  FROM pg_constraint con
  JOIN pg_class cls ON cls.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = cls.relnamespace
  WHERE n.nspname = 'public'
    AND cls.relname IN ('historical_monthly_score_observations', 'historical_monthly_observation_provenance', 'historical_monthly_imports')
),
index_diagnostic AS (
  SELECT 'INDEX'::text AS result_kind, schemaname || '.' || tablename AS object_name,
    indexname AS column_name, 'index'::text AS data_type, NULL::text AS is_nullable, indexdef AS detail
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename IN ('historical_monthly_score_observations', 'historical_monthly_observation_provenance', 'historical_monthly_imports')
),
support_diagnostic AS (
  SELECT *
  FROM (
    VALUES
      ('MIGRATION_SUPPORT', 'public.historical_monthly_observation_provenance', 'table', to_regclass('public.historical_monthly_observation_provenance')::text, 'provenance table expected by repaired migration'),
      ('MIGRATION_SUPPORT', 'public.historical_monthly_logical_observation_key_uidx', 'index', (SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'historical_monthly_logical_observation_key_uidx'), 'logical uniqueness expected by repaired migration'),
      ('MIGRATION_SUPPORT', 'public.commit_historical_monthly_preview(text,text,text,integer,jsonb)', 'function', to_regprocedure('public.commit_historical_monthly_preview(text,text,text,integer,jsonb)')::text, 'reviewed commit function expected by repaired migration')
  ) AS s(result_kind, object_name, column_name, data_type, detail)
)
SELECT result_kind, object_name, column_name, data_type, is_nullable, detail FROM column_diagnostic
UNION ALL SELECT result_kind, object_name, column_name, data_type, is_nullable, detail FROM constraint_diagnostic
UNION ALL SELECT result_kind, object_name, column_name, data_type, is_nullable, detail FROM index_diagnostic
UNION ALL SELECT result_kind, object_name, column_name, data_type, NULL::text AS is_nullable, detail FROM support_diagnostic
ORDER BY result_kind, object_name, column_name;

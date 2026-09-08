WITH fingerprint_groups AS (
  SELECT source_fingerprint
  FROM public.historical_monthly_score_observations
  GROUP BY source_fingerprint
  HAVING COUNT(*) > 1
),
logical_key_groups AS (
  SELECT logical_observation_key
  FROM public.historical_monthly_score_observations
  WHERE logical_observation_key IS NOT NULL
  GROUP BY logical_observation_key
  HAVING COUNT(*) > 1
),
invalid_played_score_rows AS (
  SELECT id
  FROM public.historical_monthly_score_observations
  WHERE played_state <> 'PLAYED'
     OR score IS NULL
)
SELECT
  (SELECT COUNT(*)
   FROM public.historical_monthly_score_observations) AS total_historical_monthly_score_rows,
  (SELECT COUNT(DISTINCT source_fingerprint)
   FROM public.historical_monthly_score_observations) AS distinct_source_fingerprint_count,
  (SELECT COUNT(*)
   FROM public.historical_monthly_score_observations
   WHERE score = 0) AS zero_score_count,
  (SELECT COUNT(*)
   FROM public.historical_monthly_score_observations
   WHERE score < 0) AS negative_score_count,
  (SELECT COUNT(*)
   FROM public.historical_monthly_score_observations
   WHERE score > 0) AS positive_score_count,
  (SELECT COUNT(*) FROM fingerprint_groups) AS duplicate_source_fingerprint_group_count,
  (SELECT COUNT(*) FROM logical_key_groups) AS duplicate_logical_observation_key_group_count,
  (SELECT COUNT(*)
   FROM public.historical_monthly_imports) AS total_historical_monthly_import_count,
  (SELECT COUNT(*) FROM invalid_played_score_rows) AS invalid_played_state_score_relationship_count;

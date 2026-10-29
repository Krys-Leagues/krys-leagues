-- Historical Stroke V2 additive source-token support.
-- Run manually in Supabase only after reviewing this migration.
-- This migration changes constraints only; it does not update, delete, or insert rows.

begin;

alter table public.historical_stroke_v2_observations
  drop constraint if exists historical_stroke_v2_observation_score_state;

alter table public.historical_stroke_v2_observations
  add constraint historical_stroke_v2_observation_score_state check (score_state in (
    'PLAYED / NUMERIC',
    'UNPLAYED / BLANK',
    'UNPLAYED / DASH',
    'UNPLAYED / SOURCE TOKEN',
    'MALFORMED SOURCE',
    'CURRENT / INCOMPLETE / NOT IMPORTABLE'
  ));

alter table public.historical_stroke_v2_observations
  drop constraint if exists historical_stroke_v2_observation_source_token_blocked;

alter table public.historical_stroke_v2_observations
  add constraint historical_stroke_v2_observation_source_token_blocked check (
    score_state <> 'UNPLAYED / SOURCE TOKEN'
    or (played = false and score is null and importable = false)
  );

commit;

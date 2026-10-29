-- Staging-only security chunk 2U: Historical Stroke V2 observations.
-- Public readers do not use this internal observation store directly;
-- protected admin import RPCs retain trusted access.

begin;

alter table public.historical_stroke_v2_observations enable row level security;

revoke all on table public.historical_stroke_v2_observations from public, anon, authenticated;
grant all on table public.historical_stroke_v2_observations to service_role;

commit;

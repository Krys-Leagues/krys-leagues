-- Staging-only security chunk 2L: Historical Stroke V2 review internals.
-- Client access is not used; protected admin RPCs and service_role own these
-- parser/review artifacts.

begin;

alter table public.historical_stroke_v2_malformed_rows enable row level security;
alter table public.historical_stroke_v2_pairing_evidence enable row level security;
alter table public.historical_stroke_v2_pairing_reviews enable row level security;

revoke all on table public.historical_stroke_v2_malformed_rows from public, anon, authenticated;
revoke all on table public.historical_stroke_v2_pairing_evidence from public, anon, authenticated;
revoke all on table public.historical_stroke_v2_pairing_reviews from public, anon, authenticated;

grant all on table public.historical_stroke_v2_malformed_rows to service_role;
grant all on table public.historical_stroke_v2_pairing_evidence to service_role;
grant all on table public.historical_stroke_v2_pairing_reviews to service_role;

commit;

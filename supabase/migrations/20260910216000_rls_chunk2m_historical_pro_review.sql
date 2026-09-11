-- Staging-only security chunk 2M: Historical Pro review internals.
-- Protected admin RPCs and service_role are the only intended access paths.

begin;

alter table public.historical_pro_identity_reviews enable row level security;
alter table public.historical_pro_pairing_reviews enable row level security;

revoke all on table public.historical_pro_identity_reviews from public, anon, authenticated;
revoke all on table public.historical_pro_pairing_reviews from public, anon, authenticated;

grant all on table public.historical_pro_identity_reviews to service_role;
grant all on table public.historical_pro_pairing_reviews to service_role;

commit;

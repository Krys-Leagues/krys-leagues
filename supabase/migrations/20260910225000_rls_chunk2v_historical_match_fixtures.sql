-- Staging-only security chunk 2V: Historical Match fixture facts.
-- Fixture writes remain inside the protected admin preview RPC; the trigger
-- helper remains database-internal and direct client access is unnecessary.

begin;

alter table public.historical_match_fixtures enable row level security;

revoke all on table public.historical_match_fixtures from public, anon, authenticated;
grant all on table public.historical_match_fixtures to service_role;

commit;

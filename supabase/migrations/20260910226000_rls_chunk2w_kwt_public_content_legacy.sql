-- Staging-only security chunk 2W: unused KWT public-content storage.
-- The current KWT public page does not read this table; retain trusted
-- service-role access for future/admin maintenance only.

begin;

alter table public.kwt_public_content enable row level security;

revoke all on table public.kwt_public_content from public, anon, authenticated;
grant all on table public.kwt_public_content to service_role;

commit;

-- Chunk 2AA: protect KWT standings and operational result tables.
-- Public standings are exposed through the existing bounded reader RPC;
-- direct client table access is not required by the current application.

begin;

alter table public.kwt_authoritative_standings enable row level security;
alter table public.kwt_operational_results enable row level security;

revoke all on table public.kwt_authoritative_standings from public, anon, authenticated;
revoke all on table public.kwt_operational_results from public, anon, authenticated;
grant all on table public.kwt_authoritative_standings to service_role;
grant all on table public.kwt_operational_results to service_role;

commit;

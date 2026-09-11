-- Staging-only Major final-placement base-table hardening.
-- Admin reads use the protected Major admin route and writes use the
-- site-admin-protected save_major_final_placement RPC.

revoke all on table public.major_final_placements from public, anon, authenticated;
grant all on table public.major_final_placements to service_role;
alter table public.major_final_placements enable row level security;

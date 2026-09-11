-- Chunk 2Z: protect internal player identity review exclusions.
-- This table is consumed only by site-admin-protected identity RPCs.
-- Direct client reads/writes are intentionally denied; service_role remains trusted.

begin;

alter table public.player_identity_not_matches enable row level security;

revoke all on table public.player_identity_not_matches from public, anon, authenticated;
grant all on table public.player_identity_not_matches to service_role;

commit;

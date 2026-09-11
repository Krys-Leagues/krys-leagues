-- Staging-only Solo admin, player-pool, and roster base-table hardening.
-- Admin reads use /api/admin/solo/data; mutations remain protected RPCs.

revoke all on table
  public.solo_admin_users,
  public.solo_player_pool,
  public.solo_roster_versions,
  public.solo_roster_entries
from public, anon, authenticated;

grant all on table
  public.solo_admin_users,
  public.solo_player_pool,
  public.solo_roster_versions,
  public.solo_roster_entries
to service_role;

alter table public.solo_admin_users enable row level security;
alter table public.solo_player_pool enable row level security;
alter table public.solo_roster_versions enable row level security;
alter table public.solo_roster_entries enable row level security;

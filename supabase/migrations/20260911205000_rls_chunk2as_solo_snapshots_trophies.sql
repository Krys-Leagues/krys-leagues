-- Staging-only Solo frozen snapshot and trophy base-table hardening.
-- Public Solo display uses get_public_solo(); admin standings use the
-- protected Solo admin data route.

revoke all on table
  public.solo_trophies,
  public.solo_week_snapshot_entries,
  public.solo_week_snapshots
from public, anon, authenticated;

grant all on table
  public.solo_trophies,
  public.solo_week_snapshot_entries,
  public.solo_week_snapshots
to service_role;

alter table public.solo_trophies enable row level security;
alter table public.solo_week_snapshot_entries enable row level security;
alter table public.solo_week_snapshots enable row level security;

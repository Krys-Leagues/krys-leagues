begin;

-- Staging-only launch-access hardening. Production is intentionally untouched.
-- Both tables are internal authorization data. Access remains through the
-- existing protected RPCs; no browser role receives direct table access.

alter table public.admin_users enable row level security;
alter table public.site_access_testers enable row level security;

revoke all on table
  public.admin_users,
  public.site_access_testers
from public, anon, authenticated;

grant all on table
  public.admin_users,
  public.site_access_testers
to service_role;

commit;

-- Production RLS batch: internal tables with trusted server/service-role paths.
-- No client policies are created; these tables are not public read models.

alter table public.activity_log enable row level security;
alter table public.import_batches enable row level security;
alter table public.import_rows enable row level security;
alter table public.matches enable row level security;

revoke all on table
  public.activity_log,
  public.import_batches,
  public.import_rows,
  public.matches
from public, anon, authenticated;

grant all on table
  public.activity_log,
  public.import_batches,
  public.import_rows,
  public.matches
to service_role;

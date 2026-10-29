-- Staging-only Solo week and live score-attempt base-table hardening.
-- Admin reads use /api/admin/solo/data; score mutations remain protected RPCs.

revoke all on table
  public.solo_weeks,
  public.solo_score_attempts
from public, anon, authenticated;

grant all on table
  public.solo_weeks,
  public.solo_score_attempts
to service_role;

alter table public.solo_weeks enable row level security;
alter table public.solo_score_attempts enable row level security;

-- Staging-only Major schedule-group and live-scoring base-table hardening.
-- Admin pages read these rows through the protected Major admin route;
-- mutations remain protected RPCs.

revoke all on table
  public.major_schedule_groups,
  public.major_schedule_group_members,
  public.major_scoring_participants,
  public.major_scoring_sessions,
  public.major_hole_scores
from public, anon, authenticated;

grant all on table
  public.major_schedule_groups,
  public.major_schedule_group_members,
  public.major_scoring_participants,
  public.major_scoring_sessions,
  public.major_hole_scores
to service_role;

alter table public.major_schedule_groups enable row level security;
alter table public.major_schedule_group_members enable row level security;
alter table public.major_scoring_participants enable row level security;
alter table public.major_scoring_sessions enable row level security;
alter table public.major_hole_scores enable row level security;

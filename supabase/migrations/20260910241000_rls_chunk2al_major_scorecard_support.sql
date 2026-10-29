-- Chunk 2AL: keep Major scorecard support and test allowlist tables behind
-- their existing protected RPC/server paths.

revoke all on table
  public.major_player_scorecards,
  public.major_player_scorecard_holes,
  public.major_scorecard_audit_log,
  public.major_round_standing_snapshots,
  public.major_test_event_testers
from public, anon, authenticated;

grant all on table
  public.major_player_scorecards,
  public.major_player_scorecard_holes,
  public.major_scorecard_audit_log,
  public.major_round_standing_snapshots,
  public.major_test_event_testers
to service_role;

alter table public.major_player_scorecards enable row level security;
alter table public.major_player_scorecard_holes enable row level security;
alter table public.major_scorecard_audit_log enable row level security;
alter table public.major_round_standing_snapshots enable row level security;
alter table public.major_test_event_testers enable row level security;

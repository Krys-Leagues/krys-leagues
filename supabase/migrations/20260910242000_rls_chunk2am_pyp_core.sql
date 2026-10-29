-- Staging-only PYP core hardening.
-- Admin reads and trusted mutations use protected server/RPC paths.

revoke all on table
  public.pyp_division_roster_slots,
  public.pyp_final_scorecard_entries,
  public.pyp_final_scorecards,
  public.pyp_final_scorecard_fixture_details,
  public.pyp_final_scorecard_player_decisions,
  public.pyp_managed_results,
  public.pyp_schedule_state,
  public.pyp_roster_versions
from public, anon, authenticated;

grant all on table
  public.pyp_division_roster_slots,
  public.pyp_final_scorecard_entries,
  public.pyp_final_scorecards,
  public.pyp_final_scorecard_fixture_details,
  public.pyp_final_scorecard_player_decisions,
  public.pyp_managed_results,
  public.pyp_schedule_state,
  public.pyp_roster_versions
to service_role;

alter table public.pyp_division_roster_slots enable row level security;
alter table public.pyp_final_scorecard_entries enable row level security;
alter table public.pyp_final_scorecards enable row level security;
alter table public.pyp_final_scorecard_fixture_details enable row level security;
alter table public.pyp_final_scorecard_player_decisions enable row level security;
alter table public.pyp_managed_results enable row level security;
alter table public.pyp_schedule_state enable row level security;
alter table public.pyp_roster_versions enable row level security;

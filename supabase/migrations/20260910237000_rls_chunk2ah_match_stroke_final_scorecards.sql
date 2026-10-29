-- Chunk 2AH: keep Match/Stroke final-scorecard support tables server-only.

revoke all on table
  public.match_final_scorecard_entries,
  public.match_final_scorecard_player_decisions,
  public.stroke_final_scorecard_entries,
  public.stroke_final_scorecard_player_decisions
from public, anon, authenticated;

grant all on table
  public.match_final_scorecard_entries,
  public.match_final_scorecard_player_decisions,
  public.stroke_final_scorecard_entries,
  public.stroke_final_scorecard_player_decisions
to service_role;

alter table public.match_final_scorecard_entries enable row level security;
alter table public.match_final_scorecard_player_decisions enable row level security;
alter table public.stroke_final_scorecard_entries enable row level security;
alter table public.stroke_final_scorecard_player_decisions enable row level security;

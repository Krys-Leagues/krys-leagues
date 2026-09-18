import type { ScorecardAdapterKey } from "../core"

export type ScorecardAdapterCompatibility = {
  key: ScorecardAdapterKey
  status: "commit_ready" | "compatible" | "blocked"
  preservedSemantics: string
  nextStep: string
}

export const scorecardAdapterCompatibility: ScorecardAdapterCompatibility[] = [
  { key: "stroke", status: "commit_ready", preservedSemantics: "Two complete player cards; existing lower score-to-par result and GP/W/L/T/STROKES/PTS writer.", nextStep: "Install the shared core migration before enabling intake/review." },
  { key: "match", status: "compatible", preservedSemantics: "Full cards retained separately from existing holes-won result and public score privacy.", nextStep: "Map verified per-hole comparisons to the existing Match HW writer in a separately reviewed adapter." },
  { key: "pyp", status: "compatible", preservedSemantics: "Two explicit course components with Home/Away cards and existing combined-HW writer.", nextStep: "Approve the exact card-to-course component mapping before commit code is enabled." },
  { key: "majors", status: "compatible", preservedSemantics: "Existing Thursday–Sunday draft/submitted/verified 18-hole cards remain authoritative.", nextStep: "Add compatibility links to existing Major scorecards without replacing their working lifecycle." },
  { key: "kwt", status: "compatible", preservedSemantics: "Easy and Hard remain distinct; Handicap behavior is untouched.", nextStep: "Map the current authoritative KWT round source and exact course codes before commit code is enabled." },
  { key: "doubles", status: "compatible", preservedSemantics: "Team ownership is retained rather than assigning team scores to one player.", nextStep: "Confirm the canonical Global Team source and live result writer before commit code is enabled." },
  { key: "amateur_pro", status: "blocked", preservedSemantics: "Shared contexts support canonical division labels without inventing a roster.", nextStep: "Resolve the authoritative current-season/current-roster model first." },
  { key: "all_time", status: "compatible", preservedSemantics: "Existing PB/Climbers chronology and record writers remain untouched.", nextStep: "Add opt-in compatibility links for new verified cards only; do not backfill without separate approval." },
]

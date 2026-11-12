import type { RoundConfig, StudioPlayer, TournamentScoringConfig } from "./types"

export const MGA_STUDIO_CONFIG: TournamentScoringConfig = {
  id: "mga-championship-2026",
  name: "THE MGA CHAMPIONSHIP",
  subtitle: "4 ROUNDS COMBINED · Gardens of Babylon · EASY",
  artwork: "/mga/gardens-of-babylon.png",
  theme: { background: "#07120d", surface: "#0d2419", accent: "#f3c75f", text: "#f8f5e9", muted: "#b9c9be" },
  scoring: { method: "sum-relative-to-par", missingRound: "omit", tieRule: "competition" },
  defaultRoomCapacity: 4,
  rounds: [
    { id: "r1", number: 1, label: "Round 1", date: "2026-11-12", course: "Gardens of Babylon", difficulty: "easy", par: 54 },
    { id: "r2", number: 2, label: "Round 2", date: "2026-11-13", course: "Gardens of Babylon", difficulty: "easy", par: 54 },
    { id: "r3", number: 3, label: "Round 3", date: "2026-11-14", course: "Gardens of Babylon", difficulty: "easy", par: 54 },
    { id: "r4", number: 4, label: "Round 4", date: "2026-11-15", course: "Gardens of Babylon", difficulty: "easy", par: 54 },
  ],
}

// Clearly synthetic records let the protected Preview demonstrate the full UI
// without reading or changing live tournament scores, registrations, or rooms.
export const MGA_DEMO_PLAYERS: StudioPlayer[] = [
  { id: "demo-aria", screenName: "Aria Demo", registrationId: "demo-reg-aria", timeZone: "America/Los_Angeles" },
  { id: "demo-blake", screenName: "Blake Demo", registrationId: "demo-reg-blake", timeZone: "America/New_York" },
  { id: "demo-casey", screenName: "Casey Demo", registrationId: "demo-reg-casey", timeZone: "America/Chicago" },
  { id: "demo-drew", screenName: "Drew Demo", registrationId: "demo-reg-drew", timeZone: "Pacific/Honolulu" },
]

export const MGA_DEMO_ROUNDS: RoundConfig[] = MGA_STUDIO_CONFIG.rounds


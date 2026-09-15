export const LEAGUE_ROSTER_CONFIG = {
  stroke: { label: "Stroke", divisions: ["Stroke D1", "Stroke D2", "Stroke D3", "Stroke D4", "Stroke D5"] },
  match: { label: "Match", divisions: ["Match D1", "Match D2", "Match D3", "Match D4", "Match D5"] },
  doubles: { label: "Doubles", divisions: ["Doubles Elite", "Doubles D1", "Doubles D2", "Doubles D3", "Doubles D4", "Doubles D5"] },
  pyp: { label: "PYP", divisions: ["PYP D1", "PYP D2", "PYP D3", "PYP D4", "PYP D5"] },
  pro: { label: "Pro / Amateur → Pro", divisions: ["Pro D1", "Pro D2", "Pro D3", "Semi Pro D1", "Amateur D1"] },
  solo: { label: "Solo", divisions: ["Master", "Elite", "League 1", "League 2", "League 3", "League 4"] },
} as const

export const CURRENT_PLAYER_LIST_CONFIG = {
  all_time: { label: "All-Time Players", historyLabel: "All-Time observations and PB history" },
  monthly: { label: "Monthly Players", historyLabel: "Historical Monthly score observations" },
  kwt: { label: "KWT Players", historyLabel: "Historical KWT scorecards and results" },
} as const

export type LeagueType = keyof typeof LEAGUE_ROSTER_CONFIG
export type CurrentPlayerListKey = keyof typeof CURRENT_PLAYER_LIST_CONFIG

export function normalizeLeagueType(value: string | null | undefined): LeagueType | null {
  const normalized = value?.trim().toLowerCase() || ""
  return normalized in LEAGUE_ROSTER_CONFIG ? normalized as LeagueType : null
}

export function normalizeListKey(value: string | null | undefined): CurrentPlayerListKey | null {
  const normalized = value?.trim().toLowerCase() || ""
  return normalized in CURRENT_PLAYER_LIST_CONFIG ? normalized as CurrentPlayerListKey : null
}

export function divisionAllowed(leagueType: LeagueType, division: string) {
  return (LEAGUE_ROSTER_CONFIG[leagueType].divisions as readonly string[]).includes(division)
}

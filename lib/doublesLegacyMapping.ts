export type LegacyDoublesTeam = {
  source: "doubles_teams" | "schedule" | "results"
  key: string
  name: string
  player1Name: string | null
  player2Name: string | null
  player1Id: string | null
  player2Id: string | null
  seasonId: string | null
  division: string | null
}

export function mappingKey(row: LegacyDoublesTeam) {
  return [row.source, row.key, row.seasonId || "", row.division || ""].join("|")
}

export function exactMappingCandidate(row: LegacyDoublesTeam, team: { name: string; player1Id: string; player2Id: string }) {
  return Boolean(
    row.name.trim() === team.name.trim()
      && row.player1Id
      && row.player2Id
      && row.player1Id === team.player1Id
      && row.player2Id === team.player2Id,
  )
}

export type KwtRosterMembership = {
  playerId: string
  division: string
}

export type KwtRosterRow = {
  sourceRow: number
  rawPlayerName: string
  canonicalName?: string
  canonicalPlayerId?: string
  division: string | null
}

export type KwtRosterIssue = {
  status: "MISSING" | "DIVISION_MISMATCH"
  rosterDivision: string | null
  message: string
}

export function validateCurrentKwtRoster(
  row: KwtRosterRow,
  memberships: KwtRosterMembership[],
): KwtRosterIssue | null {
  if (!row.canonicalPlayerId || !row.division) return null

  const playerMemberships = memberships.filter((membership) => membership.playerId === row.canonicalPlayerId)
  if (playerMemberships.length === 0) {
    return {
      status: "MISSING",
      rosterDivision: null,
      message: `roster: ${row.canonicalName || row.rawPlayerName} is not enrolled on the Season 15 KWT roster. Review and enroll the player in ${row.division} before applying.`,
    }
  }

  if (!playerMemberships.some((membership) => membership.division === row.division)) {
    const rosterDivision = playerMemberships.map((membership) => membership.division).join(", ")
    return {
      status: "DIVISION_MISMATCH",
      rosterDivision,
      message: `roster: ${row.canonicalName || row.rawPlayerName} is enrolled in ${rosterDivision}, not the CSV division ${row.division}. Review the roster; do not reclassify silently.`,
    }
  }

  return null
}

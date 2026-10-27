export type DoublesTeam = {
  id: string
  name: string
  player1Id: string
  player2Id: string
}

export type DoublesFixture = {
  id: string
  seasonId: string
  division: string
  gameNumber: number
  homeTeamId: string
  awayTeamId: string
  homeTeamName: string
  awayTeamName: string
}

export function validateDoublesTeam(team: DoublesTeam) {
  return Boolean(team.id && team.name.trim() && team.player1Id && team.player2Id && team.player1Id !== team.player2Id)
}

export function fixtureParticipants(fixture: DoublesFixture, teams: DoublesTeam[]) {
  const home = teams.find((team) => team.id === fixture.homeTeamId)
  const away = teams.find((team) => team.id === fixture.awayTeamId)
  return home && away ? [home.player1Id, home.player2Id, away.player1Id, away.player2Id] : []
}

export function resultForTeamScores(homeScore: number, awayScore: number) {
  if (homeScore < awayScore) return { outcome: "HOME_WIN" as const, homePoints: 3, awayPoints: 0 }
  if (awayScore < homeScore) return { outcome: "AWAY_WIN" as const, homePoints: 0, awayPoints: 3 }
  return { outcome: "DRAW" as const, homePoints: 1, awayPoints: 1 }
}

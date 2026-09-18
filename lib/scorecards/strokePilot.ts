export type StrokeGameState = "NOT PLAYED" | "SCORECARD RECEIVED" | "COMPLETED"

export type StrokeBoardGame = {
  sourceKey: string
  gameNumber: number
  playerOne: string
  playerTwo: string
  course: string
  state: StrokeGameState
  playerOneScore: number | null
  playerTwoScore: number | null
  reviewEvidenceId?: string | null
}

export type StrokeBoardStanding = {
  rank: number
  player: string
  gp: number
  wins: number
  losses: number
  ties: number
  strokes: number
  points: number
}

export type StrokeDivisionBoard = {
  seasonId: string
  seasonNumber: number
  rosterVersionId: string
  division: number
  games: StrokeBoardGame[]
  standings: StrokeBoardStanding[]
}

export type StrokePilotResult = {
  playerOneScore: number
  playerTwoScore: number
  standings: StrokeBoardStanding[]
}

export function parseStrokeScorecardPilotDivisions(value: string | null | undefined) {
  const tokens = value?.split(",").map((token) => token.trim().toUpperCase()).filter(Boolean) || []
  if (tokens.length === 0 || tokens.some((token) => !/^D[1-5]$/.test(token))) return []
  return [...new Set(tokens.map((token) => Number(token.slice(1))))].sort((left, right) => left - right)
}

export function filterStrokePilotBoards(boards: StrokeDivisionBoard[], configuredDivisions: number[]) {
  const enabled = new Set(configuredDivisions)
  return boards.filter((board) => enabled.has(board.division))
}

export function occupiedStrokeDivisions(rows: Array<{ division_number: number }>) {
  return [...new Set(rows.map((row) => Number(row.division_number)).filter((division) => Number.isInteger(division) && division > 0))]
    .sort((left, right) => left - right)
}

export function strokeGameState(input: { completed: boolean; hasActiveEvidence: boolean }): StrokeGameState {
  if (input.completed) return "COMPLETED"
  if (input.hasActiveEvidence) return "SCORECARD RECEIVED"
  return "NOT PLAYED"
}

export function renderStrokeResult(game: StrokeBoardGame) {
  if (game.state !== "COMPLETED" || game.playerOneScore === null || game.playerTwoScore === null) return game.state
  return `${game.playerOne} ${game.playerOneScore} · ${game.playerTwo} ${game.playerTwoScore}`
}

export function validateStrokeBoard(board: StrokeDivisionBoard) {
  if (!Number.isInteger(board.seasonNumber) || board.seasonNumber < 1) throw new Error("Stroke board requires an authoritative season.")
  if (!Number.isInteger(board.division) || board.division < 1) throw new Error("Stroke board requires an occupied division.")
  if (board.games.some((game) => !game.sourceKey || !game.playerOne || !game.playerTwo || !game.course)) {
    throw new Error("Stroke board contains an incomplete authoritative fixture.")
  }
  return board
}

export function canSubmitStrokeScorecard(game: StrokeBoardGame) {
  return game.state === "NOT PLAYED"
}

export function completeMockStrokePilot(input: {
  board: StrokeDivisionBoard
  sourceKey: string
  playerOneScore: number
  playerTwoScore: number
  standings: StrokeBoardStanding[]
}): StrokeDivisionBoard {
  const game = input.board.games.find((candidate) => candidate.sourceKey === input.sourceKey)
  if (!game) throw new Error("The exact Stroke fixture was not found.")
  if (game.state === "COMPLETED") throw new Error("The Stroke fixture is already complete.")
  return {
    ...input.board,
    games: input.board.games.map((candidate) => candidate.sourceKey === input.sourceKey ? {
      ...candidate,
      state: "COMPLETED",
      playerOneScore: input.playerOneScore,
      playerTwoScore: input.playerTwoScore,
    } : candidate),
    standings: input.standings,
  }
}

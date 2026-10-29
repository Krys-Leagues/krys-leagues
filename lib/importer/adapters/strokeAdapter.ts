import {
  ImportContext,
  ImportPlayerMatch,
  ImportRowResult,
  ImportValidationError,
  LeagueImportAdapter,
} from "./types"

function readText(
  row: Record<string, unknown>,
  keys: string[]
) {
  for (const key of keys) {
    const value = row[key]

    if (
      value !== null &&
      value !== undefined &&
      String(value).trim() !== ""
    ) {
      return String(value).trim()
    }
  }

  return ""
}

function readNumber(
  row: Record<string, unknown>,
  keys: string[]
) {
  const value = readText(row, keys)

  if (value === "") {
    return null
  }

  const parsed = Number(value)

  return Number.isFinite(parsed)
    ? parsed
    : null
}

function findPlayer(
  importedName: string,
  playerMatches: ImportPlayerMatch[]
) {
  const normalized = importedName
    .trim()
    .toLowerCase()

  return (
    playerMatches.find(
      (match) =>
        match.screenName.trim().toLowerCase() ===
        normalized
    ) ?? null
  )
}

export const strokeAdapter: LeagueImportAdapter = {
  leagueType: "stroke",

  validateRow(
    row: Record<string, unknown>,
    context: ImportContext
  ): ImportValidationError[] {
    const errors: ImportValidationError[] = []

    const player1 = readText(row, [
      "player1",
      "player 1",
      "player_one",
      "player one",
    ])

    const player2 = readText(row, [
      "player2",
      "player 2",
      "player_two",
      "player two",
    ])

    const score1 = readNumber(row, [
      "player1_score",
      "player 1 score",
      "score1",
      "score 1",
    ])

    const score2 = readNumber(row, [
      "player2_score",
      "player 2 score",
      "score2",
      "score 2",
    ])

    const course = readText(row, [
      "course",
      "course_name",
      "course name",
      "map",
    ])

    if (!player1) {
      errors.push({
        row: 0,
        field: "player1",
        message: "Player 1 is required.",
      })
    }

    if (!player2) {
      errors.push({
        row: 0,
        field: "player2",
        message: "Player 2 is required.",
      })
    }

    if (score1 === null) {
      errors.push({
        row: 0,
        field: "player1_score",
        message:
          "Player 1 score must be a valid number.",
      })
    }

    if (score2 === null) {
      errors.push({
        row: 0,
        field: "player2_score",
        message:
          "Player 2 score must be a valid number.",
      })
    }

    if (!course) {
      errors.push({
        row: 0,
        field: "course",
        message: "Course is required.",
      })
    }

    if (!context.seasonNumber) {
      errors.push({
        row: 0,
        field: "season_number",
        message: "Season number is required.",
      })
    }

    if (!context.division) {
      errors.push({
        row: 0,
        field: "division",
        message: "Division is required.",
      })
    }

    return errors
  },

  transformRow(
    row: Record<string, unknown>,
    playerMatches: ImportPlayerMatch[],
    context: ImportContext
  ): ImportRowResult {
    const errors = this.validateRow(
      row,
      context
    )

    const player1 = readText(row, [
      "player1",
      "player 1",
      "player_one",
      "player one",
    ])

    const player2 = readText(row, [
      "player2",
      "player 2",
      "player_two",
      "player two",
    ])

    const score1 = readNumber(row, [
      "player1_score",
      "player 1 score",
      "score1",
      "score 1",
    ])

    const score2 = readNumber(row, [
      "player2_score",
      "player 2 score",
      "score2",
      "score 2",
    ])

    const course = readText(row, [
      "course",
      "course_name",
      "course name",
      "map",
    ])

    const game = readText(row, [
      "game",
      "game_number",
      "game number",
      "round",
    ])

    const player1Match = findPlayer(
      player1,
      playerMatches
    )

    const player2Match = findPlayer(
      player2,
      playerMatches
    )

    if (!player1Match?.playerId) {
      errors.push({
        row: 0,
        field: "player1",
        message: `Player 1 could not be linked: ${player1}`,
      })
    }

    if (!player2Match?.playerId) {
      errors.push({
        row: 0,
        field: "player2",
        message: `Player 2 could not be linked: ${player2}`,
      })
    }

    let winner: string | null = null
    let isDraw = false

    if (
      score1 !== null &&
      score2 !== null
    ) {
      if (score1 < score2) {
        winner = player1
      } else if (score2 < score1) {
        winner = player2
      } else {
        isDraw = true
      }
    }

    return {
      success: errors.length === 0,
      errors,
      data: {
        league_type: "stroke",
        division: context.division,
        season_number:
          context.seasonNumber,
        game,
        course,
        player1,
        player2,
        player1_id:
          player1Match?.playerId ?? null,
        player2_id:
          player2Match?.playerId ?? null,
        player1_score: score1,
        player2_score: score2,
        winner,
        is_draw: isDraw,
        result_type: "league_result",
      },
    }
  },
}
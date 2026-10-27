import { PlayerMatch } from "./matchPlayers"

export type ValidationResult = {
  level: "success" | "warning" | "error"
  message: string
}

export function validateImport(
  matches: PlayerMatch[]
): ValidationResult[] {
  const results: ValidationResult[] = []

  const newPlayers = matches.filter(
    (m) => m.status === "new"
  )

  const closeMatches = matches.filter(
    (m) => m.status === "close"
  )

  if (newPlayers.length === 0) {
    results.push({
      level: "success",
      message: "All players were matched successfully.",
    })
  } else {
    results.push({
      level: "warning",
      message: `${newPlayers.length} player(s) were not found and will require review.`,
    })
  }

  if (closeMatches.length > 0) {
    results.push({
      level: "warning",
      message: `${closeMatches.length} player(s) have close matches that should be confirmed.`,
    })
  }

  return results
}
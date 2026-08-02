import { PlayerRecord } from "./loadPlayers"

export type PlayerMatch = {
  importedName: string
  playerId: string | null
  matchedName: string | null
  confidence: number
  status: "exact" | "close" | "new"
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
}

export function matchPlayers(
  importedNames: string[],
  players: PlayerRecord[]
): PlayerMatch[] {

  return importedNames.map((name) => {

    const normalized = normalize(name)

    const exact = players.find(
      (player) =>
        normalize(player.screen_name) === normalized
    )

    if (exact) {
      return {
        importedName: name,
        playerId: exact.id,
        matchedName: exact.screen_name,
        confidence: 100,
        status: "exact",
      }
    }

    const close = players.find(
      (player) =>
        normalize(player.screen_name).includes(normalized) ||
        normalized.includes(
          normalize(player.screen_name)
        )
    )

    if (close) {
      return {
        importedName: name,
        playerId: close.id,
        matchedName: close.screen_name,
        confidence: 85,
        status: "close",
      }
    }

    return {
      importedName: name,
      playerId: null,
      matchedName: null,
      confidence: 0,
      status: "new",
    }

  })

}
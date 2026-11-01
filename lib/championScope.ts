export type ChampionScope = "all" | "kwt"

export type ScopedTrophy = {
  league_type: string | null | undefined
}

export function isKwtTrophy(trophy: ScopedTrophy) {
  return trophy.league_type?.trim().toLowerCase() === "kwt"
}

export function filterTrophiesForScope<T extends ScopedTrophy>(trophies: readonly T[], scope: ChampionScope) {
  return scope === "kwt" ? trophies.filter(isKwtTrophy) : [...trophies]
}

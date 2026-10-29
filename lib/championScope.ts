export type ChampionScope =
  | "all"
  | "kwt"
  | "champion-of-champions"
  | "krys-cup"
  | "spicy-cup"
  | "monthly"
  | "bracket"

export type ScopedTrophy = {
  league_type: string | null | undefined
  trophy_title?: string | null | undefined
  placement?: string | null | undefined
  event_name?: string | null | undefined
  division?: string | null | undefined
}

export function isKwtTrophy(trophy: ScopedTrophy) {
  return trophy.league_type?.trim().toLowerCase() === "kwt"
}

const MONTH_NAMES = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
]

function searchableTrophyText(trophy: ScopedTrophy) {
  return [trophy.trophy_title, trophy.placement, trophy.event_name, trophy.division]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
}

export function isChampionOfChampionsTrophy(trophy: ScopedTrophy) {
  return searchableTrophyText(trophy).includes("champion of champions")
}

export function isKrysCupTrophy(trophy: ScopedTrophy) {
  return searchableTrophyText(trophy).includes("krys cup")
}

export function isSpicyCupTrophy(trophy: ScopedTrophy) {
  return searchableTrophyText(trophy).includes("spicy cup")
}

export function isMonthlyTrophy(trophy: ScopedTrophy) {
  const text = searchableTrophyText(trophy)
  return trophy.league_type?.trim().toLowerCase() === "monthly" || text.includes("monthly") || MONTH_NAMES.some((month) => text.includes(month))
}

export function isBracketTrophy(trophy: ScopedTrophy) {
  const text = searchableTrophyText(trophy)
  return text.includes("bracket") || text.includes("tournament")
}

export function isTrophyInScope(trophy: ScopedTrophy, scope: Exclude<ChampionScope, "all">) {
  if (scope === "kwt") return isKwtTrophy(trophy)
  if (scope === "champion-of-champions") return isChampionOfChampionsTrophy(trophy)
  if (scope === "krys-cup") return isKrysCupTrophy(trophy)
  if (scope === "spicy-cup") return isSpicyCupTrophy(trophy)
  if (scope === "monthly") return isMonthlyTrophy(trophy)
  return isBracketTrophy(trophy)
}

export function filterTrophiesForScope<T extends ScopedTrophy>(trophies: readonly T[], scope: ChampionScope) {
  return scope === "all" ? [...trophies] : trophies.filter((trophy) => isTrophyInScope(trophy, scope))
}

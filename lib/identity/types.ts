export type IdentitySource =
  | "screen_name"
  | "discord_name"
  | "historical_alias"
  | "manual"
  | "import"
  | "unknown"

export type IdentityMatchStatus =
  | "exact"
  | "normalized"
  | "alias"
  | "suggested"
  | "unmatched"

export type IdentityPlayer = {
  id: string
  screenName: string
  discordName: string | null
  discordId: string | null
  active: boolean
}

export type PlayerIdentityAlias = {
  id?: string
  playerId: string
  aliasName: string
  normalizedAlias: string
  source: IdentitySource
  firstSeenLeague?: string | null
  firstSeenSeason?: number | null
  lastSeenLeague?: string | null
  lastSeenSeason?: number | null
  active: boolean
}

export type IdentityCandidate = {
  playerId: string
  screenName: string
  matchedValue: string
  matchedSource: IdentitySource
  confidence: number
  reasons: string[]
}

export type IdentityMatchResult = {
  importedName: string
  normalizedName: string
  status: IdentityMatchStatus
  playerId: string | null
  screenName: string | null
  confidence: number
  matchedSource: IdentitySource
  candidates: IdentityCandidate[]
}

export type ResolveIdentityOptions = {
  minimumSuggestionConfidence?: number
  maximumCandidates?: number
}
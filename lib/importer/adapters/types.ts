export type ImportLeagueType =
  | "stroke"
  | "match"
  | "pyp"
  | "skins"
  | "kwt"
  | "race"
  | "course_records"

export interface ImportContext {
  seasonNumber?: number
  division?: string
  leagueType: ImportLeagueType
}

export interface ImportPlayerMatch {
  playerId: string | null
  screenName: string
  confidence: number
}

export interface ImportValidationError {
  row: number
  field: string
  message: string
}

export interface ImportRowResult {
  success: boolean
  errors: ImportValidationError[]
  data: Record<string, unknown>
}

export interface LeagueImportAdapter {
  leagueType: ImportLeagueType

  validateRow(
    row: Record<string, unknown>,
    context: ImportContext
  ): ImportValidationError[]

  transformRow(
    row: Record<string, unknown>,
    playerMatches: ImportPlayerMatch[],
    context: ImportContext
  ): ImportRowResult
}
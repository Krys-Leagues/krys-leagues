export type ArizonaDifficulty = "Easy" | "Hard"

export type ArizonaCourseCode = string

export type AllTimeCourseTarget = {
  code: string
  difficulty: ArizonaDifficulty
  baseMap: string
  displayName: string
  sourceCourseName: string
}

export type ArizonaSourceRecord = {
  courseCode: ArizonaCourseCode
  difficulty: ArizonaDifficulty
  canonicalBaseMap: string
  canonicalDisplayName: string
  sourceCourseName: string
  sourceWorksheet: "All Time"
  sourceFilename: string
  sourceFileHash: string
  sourceRow: number
  sourceRank: number | null
  sourceNameCell: string
  sourceScoreCell: string
  historicalPlayerName: string
  score: number
  fingerprint: string
  csvFilename?: string
  csvRow?: number
  sourceDate?: string | null
  notes?: string | null
}

export type ArizonaCsvIssue = {
  category: "invalid_row" | "duplicate_source_row" | "course_mapping_issue"
  csvRow: number
  historicalPlayerName: string | null
  rawScore: string | null
  message: string
}

export type ArizonaCsvParseResult = {
  courseCode: ArizonaCourseCode
  csvFilename: string
  csvFileHash: string
  records: ArizonaSourceRecord[]
  issues: ArizonaCsvIssue[]
}

export type ArizonaIdentityDecision = {
  playerId: string | null
  canonicalScreenName: string | null
  selectionSource: "auto" | "manual" | "unresolved"
}

export type ArizonaParseIssue = {
  category: "invalid_score" | "course_mapping_issue" | "duplicate_source_row"
  sourceFilename: string
  sourceWorksheet: "All Time"
  sourceRow: number | null
  difficulty: ArizonaDifficulty | null
  historicalPlayerName: string | null
  rawScore: string | number | null
  message: string
}

export type ArizonaWorkbookParseResult = {
  sourceFilename: string
  sourceFileHash: string
  sourceWorksheet: "All Time"
  sourceCourseName: string
  records: ArizonaSourceRecord[]
  issues: ArizonaParseIssue[]
}

export type LegacyCombinedRow = {
  legacyId: string
  playerId: string | null
  historicalPlayerName: string
  courseName: string
  easyScore: number
  hardScore: number
  combinedScore: number
  proofUrl: string | null
  playedAt: string | null
  notes: string | null
  createdAt: string | null
  sourceStatus: "pending_source_verification"
  official: false
}

export type IdentityPreview = {
  historicalPlayerName: string
  status: "resolved" | "unresolved" | "ambiguous"
  playerId: string | null
  canonicalScreenName: string | null
  matchedSource: string
  confidence: number
  candidates: Array<{
    playerId: string
    screenName: string
    matchedValue: string
    confidence: number
  }>
}

export type BestRecordSnapshot = {
  courseCode: ArizonaCourseCode
  playerId: string
  score: number
}

export type PreviewCategory =
  | "new_record"
  | "better_score"
  | "equal_unchanged"
  | "worse_score_ignored"
  | "unresolved_identity"
  | "ambiguous_identity"

export type ArizonaPreviewRow = ArizonaSourceRecord & {
  identity: IdentityPreview
  category: PreviewCategory
  existingBestScore: number | null
}

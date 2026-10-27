import { createHash } from "node:crypto"

export const OFFICIAL_KWT_CSV_NAMESPACE = "OFFICIAL_KWT_CSV"

export type KwtCsvPairEvidence = Readonly<{
  season: number
  week: number
  eventId: string
  player: string
  canonicalPlayerId: string
  easyCode: string
  hardCode: string
  easyScore: number
  hardScore: number
  totalScore: number
  detailFile: string
  detailFileSha256: string
  detailRow: number
  summaryFile: string
  summaryFileSha256: string
  summaryRow: number
  zipSha256: string
}>

export type OfficialKwtCsvProvenance = Readonly<{
  sourceFingerprint: string
  sourceType: "KWT"
  sourceRef: string
  sourceSeason: number
  sourceWeek: number
  originalPlayerName: string
  canonicalPlayerId: string
  originalCourseCode: string
  difficulty: "easy" | "hard"
  score: number
  metadata: Readonly<Record<string, unknown>>
}>

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex").toUpperCase()
}

function stableEvidence(value: KwtCsvPairEvidence, difficulty: "easy" | "hard", courseCode: string, score: number): string {
  return JSON.stringify({
    source: "THE_KWT",
    namespace: OFFICIAL_KWT_CSV_NAMESPACE,
    zipSha256: value.zipSha256,
    detailFile: value.detailFile,
    detailFileSha256: value.detailFileSha256,
    detailRow: value.detailRow,
    summaryFile: value.summaryFile,
    summaryFileSha256: value.summaryFileSha256,
    summaryRow: value.summaryRow,
    eventId: value.eventId,
    season: value.season,
    week: value.week,
    originalPlayerName: value.player,
    courseCode,
    difficulty,
    score,
    totalScore: value.totalScore,
  })
}

/**
 * A five-part KWT-compatible fingerprint with a separately named CSV namespace.
 * The namespace stays inside the KWT source type so existing publication views
 * can continue to reject/accept it by the same outer contract after review.
 */
export function buildOfficialKwtCsvFingerprint(value: KwtCsvPairEvidence, difficulty: "easy" | "hard"): string {
  const courseCode = difficulty === "easy" ? value.easyCode : value.hardCode
  const score = difficulty === "easy" ? value.easyScore : value.hardScore
  const evidenceDigest = sha256Hex(stableEvidence(value, difficulty, courseCode, score))
  return [
    "KWT",
    `${OFFICIAL_KWT_CSV_NAMESPACE}:${value.zipSha256}`,
    `${value.eventId}:${value.detailFileSha256}:row=${value.detailRow}`,
    `${courseCode}:${difficulty}`,
    evidenceDigest,
  ].join("|")
}

export function buildOfficialKwtCsvProvenance(value: KwtCsvPairEvidence, difficulty: "easy" | "hard"): OfficialKwtCsvProvenance {
  const courseCode = difficulty === "easy" ? value.easyCode : value.hardCode
  const score = difficulty === "easy" ? value.easyScore : value.hardScore
  const sourceFingerprint = buildOfficialKwtCsvFingerprint(value, difficulty)
  const participantKey = `CSV_PARTICIPANT:${sha256Hex(value.player)}`
  const rowEvidenceKey = `CSV_ROUND_EVIDENCE:${sha256Hex(`${value.eventId}|${value.detailFileSha256}|${value.detailRow}|${difficulty}`)}`
  return {
    sourceFingerprint,
    sourceType: "KWT",
    sourceRef: `${value.detailFile}#row=${value.detailRow};${value.summaryFile}#row=${value.summaryRow};zip_sha256=${value.zipSha256}`,
    sourceSeason: value.season,
    sourceWeek: value.week,
    originalPlayerName: value.player,
    canonicalPlayerId: value.canonicalPlayerId,
    originalCourseCode: courseCode,
    difficulty,
    score,
    metadata: {
      provenance_namespace: OFFICIAL_KWT_CSV_NAMESPACE,
      source_player_id: participantKey,
      source_player_id_kind: "CSV_PARTICIPANT_KEY_NOT_KWT_NUMERIC_ID",
      round_id: rowEvidenceKey,
      round_id_kind: "CSV_ROW_EVIDENCE_KEY_NOT_KWT_NUMERIC_ID",
      source_file: value.detailFile,
      source_file_sha256: value.detailFileSha256,
      summary_file: value.summaryFile,
      summary_file_sha256: value.summaryFileSha256,
      source_zip_sha256: value.zipSha256,
      source_row: value.detailRow,
      summary_row: value.summaryRow,
      event_id: value.eventId,
      course_code: courseCode,
      difficulty,
      score,
      total_score: value.totalScore,
      official_sequence: "SEASON_WEEK_EASY_HARD",
      chronology_confidence: "OFFICIAL_KWT_SEQUENCE",
      source_ids_present_in_export: false,
      personal_handicap_eligible: true,
    },
  }
}

export function validateOfficialKwtCsvFingerprint(fingerprint: string): boolean {
  const parts = fingerprint.split("|")
  return parts.length === 5
    && parts[0] === "KWT"
    && parts[1].startsWith(`${OFFICIAL_KWT_CSV_NAMESPACE}:`)
    && parts.slice(1).every((part) => part.length > 0 && !part.includes("\n"))
}


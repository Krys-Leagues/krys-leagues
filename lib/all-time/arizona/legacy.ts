import Papa from "papaparse"

import { combinedScore } from "./scoring.ts"
import type { IdentityPreview, LegacyCombinedRow } from "./types.ts"

type LegacyCsvRow = {
  id?: string
  player_id?: string
  player_name?: string
  course_name?: string
  easy_score?: string
  hard_score?: string
  combined_score?: string
  proof_url?: string
  played_at?: string
  notes?: string
  created_at?: string
}

export type LegacyParseIssue = {
  filename: string
  row: number
  message: string
}

export function parseLegacyCombinedCsv(csv: string, filename: string) {
  const parsed = Papa.parse<LegacyCsvRow>(csv, {
    header: true,
    skipEmptyLines: "greedy",
  })
  const rows: LegacyCombinedRow[] = []
  const issues: LegacyParseIssue[] = parsed.errors.map((error) => ({
    filename,
    row: (error.row ?? 0) + 2,
    message: error.message,
  }))

  for (const [index, source] of parsed.data.entries()) {
    const easyScore = Number(source.easy_score)
    const hardScore = Number(source.hard_score)
    const storedCombined = Number(source.combined_score)
    if (
      !source.id ||
      !source.player_name ||
      source.course_name !== "Arizona Modern" ||
      !Number.isInteger(easyScore) ||
      !Number.isInteger(hardScore) ||
      !Number.isInteger(storedCombined)
    ) {
      issues.push({
        filename,
        row: index + 2,
        message: "Legacy row is missing required Arizona Modern score fields.",
      })
      continue
    }
    if (combinedScore(easyScore, hardScore) !== storedCombined) {
      issues.push({
        filename,
        row: index + 2,
        message: "Legacy combined_score does not equal easy_score + hard_score.",
      })
      continue
    }

    rows.push({
      legacyId: source.id,
      playerId: source.player_id || null,
      historicalPlayerName: source.player_name,
      courseName: source.course_name,
      easyScore,
      hardScore,
      combinedScore: storedCombined,
      proofUrl: source.proof_url && source.proof_url !== "null" ? source.proof_url : null,
      playedAt: source.played_at || null,
      notes: source.notes || null,
      createdAt: source.created_at || null,
      sourceStatus: "pending_source_verification",
      official: false,
    })
  }

  return { rows, issues }
}

export function reconcileLegacyCombinedRows(
  rows: LegacyCombinedRow[],
  identities: Map<string, IdentityPreview>,
  expected = 104,
  canonicalPlayerIds?: Set<string>
) {
  const counts = new Map<string, number>()
  for (const row of rows) counts.set(row.legacyId, (counts.get(row.legacyId) ?? 0) + 1)
  const duplicate = [...counts.values()].reduce(
    (total, count) => total + Math.max(0, count - 1),
    0
  )
  const uniqueRows = new Map(rows.map((row) => [row.legacyId, row]))
  const canonicalIdentityLinked = [...uniqueRows.values()].filter((row) => {
    if (row.playerId && (!canonicalPlayerIds || canonicalPlayerIds.has(row.playerId))) return true
    return identities.get(row.historicalPlayerName)?.status === "resolved"
  }).length
  const accountedFor = uniqueRows.size

  return {
    expected,
    accountedFor,
    missing: Math.max(0, expected - accountedFor),
    duplicate,
    canonicalIdentityLinked,
    identityUnresolved: accountedFor - canonicalIdentityLinked,
    sourceVerifiedKwtOrPro: 0,
    sourcePendingVerification: accountedFor,
  }
}

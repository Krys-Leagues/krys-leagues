import { classifyBestScore } from "./scoring.ts"
import type {
  ArizonaIdentityDecision,
  ArizonaPreviewRow,
  BestRecordSnapshot,
  PreviewCategory,
} from "./types.ts"

export const DEFAULT_ALL_TIME_PAGE_SIZE = 50
export const ALL_TIME_PAGE_SIZES = [25, 50, 100] as const

export function paginateRows<T>(rows: T[], page: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const safePage = Math.min(Math.max(1, page), totalPages)
  return { rows: rows.slice((safePage - 1) * pageSize, safePage * pageSize), page: safePage, totalPages }
}

export function effectivePreviewCategory(
  row: ArizonaPreviewRow,
  decision: ArizonaIdentityDecision | undefined,
  existingBest: BestRecordSnapshot[]
): { category: PreviewCategory; existingBestScore: number | null } {
  const playerId = decision?.playerId ?? (decision ? null : row.identity.playerId)
  const resolved = decision ? decision.selectionSource !== "unresolved" && Boolean(playerId) : row.identity.status === "resolved" && Boolean(playerId)
  if (!resolved || !playerId) return {
    category: row.identity.status === "ambiguous" && !decision ? "ambiguous_identity" : "unresolved_identity",
    existingBestScore: null,
  }
  const existing = existingBest.find((best) => best.courseCode === row.courseCode && best.playerId === playerId)?.score ?? null
  return { category: classifyBestScore(existing, row.score), existingBestScore: existing }
}

export function buildReviewedPreviewRows(
  rows: ArizonaPreviewRow[],
  decisions: Record<string, ArizonaIdentityDecision>,
  existingBest: BestRecordSnapshot[]
) {
  const proposed = new Map(existingBest.map((best) => [`${best.courseCode}:${best.playerId}`, best.score]))
  return rows.map((row) => {
    const decision = decisions[row.fingerprint]
    const playerId = decision?.playerId ?? (decision ? null : row.identity.playerId)
    const resolved = decision ? decision.selectionSource !== "unresolved" && Boolean(playerId) : row.identity.status === "resolved" && Boolean(playerId)
    if (!resolved || !playerId) return { row, category: row.identity.status === "ambiguous" && !decision ? "ambiguous_identity" as const : "unresolved_identity" as const, existingBestScore: null }
    const key = `${row.courseCode}:${playerId}`
    const current = proposed.get(key) ?? null
    const category = classifyBestScore(current, row.score)
    if (category === "new_record" || category === "better_score") proposed.set(key, row.score)
    return { row, category, existingBestScore: current }
  })
}

export function identityReviewComplete(row: ArizonaPreviewRow, decision?: ArizonaIdentityDecision) {
  return row.identity.status === "resolved" || Boolean(decision)
}

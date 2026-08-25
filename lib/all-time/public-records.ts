import { denseRanks } from "./dense-rank.ts"

export type PublicCourse = { id: string; code: string; base_map: string; display_name: string; difficulty: "Easy" | "Hard" }
export type PublicSingleRecord = { id: string; course_id: string; player_id: string; score: number; historical_player_name: string; player: { screen_name: string } | Array<{ screen_name: string }> | null }
export type PublicCombinedRecord = { id: string; base_map: string; player_id: string; easy_score: number; hard_score: number; combined_score: number; historical_player_name: string; player: { screen_name: string } | Array<{ screen_name: string }> | null }

export function canonicalPlayerName(record: { historical_player_name: string; player: PublicSingleRecord["player"] }) {
  const player = Array.isArray(record.player) ? record.player[0] : record.player
  return player?.screen_name || record.historical_player_name
}

export function rankByScore<T extends { score: number }>(rows: T[]) {
  const sorted = [...rows].sort((a, b) => a.score - b.score)
  return sorted.map((row, index) => ({ ...row, rank: denseRanks(sorted)[index] }))
}

export function rankByCombinedTotal<T extends { combined_score: number }>(rows: T[]) {
  const sorted = [...rows].sort((a, b) => a.combined_score - b.combined_score)
  const ranks = denseRanks(sorted.map((row) => ({ score: row.combined_score })))
  return sorted.map((row, index) => ({ ...row, rank: ranks[index] }))
}

export function personalCombinedFallbackKey(rows: Array<{ key: string; rank: number | null }>) {
  if (rows.some((row) => row.rank !== null && row.rank <= 3)) return null
  return [...rows]
    .filter((row) => row.rank !== null)
    .sort((a, b) => (a.rank! - b.rank!) || a.key.localeCompare(b.key))[0]?.key ?? null
}

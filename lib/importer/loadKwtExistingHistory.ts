import type { KwtExistingRecord } from "./adapters/kwtDiscordStaging"

export const KWT_EXISTING_HISTORY_TABLES = ["handicap_rounds", "player_career_events", "kwt_raw_scores", "import_rows"] as const

export type KwtExistingHistoryInventory = {
  records: KwtExistingRecord[]
  errors: Array<{ table: string; message: string }>
  tableCounts: Record<string, Record<string, number>>
  truncatedAt: number
}

export type KwtExistingHistoryTableResult = {
  table: string
  data: unknown[] | null
  error: string | null
}

function period(value: unknown): { season: number | null; week: number | null } {
  if (!value || typeof value !== "object") return { season: null, week: null }
  const row = value as Record<string, unknown>
  const text = Object.values(row).filter(item => typeof item === "string").join(" ")
  const seasonValue = Number(row.season ?? row.kwt_season ?? text.match(/(?:KWT|Season)\s*[-_ ]?(\d+)/i)?.[1])
  const weekValue = Number(row.week ?? row.kwt_week ?? text.match(/W(?:eek)?\s*[-_ ]?(\d+)/i)?.[1])
  const nested = row.raw_data && typeof row.raw_data === "object" ? period(row.raw_data) : { season: null, week: null }
  return {
    season: Number.isInteger(seasonValue) && seasonValue > 0 ? seasonValue : nested.season,
    week: Number.isInteger(weekValue) && weekValue > 0 ? weekValue : nested.week,
  }
}

export function buildExistingKwtHistoryInventory(results: KwtExistingHistoryTableResult[]): KwtExistingHistoryInventory {
  const records: KwtExistingRecord[] = []
  const errors: Array<{ table: string; message: string }> = []
  const tableCounts: Record<string, Record<string, number>> = {}
  for (const result of results) {
    if (result.error) { errors.push({ table: result.table, message: result.error }); continue }
    for (const raw of result.data ?? []) {
      if (!raw || typeof raw !== "object") continue
      const found = period(raw)
      if (![9, 11, 12].includes(found.season ?? -1)) continue
      const record = { ...raw, _inventory_table: result.table, _inventory_season: found.season, _inventory_week: found.week }
      records.push(record)
      const seasonKey = String(found.season)
      tableCounts[result.table] ??= {}
      tableCounts[result.table][seasonKey] = (tableCounts[result.table][seasonKey] ?? 0) + 1
    }
  }
  return { records, errors, tableCounts, truncatedAt: 20000 }
}

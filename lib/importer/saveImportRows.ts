import type { SupabaseClient } from "@supabase/supabase-js"

export type ImportRow = {
  batchId: string
  rowNumber: number
  rawData: Record<string, unknown>
  importedPlayerName?: string
}

export async function saveImportRows(
  rows: ImportRow[],
  client: SupabaseClient,
) {
  if (rows.length === 0) {
    return
  }

  const payload = rows.map((row) => ({
    batch_id: row.batchId,
    row_number: row.rowNumber,
    raw_data: row.rawData,
    imported_player_name:
      row.importedPlayerName ?? null,
    normalized_player_name:
      row.importedPlayerName
        ?.toLowerCase()
        .replace(/[^a-z0-9]/g, "") ?? null,
  }))

  const { error } = await client
    .from("import_rows")
    .insert(payload)

  if (error) {
    throw error
  }

  return payload.length
}

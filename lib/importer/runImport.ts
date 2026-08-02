import { createImportBatch } from "./createImportBatch"
import { saveImportRows } from "./saveImportRows"
import { loadPlayers } from "./loadPlayers"
import { matchPlayers } from "./matchPlayers"
import { validateImport } from "./validateImport"

export type RunImportArgs = {
  sourceName: string
  importType: string
  originalFilename: string
  rows: Record<string, unknown>[]
  playerColumn: string
}

export async function runImport({
  sourceName,
  importType,
  originalFilename,
  rows,
  playerColumn,
}: RunImportArgs) {

  // STEP 1 - Create the import batch
  const batch = await createImportBatch({
    sourceName,
    importType,
    originalFilename,
    totalRows: rows.length,
  })

  // STEP 2 - Save all CSV rows
  await saveImportRows(
    rows.map((row, index) => ({
      batchId: batch.id,
      rowNumber: index + 1,
      rawData: row,
      importedPlayerName:
        String(row[playerColumn] ?? ""),
    }))
  )

  // STEP 3 - Load existing players
  const players = await loadPlayers()

  // STEP 4 - Match imported player names
  const importedNames = rows.map((row) =>
    String(row[playerColumn] ?? "")
  )

  const matches = matchPlayers(
    importedNames,
    players
  )

  // STEP 5 - Validate the import
  const validation = validateImport(matches)

  return {
    batch,
    matches,
    validation,
  }
}
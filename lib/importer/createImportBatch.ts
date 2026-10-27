import type { SupabaseClient } from "@supabase/supabase-js"

export type CreateImportBatchArgs = {
  sourceName: string
  importType: string
  originalFilename: string
  totalRows: number
}

export async function createImportBatch({
  sourceName,
  importType,
  originalFilename,
  totalRows,
}: CreateImportBatchArgs, client: SupabaseClient) {
  const { data, error } = await client
    .from("import_batches")
    .insert({
      source_name: sourceName,
      import_type: importType,
      original_filename: originalFilename,
      total_rows: totalRows,
      status: "staging",
    })
    .select()
    .single()

  if (error) {
    throw error
  }

  return data
}

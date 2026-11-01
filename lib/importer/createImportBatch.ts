import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

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
}: CreateImportBatchArgs) {
  const { data, error } = await supabase
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
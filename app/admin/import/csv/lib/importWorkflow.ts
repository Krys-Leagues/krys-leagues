export const HISTORICAL_STROKE_IMPORT_TYPE = "historical_stroke" as const
export const HISTORICAL_MATCH_IMPORT_TYPE = "match" as const

export type ImportWorkflow = "none" | "generic" | "historical_match" | "historical_stroke"

export function importWorkflowFor(importType: string | null): ImportWorkflow {
  if (importType === null) return "none"
  if (importType === HISTORICAL_STROKE_IMPORT_TYPE) return "historical_stroke"
  if (importType === HISTORICAL_MATCH_IMPORT_TYPE) return "historical_match"
  return "generic"
}

export function isStructuredHistoricalImportType(importType: string | null) {
  const workflow = importWorkflowFor(importType)
  return workflow === "historical_match" || workflow === "historical_stroke"
}

export function selectedImportTypeAfterFileUpload<T extends string | null>(selectedImportType: T): T {
  return selectedImportType
}

export type MajorFinalizationField = "main" | "secondary"

type EntryLike = { id: string }
type WeekendLike = { entry_id: string; competition_status: "pending" | MajorFinalizationField }
type PlacementLike = {
  entry_id: string
  weekend_field: MajorFinalizationField | null
  field_placement: number | null
  result_status: "pending" | "completed" | "did_not_finish" | "withdrawn" | "disqualified"
  is_finalized: boolean
}

export type MajorFinalizationSummary = {
  field: MajorFinalizationField
  totalEntries: number
  finalizedEntries: number
  toFinalizeEntries: number
  entryIdsToFinalize: string[]
  unresolvedClassificationEntryIds: string[]
  unresolvedEntryIds: string[]
  isFinalized: boolean
  canFinalize: boolean
}

function resultIsReady(placement: PlacementLike | undefined, field: MajorFinalizationField) {
  if (!placement || placement.weekend_field !== field) return false
  if (placement.is_finalized) return true
  if (placement.result_status === "pending") return false
  if (placement.result_status === "completed") return Number.isInteger(placement.field_placement) && Number(placement.field_placement) > 0
  return placement.field_placement === null || (Number.isInteger(placement.field_placement) && Number(placement.field_placement) > 0)
}

export function summarizeMajorFinalizationField(
  field: MajorFinalizationField,
  entries: readonly EntryLike[],
  weekend: readonly WeekendLike[],
  placements: readonly PlacementLike[],
): MajorFinalizationSummary {
  const statusByEntry = new Map(weekend.map((item) => [item.entry_id, item.competition_status]))
  const unresolvedClassificationEntryIds = entries
    .filter((entry) => !statusByEntry.has(entry.id) || statusByEntry.get(entry.id) === "pending")
    .map((entry) => entry.id)
  const stagedIds = new Set(weekend.filter((item) => item.competition_status === field).map((item) => item.entry_id))
  const fieldEntries = entries.filter((entry) => stagedIds.has(entry.id))
  const placementByEntry = new Map(placements.map((placement) => [placement.entry_id, placement]))
  const unresolvedResultEntryIds = fieldEntries
    .filter((entry) => !resultIsReady(placementByEntry.get(entry.id), field))
    .map((entry) => entry.id)
  const finalizedEntries = fieldEntries.filter((entry) => placementByEntry.get(entry.id)?.is_finalized).length
  const entryIdsToFinalize = fieldEntries
    .filter((entry) => !placementByEntry.get(entry.id)?.is_finalized)
    .map((entry) => entry.id)
  const unresolvedEntryIds = [...unresolvedClassificationEntryIds, ...unresolvedResultEntryIds]

  return {
    field,
    totalEntries: fieldEntries.length,
    finalizedEntries,
    toFinalizeEntries: entryIdsToFinalize.length,
    entryIdsToFinalize,
    unresolvedClassificationEntryIds,
    unresolvedEntryIds,
    isFinalized: fieldEntries.length > 0 && finalizedEntries === fieldEntries.length && unresolvedClassificationEntryIds.length === 0,
    canFinalize: fieldEntries.length > 0 && unresolvedEntryIds.length === 0,
  }
}

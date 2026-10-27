import { uuidFromText } from "./ratingSnapshotImport.ts"
import type { RatingSnapshotImportPackage, RatingSnapshotImportRow } from "./ratingSnapshotImport.ts"

export type ProvenanceSourceType = "KWT" | "THE_WEEKLY"

export type SourceProvenanceRow = Readonly<{
  id: string
  source_fingerprint: string
  source_type: ProvenanceSourceType
  source_ref: string
  source_date: string | null
  source_season: number | null
  source_week: number | null
  original_player_name: string | null
  canonical_player_id: string | null
  original_course_label: string | null
  original_course_code: string | null
  metadata: Readonly<Record<string, unknown>>
}>

export type ProvenanceExceptionReason =
  | "MISSING_PROVENANCE"
  | "CONFLICTING_PROVENANCE"
  | "INVALID_SOURCE_TYPE"
  | "COURSE_OR_DIFFICULTY_MISMATCH"
  | "WEEKLY_IDENTITY_MERGE"

export type ProvenanceException = Readonly<{
  sourceFingerprint: string
  snapshotIds: readonly string[]
  reason: ProvenanceExceptionReason
  detail: string
  sourceRefs: readonly string[]
}>

export type SnapshotImportDisposition = Readonly<{
  snapshotId: string
  status: "IMPORT_READY" | "BLOCKED"
  reasons: readonly ProvenanceExceptionReason[]
  sourceFingerprintCount: number
}> 

export type ProvenanceReconciliation = Readonly<{
  provenanceRows: readonly SourceProvenanceRow[]
  exceptions: readonly ProvenanceException[]
  dispositions: readonly SnapshotImportDisposition[]
  importReadySnapshots: readonly RatingSnapshotImportRow[]
  blockedSnapshots: readonly RatingSnapshotImportRow[]
}>

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, stableValue(item)]))
  }
  return value
}

function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value))
}

function sameProvenance(left: SourceProvenanceRow, right: SourceProvenanceRow): boolean {
  return stableJson({ ...left, id: undefined }) === stableJson({ ...right, id: undefined })
}

function sourceTypeForFingerprint(fingerprint: string): ProvenanceSourceType | null {
  if (fingerprint.startsWith("KWT|")) return "KWT"
  if (fingerprint.startsWith("THE_WEEKLY|")) return "THE_WEEKLY"
  return null
}

function requiredSnapshotCourseKey(snapshot: RatingSnapshotImportRow): string {
  return `${snapshot.course_id}|${snapshot.difficulty}`
}

function metadataText(metadata: Readonly<Record<string, unknown>>, key: string): string | null {
  const value = metadata[key]
  return typeof value === "string" ? value : null
}

export function deterministicProvenanceId(sourceFingerprint: string): string {
  return uuidFromText(`handicap-source-provenance:${sourceFingerprint}`)
}

export function reconcileRatingSnapshotProvenance(
  pkg: RatingSnapshotImportPackage,
  sourceRows: readonly SourceProvenanceRow[],
): ProvenanceReconciliation {
  const byFingerprint = new Map<string, SourceProvenanceRow[]>()
  for (const row of sourceRows) {
    const group = byFingerprint.get(row.source_fingerprint) ?? []
    group.push(row)
    byFingerprint.set(row.source_fingerprint, group)
  }

  const referencedBy = new Map<string, RatingSnapshotImportRow[]>()
  for (const snapshot of pkg.ratingSnapshots) {
    for (const fingerprint of snapshot.source_evidence_refs) {
      const group = referencedBy.get(fingerprint) ?? []
      group.push(snapshot)
      referencedBy.set(fingerprint, group)
    }
  }

  const exceptions: ProvenanceException[] = []
  const blockedReasons = new Map<string, Set<ProvenanceExceptionReason>>()
  const addBlock = (snapshotId: string, reason: ProvenanceExceptionReason) => {
    const reasons = blockedReasons.get(snapshotId) ?? new Set<ProvenanceExceptionReason>()
    reasons.add(reason)
    blockedReasons.set(snapshotId, reasons)
  }

  const verifiedRows: SourceProvenanceRow[] = []
  for (const [fingerprint, snapshots] of [...referencedBy.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const rows = byFingerprint.get(fingerprint) ?? []
    const snapshotIds = [...new Set(snapshots.map((snapshot) => snapshot.id))].sort()
    if (!rows.length) {
      const exception = { sourceFingerprint: fingerprint, snapshotIds, reason: "MISSING_PROVENANCE" as const, detail: "No exact source record was found in the reviewed local evidence archive.", sourceRefs: [] }
      exceptions.push(exception)
      snapshotIds.forEach((snapshotId) => addBlock(snapshotId, exception.reason))
      continue
    }
    const canonical = rows[0]
    if (!rows.every((row) => sameProvenance(row, canonical))) {
      const exception = { sourceFingerprint: fingerprint, snapshotIds, reason: "CONFLICTING_PROVENANCE" as const, detail: "Multiple local source records share the fingerprint but differ in provenance payload.", sourceRefs: [...new Set(rows.map((row) => row.source_ref))].sort() }
      exceptions.push(exception)
      snapshotIds.forEach((snapshotId) => addBlock(snapshotId, exception.reason))
      continue
    }
    const expectedType = sourceTypeForFingerprint(fingerprint)
    if (!expectedType || canonical.source_type !== expectedType) {
      const exception = { sourceFingerprint: fingerprint, snapshotIds, reason: "INVALID_SOURCE_TYPE" as const, detail: `Fingerprint prefix requires ${expectedType ?? "a known source type"}.`, sourceRefs: [canonical.source_ref] }
      exceptions.push(exception)
      snapshotIds.forEach((snapshotId) => addBlock(snapshotId, exception.reason))
      continue
    }
    if (canonical.source_type === "THE_WEEKLY" && canonical.canonical_player_id !== null) {
      const exception = { sourceFingerprint: fingerprint, snapshotIds, reason: "WEEKLY_IDENTITY_MERGE" as const, detail: "Weekly evidence must remain external and cannot be linked to a Krys Leagues player.", sourceRefs: [canonical.source_ref] }
      exceptions.push(exception)
      snapshotIds.forEach((snapshotId) => addBlock(snapshotId, exception.reason))
      continue
    }
    for (const snapshot of snapshots) {
      if (requiredSnapshotCourseKey(snapshot) !== `${metadataText(canonical.metadata, "course_id")}|${metadataText(canonical.metadata, "difficulty")}`) {
        const exception = { sourceFingerprint: fingerprint, snapshotIds: [snapshot.id], reason: "COURSE_OR_DIFFICULTY_MISMATCH" as const, detail: "Source provenance course/difficulty does not match the dependent snapshot.", sourceRefs: [canonical.source_ref] }
        exceptions.push(exception)
        addBlock(snapshot.id, exception.reason)
      }
    }
    verifiedRows.push(canonical)
  }

  const dispositions = pkg.ratingSnapshots.map((snapshot) => {
    const reasons = [...(blockedReasons.get(snapshot.id) ?? new Set<ProvenanceExceptionReason>())].sort()
    return { snapshotId: snapshot.id, status: reasons.length ? "BLOCKED" as const : "IMPORT_READY" as const, reasons, sourceFingerprintCount: snapshot.source_evidence_refs.length }
  })
  const readyIds = new Set(dispositions.filter((item) => item.status === "IMPORT_READY").map((item) => item.snapshotId))
  return {
    provenanceRows: verifiedRows.sort((left, right) => left.source_fingerprint.localeCompare(right.source_fingerprint)),
    exceptions: exceptions.sort((left, right) => left.sourceFingerprint.localeCompare(right.sourceFingerprint) || left.reason.localeCompare(right.reason)),
    dispositions,
    importReadySnapshots: pkg.ratingSnapshots.filter((snapshot) => readyIds.has(snapshot.id)),
    blockedSnapshots: pkg.ratingSnapshots.filter((snapshot) => !readyIds.has(snapshot.id)),
  }
}

export function buildTransactionalImportPlan(
  pkg: RatingSnapshotImportPackage,
  reconciliation: ProvenanceReconciliation,
) {
  return {
    safeToExecute: reconciliation.exceptions.length === 0,
    order: ["calculation_run", "source_provenance", "rating_snapshots"] as const,
    calculationRun: pkg.calculationRun,
    provenanceRows: reconciliation.provenanceRows,
    ratingSnapshots: reconciliation.importReadySnapshots,
    blockedSnapshots: reconciliation.blockedSnapshots,
  }
}

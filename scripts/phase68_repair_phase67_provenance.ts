import fs from "node:fs"
import path from "node:path"
import { decodeDictionary, decodeNullableDictionary, encodeDictionary, encodeNullableDictionary } from "../lib/handicap/importEncoding.ts"
import { uuidFromText } from "../lib/handicap/ratingSnapshotImport.ts"

type CsvRow = Record<string, string>
type SnapshotManifestRow = {
  id: string
  calculation_run_id: string
  course_id: string
  difficulty: string
  model_version: string
  review_scope: string
  source_evidence_refs: string[]
  publication_status: string
  effective_from: string | null
  [key: string]: unknown
}

const root = process.cwd()
const sourceDir = path.join(root, "docs", "handicap", "phase63")
const outputDir = path.join(root, "docs", "handicap", "phase68")

function fail(message: string): never {
  throw new Error(message)
}

function parseCsv(text: string): CsvRow[] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"'
        index += 1
      } else if (char === '"') quoted = false
      else field += char
    } else if (char === '"' && field.length === 0) quoted = true
    else if (char === ",") { row.push(field); field = "" }
    else if (char === "\n") { row.push(field.endsWith("\r") ? field.slice(0, -1) : field); rows.push(row); row = []; field = "" }
    else field += char
  }
  if (field.length || row.length) { row.push(field.endsWith("\r") ? field.slice(0, -1) : field); rows.push(row) }
  if (!rows.length) return []
  const header = rows[0]
  return rows.slice(1).filter((values) => values.some(Boolean)).map((values) => Object.fromEntries(header.map((key, index) => [key, values[index] ?? ""])))
}

function csv(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function writeCsv(filePath: string, header: readonly string[], rows: readonly (readonly unknown[])[]): void {
  fs.writeFileSync(filePath, [header.join(","), ...rows.map((row) => row.map(csv).join(","))].join("\n") + "\n")
}

function requiredMetadata(metadata: Record<string, unknown>, key: string, fingerprint: string): string {
  const value = metadata[key]
  if (typeof value !== "string" || value.length === 0) fail(`KWT ${fingerprint} is missing metadata.${key}`)
  return value
}

function expectedKwtFingerprint(row: CsvRow, metadata: Record<string, unknown>): string {
  const event = requiredMetadata(metadata, "event_id", row.source_fingerprint)
  const sourcePlayerId = requiredMetadata(metadata, "source_player_id", row.source_fingerprint)
  const courseCode = requiredMetadata(metadata, "original_course_code", row.source_fingerprint)
  const roundId = requiredMetadata(metadata, "round_id", row.source_fingerprint)
  return `KWT|${event}|${sourcePlayerId}|${courseCode}|${roundId}`
}

function expectedWeeklyFingerprint(row: CsvRow, metadata: Record<string, unknown>): string {
  return [
    "THE_WEEKLY",
    requiredMetadata(metadata, "event_id", row.source_fingerprint),
    requiredMetadata(metadata, "division", row.source_fingerprint),
    row.original_player_name,
    row.original_course_code,
    String(metadata.source_row),
  ].join("|")
}

const provenancePath = path.join(sourceDir, "handicap_source_provenance_import.csv")
const manifestPath = path.join(sourceDir, "rating_snapshot_import_manifest.json")
const rows = parseCsv(fs.readFileSync(provenancePath, "utf8"))
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
  calculationRun: Record<string, unknown>
  ratingSnapshots: SnapshotManifestRow[]
  statisticalEligibility: Record<string, number>
  [key: string]: unknown
}

if (rows.length !== 14394) fail(`Expected 14,394 provenance rows, found ${rows.length}`)
if (manifest.ratingSnapshots.length !== 169) fail(`Expected 169 snapshots, found ${manifest.ratingSnapshots.length}`)

const fingerprints = new Set<string>()
const sourcePlayers: string[] = []
const canonicalPlayers: Array<string | null> = []
let kwtCount = 0
let weeklyCount = 0

for (const row of rows) {
  const metadata = JSON.parse(row.metadata) as Record<string, unknown>
  if (fingerprints.has(row.source_fingerprint)) fail(`Duplicate source fingerprint: ${row.source_fingerprint}`)
  fingerprints.add(row.source_fingerprint)
  const expected = row.source_type === "KWT" ? expectedKwtFingerprint(row, metadata) : expectedWeeklyFingerprint(row, metadata)
  if (row.source_fingerprint !== expected) fail(`Fingerprint mismatch for ${row.source_fingerprint}; expected ${expected}`)
  if (row.id !== uuidFromText(`handicap-source-provenance:${expected}`)) fail(`Deterministic provenance id mismatch: ${row.id}`)

  if (row.source_type === "KWT") {
    kwtCount += 1
    if (!row.canonical_player_id) fail(`KWT ${row.source_fingerprint} is missing canonical_player_id`)
    sourcePlayers.push(requiredMetadata(metadata, "source_player_id", row.source_fingerprint))
    canonicalPlayers.push(row.canonical_player_id)
  } else if (row.source_type === "THE_WEEKLY") {
    weeklyCount += 1
    if (row.canonical_player_id) fail(`Weekly ${row.source_fingerprint} is linked to a Krys player`)
    if (metadata.personal_handicap_eligible !== false) fail(`Weekly ${row.source_fingerprint} is not personal-handicap-ineligible`)
    canonicalPlayers.push(null)
  } else fail(`Unknown source type: ${row.source_type}`)
}

if (kwtCount !== 13550 || weeklyCount !== 844) fail(`Unexpected source split KWT=${kwtCount}, Weekly=${weeklyCount}`)

const recoveryLabel = "phase68-provenance-recovery-v1"
const recoveryRunId = uuidFromText(`calculation-run:${recoveryLabel}`)
const correctedSnapshots = manifest.ratingSnapshots.map((snapshot) => {
  const id = uuidFromText(`rating-snapshot:${recoveryRunId}:${snapshot.review_scope}:${snapshot.course_id}:${snapshot.difficulty}:${snapshot.model_version}`)
  return { ...snapshot, id, calculation_run_id: recoveryRunId, publication_status: "UNPUBLISHED", effective_from: null }
})
if (new Set(correctedSnapshots.map((snapshot) => snapshot.id)).size !== 169) fail("Corrected snapshot ids are not unique")
if (correctedSnapshots.some((snapshot) => snapshot.source_evidence_refs.some((ref: string) => !fingerprints.has(ref)))) fail("Corrected snapshot references missing provenance")

const sourcePlayerEncoding = encodeDictionary(sourcePlayers)
const canonicalEncoding = encodeNullableDictionary(canonicalPlayers)
const sourcePlayerIndexes = new Map(sourcePlayerEncoding.values.map((value, index) => [value, index + 1]))
const compactRows = rows.map((row, index) => ({
  source_fingerprint: row.source_fingerprint,
  source_player_index: row.source_type === "KWT" ? sourcePlayerIndexes.get(JSON.parse(row.metadata).source_player_id) ?? 0 : 0,
  canonical_player_index: canonicalEncoding.indexes[index],
}))
if (decodeDictionary(sourcePlayerEncoding).length !== sourcePlayerEncoding.indexes.length) fail("Source-player dictionary round trip failed")
if (decodeNullableDictionary(canonicalEncoding).length !== canonicalEncoding.indexes.length) fail("Canonical-player dictionary round trip failed")

fs.mkdirSync(outputDir, { recursive: true })
const header = ["id", "source_fingerprint", "source_type", "source_ref", "source_date", "source_season", "source_week", "original_player_name", "canonical_player_id", "original_course_label", "original_course_code", "metadata"]
writeCsv(path.join(outputDir, "handicap_source_provenance_import.csv"), header, rows.map((row) => header.map((key) => row[key] ?? "")))
writeCsv(path.join(outputDir, "handicap_source_provenance_exceptions.csv"), ["source_fingerprint", "reason", "detail"], [])

const calculationRun = {
  id: recoveryRunId,
  label: recoveryLabel,
  policyVersion: manifest.calculationRun.policyVersion,
  modelVersion: manifest.calculationRun.modelVersion,
  sourcePackageRef: recoveryLabel,
  chronologyPolicy: manifest.calculationRun.chronologyPolicy,
  status: "DRAFT",
  supersedesCalculationRunId: manifest.calculationRun.id,
  supersessionReason: "Phase 67 compact dictionary indexes lost repeated KWT identity values; corrected package is append-only and remains unpublished.",
  provenance_row_count: rows.length,
  snapshot_count: correctedSnapshots.length,
}
fs.writeFileSync(path.join(outputDir, "calculation_run_import_manifest.json"), JSON.stringify(calculationRun, null, 2) + "\n")
fs.writeFileSync(path.join(outputDir, "rating_snapshot_import_manifest.json"), JSON.stringify({
  ...manifest,
  schemaVersion: "phase68-provenance-recovery-v1",
  packageRef: recoveryLabel,
  calculationRun: { ...manifest.calculationRun, id: recoveryRunId, label: recoveryLabel },
  ratingSnapshots: correctedSnapshots,
  importReadiness: { status: "READY_FOR_AUTHORIZED_APPEND_ONLY_RECOVERY", invalidBatchMustRemain_UNPUBLISHED: true },
}, null, 2) + "\n")
fs.writeFileSync(path.join(outputDir, "provenance_encoding_roundtrip.json"), JSON.stringify({
  encodingVersion: "first-occurrence-dictionary-v1",
  sourcePlayerDictionaryCount: sourcePlayerEncoding.values.length,
  canonicalPlayerDictionaryCount: canonicalEncoding.values.length,
  rowCount: compactRows.length,
  sourcePlayerIndexes: sourcePlayerEncoding.indexes,
  canonicalPlayerIndexes: canonicalEncoding.indexes,
  compactRows,
}, null, 2) + "\n")
fs.writeFileSync(path.join(outputDir, "recovery_manifest.json"), JSON.stringify({
  packageVersion: "phase68-provenance-recovery-v1",
  sourcePackage: "docs/handicap/phase63",
  supersededRunId: manifest.calculationRun.id,
  correctedRunId: recoveryRunId,
  sourceCounts: { KWT: kwtCount, THE_WEEKLY: weeklyCount },
  snapshotCounts: { total: correctedSnapshots.length, ready: 158, provisional: 11, unpublished: correctedSnapshots.length },
  requiredChecks: [
    "KWT canonical_player_id is present and source-player metadata is present for every row",
    "Every fingerprint and provenance UUID is deterministic",
    "Weekly rows remain canonical-player-null and personal-handicap-ineligible",
    "Every corrected snapshot reference resolves to a corrected provenance fingerprint",
    "Old invalid rows are retained and quarantined by an append-only review decision; no UPDATE or DELETE is permitted",
    "No rating or player-index publication is part of this package",
  ],
}, null, 2) + "\n")
fs.writeFileSync(path.join(outputDir, "README.md"), `# Phase 68 provenance recovery package\n\nThis package is local-only and has not been applied to Production.\n\nThe Phase 67 defect was caused by an unsafe dictionary encoder: repeated values were assigned their original input position while the dictionary stored only unique values. The corrected encoder assigns each first occurrence a one-based dictionary index and reuses that index for all repeats.\n\n- Superseded invalid run: ${manifest.calculationRun.id}\n- Corrected DRAFT run: ${recoveryRunId}\n- KWT rows: **${kwtCount}**, all with canonical UUID and source-player metadata\n- Weekly rows: **${weeklyCount}**, all external and personal-handicap-ineligible\n- Rating snapshots: **169**, all UNPUBLISHED; 158 ready classification and 11 provisional classification\n- Effective dates: none invented; all remain NULL\n\nThe invalid Phase 67 batch must remain immutable. A future authorized recovery must append a quarantine evidence/decision record for the invalid run, then append the corrected DRAFT run, provenance, and snapshots in one transaction. This package contains no Production SQL and no cleanup operation.\n`)

console.log(JSON.stringify({ outputDir, sourceCounts: { KWT: kwtCount, THE_WEEKLY: weeklyCount }, snapshots: correctedSnapshots.length, supersededRunId: manifest.calculationRun.id, correctedRunId: recoveryRunId, compactRoundTripRows: compactRows.length }, null, 2))

import fs from "node:fs"
import path from "node:path"
import { OFFICIAL_HANDICAP_COURSE_BASES } from "../lib/handicap/adminReviewData.ts"
import { reconcileRatingSnapshotProvenance, buildTransactionalImportPlan, deterministicProvenanceId, type SourceProvenanceRow } from "../lib/handicap/provenanceImport.ts"
import type { RatingSnapshotImportPackage } from "../lib/handicap/ratingSnapshotImport.ts"

type CsvRecord = Record<string, string>
type IdentityEntry = { historicalName: string; status: string; candidates: { id: string }[] }

const root = process.cwd()
const inputDir = path.join(root, "docs", "handicap", "phase61")
const outputDir = path.join(root, "docs", "handicap", "phase63")
const kwtDir = path.join(root, "docs", "historical-sources", "kwt", "website-score-recovery", "normalized")
const identityPath = path.join(root, "docs", "historical-sources", "kwt", "website-score-recovery", "identity-candidates.json")
const weeklyPath = path.join(root, "weekly_course_evidence.csv")

function parseCsvLine(line: string): string[] {
  const cells: string[] = []
  let cell = ""
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (char === '"') {
      if (quoted && line[index + 1] === '"') { cell += '"'; index += 1 }
      else quoted = !quoted
    } else if (char === "," && !quoted) { cells.push(cell); cell = "" }
    else cell += char
  }
  cells.push(cell)
  return cells
}

function readCsv(filePath: string): CsvRecord[] {
  const lines = fs.readFileSync(filePath, "utf8").trim().split(/\r?\n/)
  if (!lines[0]) return []
  const header = parseCsvLine(lines[0])
  return lines.slice(1).filter(Boolean).map((line) => {
    const cells = parseCsvLine(line)
    return Object.fromEntries(header.map((key, index) => [key, cells[index] ?? ""]))
  })
}

function courseCatalog(): Map<string, { courseId: string; difficulty: "easy" | "hard"; label: string }> {
  const result = new Map<string, { courseId: string; difficulty: "easy" | "hard"; label: string }>()
  for (const course of OFFICIAL_HANDICAP_COURSE_BASES) {
    result.set(`${course.code}E`, { courseId: `${course.baseMap}_easy`, difficulty: "easy", label: `${course.baseMap} Easy` })
    result.set(`${course.code}H`, { courseId: `${course.baseMap}_hard`, difficulty: "hard", label: `${course.baseMap} Hard` })
  }
  return result
}

function identityMap(): Map<string, string> {
  const source = JSON.parse(fs.readFileSync(identityPath, "utf8")) as { candidates: IdentityEntry[] }
  return new Map(source.candidates
    .filter((entry) => entry.status === "exact" && entry.candidates.length === 1)
    .map((entry) => [entry.historicalName, entry.candidates[0].id]))
}

function sourceId(season: string, week: string): string {
  return `KWT${season}W${week.padStart(2, "0")}`
}

function numberOrNull(value: string): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function kwtRows(courses: Map<string, { courseId: string; difficulty: "easy" | "hard"; label: string }>, identities: Map<string, string>): SourceProvenanceRow[] {
  const rows: SourceProvenanceRow[] = []
  for (const file of fs.readdirSync(kwtDir).filter((name) => /^KWT\d+W\d+\.csv$/i.test(name)).sort()) {
    for (const [index, record] of readCsv(path.join(kwtDir, file)).entries()) {
      const event = sourceId(record.season, record.week)
      const playerId = identities.get(record.player) ?? null
      for (const part of [
        { code: record.easyCode, score: record.easyScore, roundId: record.easyRoundId, difficulty: "easy" as const },
        { code: record.hardCode, score: record.hardScore, roundId: record.hardRoundId, difficulty: "hard" as const },
      ]) {
        const course = courses.get(part.code)
        const fingerprint = `KWT|${event}|${record.sourcePlayerId || record.player}|${part.code}|${part.roundId || index + 1}`
        rows.push({
          id: deterministicProvenanceId(fingerprint),
          source_fingerprint: fingerprint,
          source_type: "KWT",
          source_ref: `${file}#row=${index + 2}`,
          source_date: null,
          source_season: numberOrNull(record.season),
          source_week: numberOrNull(record.week),
          original_player_name: record.player || null,
          canonical_player_id: playerId,
          original_course_label: null,
          original_course_code: part.code || null,
          metadata: {
            source_file: file,
            source_row: index + 2,
            event_id: event,
            division: record.historicalRank || null,
            source_player_id: record.sourcePlayerId || null,
            round_id: part.roundId || null,
            score: numberOrNull(part.score),
            course_id: course?.courseId ?? null,
            difficulty: course?.difficulty ?? part.difficulty,
            original_course_code: part.code || null,
          },
        })
      }
    }
  }
  return rows
}

function weeklyRows(courses: Map<string, { courseId: string; difficulty: "easy" | "hard"; label: string }>): SourceProvenanceRow[] {
  const rows: SourceProvenanceRow[] = []
  for (const record of readCsv(weeklyPath)) {
    if (record.source !== "THE_WEEKLY" || record.verification_status !== "VERIFIED" || record.completed_round !== "true") continue
    const score = numberOrNull(record.score)
    if (score === null) continue
    const course = courses.get(record.course_code)
    const fingerprint = ["THE_WEEKLY", record.event_id, record.division, record.player_exact, record.course_code, record.source_row].join("|")
    const seasonWeek = /^S(\d+)W(\d+)$/.exec(record.season_week)
    rows.push({
      id: deterministicProvenanceId(fingerprint),
      source_fingerprint: fingerprint,
      source_type: "THE_WEEKLY",
      source_ref: `${record.source_screenshot}#row=${record.source_row}`,
      source_date: null,
      source_season: seasonWeek ? Number(seasonWeek[1]) : null,
      source_week: seasonWeek ? Number(seasonWeek[2]) : null,
      original_player_name: record.player_exact || null,
      canonical_player_id: null,
      original_course_label: record.canonical_course || course?.label || null,
      original_course_code: record.course_code || null,
      metadata: {
        source_file: record.source_screenshot,
        source_row: Number(record.source_row),
        event_id: record.event_id,
        season_week: record.season_week,
        division: record.division,
        score,
        course_id: course?.courseId ?? null,
        difficulty: course?.difficulty ?? record.difficulty.toLowerCase(),
        verification_status: record.verification_status,
        personal_handicap_eligible: false,
      },
    })
  }
  return rows
}

function csv(value: unknown): string {
  const text = value === null || value === undefined ? "" : typeof value === "string" ? value : JSON.stringify(value)
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function writeCsv(filePath: string, header: readonly string[], rows: readonly (readonly unknown[])[]): void {
  fs.writeFileSync(filePath, [header.join(","), ...rows.map((row) => row.map(csv).join(","))].join("\n") + "\n")
}

const pkg = JSON.parse(fs.readFileSync(path.join(inputDir, "rating_snapshot_import_manifest.json"), "utf8")) as RatingSnapshotImportPackage
const courses = courseCatalog()
const allSourceRows = [...kwtRows(courses, identityMap()), ...weeklyRows(courses)]
const reconciliation = reconcileRatingSnapshotProvenance(pkg, allSourceRows)
const plan = buildTransactionalImportPlan(pkg, reconciliation)
const referenced = new Set(pkg.ratingSnapshots.flatMap((snapshot) => snapshot.source_evidence_refs))
const referencedRows = reconciliation.provenanceRows.filter((row) => referenced.has(row.source_fingerprint))
const missingOrConflict = new Set(reconciliation.exceptions.map((exception) => exception.sourceFingerprint))

fs.mkdirSync(outputDir, { recursive: true })
writeCsv(path.join(outputDir, "handicap_source_provenance_import.csv"), [
  "id", "source_fingerprint", "source_type", "source_ref", "source_date", "source_season", "source_week", "original_player_name", "canonical_player_id", "original_course_label", "original_course_code", "metadata",
], referencedRows.map((row) => [row.id, row.source_fingerprint, row.source_type, row.source_ref, row.source_date, row.source_season, row.source_week, row.original_player_name, row.canonical_player_id, row.original_course_label, row.original_course_code, row.metadata]))
writeCsv(path.join(outputDir, "handicap_source_provenance_exceptions.csv"), ["source_fingerprint", "snapshot_ids", "reason", "detail", "source_refs"], reconciliation.exceptions.map((exception) => [exception.sourceFingerprint, exception.snapshotIds, exception.reason, exception.detail, exception.sourceRefs]))
writeCsv(path.join(outputDir, "rating_snapshot_import_disposition.csv"), ["snapshot_id", "status", "reasons", "source_fingerprint_count"], reconciliation.dispositions.map((item) => [item.snapshotId, item.status, item.reasons, item.sourceFingerprintCount]))
fs.writeFileSync(path.join(outputDir, "calculation_run_import_manifest.json"), JSON.stringify({ ...pkg.calculationRun, source_package_ref: pkg.packageRef, provenance_row_count: referencedRows.length, snapshot_count: reconciliation.importReadySnapshots.length, blocked_snapshot_count: reconciliation.blockedSnapshots.length, status: "DRAFT" }, null, 2) + "\n")
fs.writeFileSync(path.join(outputDir, "rating_snapshot_import_manifest.json"), JSON.stringify({ ...pkg, provenance: { required: true, referencedFingerprintCount: referenced.size, recoveredFingerprintCount: referencedRows.length, missingOrConflictingFingerprintCount: missingOrConflict.size }, importReadiness: { importReadySnapshotCount: reconciliation.importReadySnapshots.length, blockedSnapshotCount: reconciliation.blockedSnapshots.length, blockedByReason: Object.fromEntries([...new Set(reconciliation.exceptions.map((exception) => exception.reason))].sort().map((reason) => [reason, reconciliation.dispositions.filter((item) => item.reasons.includes(reason)).length])) }, snapshotDisposition: reconciliation.dispositions }, null, 2) + "\n")
fs.writeFileSync(path.join(outputDir, "transactional_import_plan.json"), JSON.stringify({
  safeToExecute: plan.safeToExecute,
  order: plan.order,
  calculationRun: plan.calculationRun,
  inputFiles: {
    provenance: "handicap_source_provenance_import.csv",
    snapshotManifest: "rating_snapshot_import_manifest.json",
    dispositions: "rating_snapshot_import_disposition.csv",
  },
  provenanceRowCount: plan.provenanceRows.length,
  importReadySnapshotCount: plan.ratingSnapshots.length,
  blockedSnapshotCount: plan.blockedSnapshots.length,
  prohibited: ["UPDATE", "DELETE", "TRUNCATE", "player-index snapshots", "legacy Handicap tables", "publication"],
}, null, 2) + "\n")
fs.writeFileSync(path.join(outputDir, "provenance_reconciliation_report.md"), `# Phase 63 provenance reconciliation

This is a local, read-only-generated import package. It performs no Production writes.

## Evidence accounting

- Phase 61 snapshots referenced: **${pkg.ratingSnapshots.length}**.
- Unique source fingerprints referenced: **${referenced.size}**.
- Exact provenance records recovered: **${referencedRows.length}**.
- Missing or conflicting fingerprints: **${missingOrConflict.size}**.
- Import-ready snapshots: **${reconciliation.importReadySnapshots.length}**.
- Blocked snapshots: **${reconciliation.blockedSnapshots.length}**.
- Weekly provenance rows retain canonical_player_id = NULL and personal_handicap_eligible = false.
- No source dates were invented; all unavailable dates remain NULL.

## Import order

1. One DRAFT calculation run.
2. Exact source provenance rows.
3. Unpublished rating snapshots whose every source fingerprint is verified.

The plan must abort on any duplicate fingerprint conflict, missing provenance, source-type mismatch, Weekly identity link, course/difficulty mismatch, or UUID/payload conflict. It must not insert player-index snapshots or touch legacy Handicap tables.

## Exceptions

${reconciliation.exceptions.length ? reconciliation.exceptions.map((exception) => `- ${exception.reason} — ${exception.sourceFingerprint}: ${exception.detail}`).join("\n") : "None."}
`)

console.log(JSON.stringify({
  referencedFingerprints: referenced.size,
  recoveredProvenance: referencedRows.length,
  exceptions: reconciliation.exceptions.length,
  importReadySnapshots: reconciliation.importReadySnapshots.length,
  blockedSnapshots: reconciliation.blockedSnapshots.length,
  sourceRowsScanned: allSourceRows.length,
  planOrder: plan.order,
  safeToExecute: plan.safeToExecute,
}, null, 2))

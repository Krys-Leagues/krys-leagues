import fs from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"
import { OFFICIAL_HANDICAP_COURSE_BASES } from "../lib/handicap/adminReviewData.ts"
import { buildRatingSnapshotPackage, type RatingEvidenceRow } from "../lib/handicap/ratingSnapshotPackage.ts"
import { buildRatingSnapshotImportPackage } from "../lib/handicap/ratingSnapshotImport.ts"
import { validateWeeklyRows, weeklyFingerprint, type WeeklyEvidenceRow } from "../lib/handicap/weeklyEvidence.ts"

type KwtRow = {
  season: string
  week: string
  player: string
  easyCode: string
  easyScore: string
  hardCode: string
  hardScore: string
  sourcePlayerId: string
  easyRoundId: string
  hardRoundId: string
}

type IdentityCandidate = { id: string; screenName: string }
type IdentityEntry = { historicalName: string; status: string; candidates: IdentityCandidate[] }

const root = process.cwd()
const outputDir = path.join(root, "docs", "handicap", "phase60")
const importOutputDir = path.join(root, "docs", "handicap", "phase61")
const kwtDir = path.join(root, "docs", "historical-sources", "kwt", "website-score-recovery", "normalized")
const identityPath = path.join(root, "docs", "historical-sources", "kwt", "website-score-recovery", "identity-candidates.json")
const weeklyPath = path.join(root, "weekly_course_evidence.csv")
const packageRef = "phase60-local-reviewed-evidence-v1"
const policyVersion = "krys-handicap-approved-policy-v1"
const effectivePeriod = "KWT seasons 4-14 + Weekly Phase 54 admitted evidence; exact effective date not supplied"
const calculationRunId = `phase60-run-${createHash("sha256").update(packageRef).digest("hex").slice(0, 16)}`

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

function readCsv(filePath: string): Record<string, string>[] {
  const lines = fs.readFileSync(filePath, "utf8").trim().split(/\r?\n/)
  if (!lines.length || !lines[0]) return []
  const header = parseCsvLine(lines.shift()!)
  return lines.filter(Boolean).map((line) => {
    const cells = parseCsvLine(line)
    return Object.fromEntries(header.map((key, index) => [key, cells[index] ?? ""]))
  })
}

function courseCatalog(): Map<string, { courseId: string; difficulty: "easy" | "hard" }> {
  const result = new Map<string, { courseId: string; difficulty: "easy" | "hard" }>()
  for (const course of OFFICIAL_HANDICAP_COURSE_BASES) {
    result.set(`${course.code}E`, { courseId: `${course.baseMap}_easy`, difficulty: "easy" })
    result.set(`${course.code}H`, { courseId: `${course.baseMap}_hard`, difficulty: "hard" })
  }
  return result
}

function identityMap(): Map<string, string> {
  const entries = JSON.parse(fs.readFileSync(identityPath, "utf8")) as { candidates: IdentityEntry[] }
  return new Map(entries.candidates
    .filter((entry) => entry.status === "exact" && entry.candidates.length === 1)
    .map((entry) => [entry.historicalName, entry.candidates[0].id]))
}

function sourceId(season: string, week: string): string {
  return `KWT${season}W${week.padStart(2, "0")}`
}

function loadKwtEvidence(courses: Map<string, { courseId: string; difficulty: "easy" | "hard" }>, identities: Map<string, string>): { rows: RatingEvidenceRow[]; unresolved: number } {
  const rows: RatingEvidenceRow[] = []
  let unresolved = 0
  const files = fs.readdirSync(kwtDir).filter((name) => /^KWT\d+W\d+\.csv$/i.test(name)).sort()
  for (const file of files) {
    const records = readCsv(path.join(kwtDir, file)) as unknown as KwtRow[]
    for (const [index, record] of records.entries()) {
      const event = sourceId(record.season, record.week)
      const canonicalPlayerId = identities.get(record.player) ?? null
      if (!canonicalPlayerId) unresolved += 2
      for (const part of [
        { code: record.easyCode, score: record.easyScore, roundId: record.easyRoundId },
        { code: record.hardCode, score: record.hardScore, roundId: record.hardRoundId },
      ]) {
        const parsedScore = part.score.trim() === "" ? Number.NaN : Number(part.score)
        const course = courses.get(part.code)
        const sourcePlayerKey = record.sourcePlayerId || record.player
        const fingerprint = `KWT|${event}|${sourcePlayerKey}|${part.code}|${part.roundId || index + 1}`
        if (!course) {
          rows.push({ source: "KWT", sourceFingerprint: fingerprint, sourceEvidenceRef: `${file}#row=${index + 2}`, courseCode: part.code, courseId: "", difficulty: part.code.endsWith("H") ? "hard" : "easy", score: parsedScore, sourcePlayerKey, canonicalPlayerId, originalPlayerName: record.player })
          continue
        }
        rows.push({ source: "KWT", sourceFingerprint: fingerprint, sourceEvidenceRef: `${file}#row=${index + 2}`, courseCode: part.code, courseId: course.courseId, difficulty: course.difficulty, score: parsedScore, sourcePlayerKey, canonicalPlayerId, originalPlayerName: record.player })
      }
    }
  }
  return { rows, unresolved }
}

function loadWeeklyEvidence(courses: Map<string, { courseId: string; difficulty: "easy" | "hard" }>): { rows: RatingEvidenceRow[]; rejected: number } {
  const weeklyRows = readCsv(weeklyPath).map((row) => ({
    source: "THE_WEEKLY" as const,
    eventId: row.event_id,
    seasonWeek: row.season_week,
    division: row.division as WeeklyEvidenceRow["division"],
    playerExact: row.player_exact,
    sourcePlayerId: row.source_player_id,
    courseCode: row.course_code,
    difficulty: row.difficulty as WeeklyEvidenceRow["difficulty"],
    score: row.score === "" ? null : Number(row.score),
    completedRound: row.completed_round === "true",
    sourceScreenshot: row.source_screenshot,
    sourceRow: Number(row.source_row),
    verificationStatus: row.verification_status as WeeklyEvidenceRow["verificationStatus"],
    exceptionReason: row.exception_reason || undefined,
  })) satisfies WeeklyEvidenceRow[]
  const validated = validateWeeklyRows(weeklyRows)
  const rows: RatingEvidenceRow[] = []
  for (const row of validated.accepted) {
    const course = courses.get(row.courseCode)
    rows.push({
      source: "THE_WEEKLY",
      sourceFingerprint: weeklyFingerprint(row),
      sourceEvidenceRef: `${row.sourceScreenshot}#row=${row.sourceRow}`,
      courseCode: row.courseCode,
      courseId: course?.courseId ?? "",
      difficulty: course?.difficulty ?? (row.difficulty === "HARD" ? "hard" : "easy"),
      score: row.score!,
      sourcePlayerKey: row.sourcePlayerId || row.playerExact,
      canonicalPlayerId: null,
      originalPlayerName: row.playerExact,
    })
  }
  return { rows, rejected: validated.rejected.length }
}

function csv(value: unknown): string {
  const text = String(value ?? "")
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function writeCsv(filePath: string, header: readonly string[], rows: readonly (readonly unknown[])[]): void {
  fs.writeFileSync(filePath, [header.join(","), ...rows.map((row) => row.map(csv).join(","))].join("\n") + "\n")
}

const courses = courseCatalog()
const identities = identityMap()
const kwt = loadKwtEvidence(courses, identities)
const weekly = loadWeeklyEvidence(courses)
const packageResult = buildRatingSnapshotPackage([...kwt.rows, ...weekly.rows], { calculationRunId, policyVersion, effectivePeriod })
const importPackage = buildRatingSnapshotImportPackage(packageResult)
fs.mkdirSync(outputDir, { recursive: true })
fs.mkdirSync(importOutputDir, { recursive: true })

const manifest = {
  schemaVersion: "phase61-rating-snapshot-manifest-v2",
  packageRef,
  calculationRunId,
  policyVersion,
  ratingModelVersion: packageResult.ratingModelVersion,
  differentialModelVersion: packageResult.differentialModelVersion,
  referenceSlope: packageResult.referenceSlope,
  effectiveFrom: null,
  effectivePeriod,
  publicationStatus: "UNPUBLISHED",
  statisticalEligibility: {
    eligible: packageResult.snapshots.filter((snapshot) => snapshot.statisticalEligibility === "ELIGIBLE").length,
    provisional: packageResult.snapshots.filter((snapshot) => snapshot.statisticalEligibility === "PROVISIONAL").length,
  },
  importEligibleDraftCount: importPackage.importEligibleDraftCount,
  publicationEligibleCount: importPackage.publicationEligibleCount,
  publicationEligible: importPackage.publicationEligibleCount > 0,
  sourcePolicy: { KWT: "course-rating/slope and personal history subject to separate chronology gate", THE_WEEKLY: "course-rating/slope only; never personal Handicap" },
  evidenceCounts: { kwtInputRows: kwt.rows.length, weeklyInputRows: weekly.rows.length, weeklyVerifiedRowsExpected: 844, weeklyRejectedRows: weekly.rejected, unresolvedKwtIdentityRows: kwt.unresolved, acceptedRows: packageResult.accepted.length, exceptions: packageResult.exceptions.length },
  snapshots: packageResult.snapshots,
}
fs.writeFileSync(path.join(outputDir, "rating_snapshot_manifest.json"), JSON.stringify(manifest, null, 2) + "\n")
writeCsv(path.join(outputDir, "rating_snapshot_summary.csv"), ["scope", "course_code", "difficulty", "course_id", "sample_size", "distinct_source_players", "course_rating", "slope", "maximum_player_share", "rating_confidence", "source_kwt", "source_weekly", "quarantined_evidence", "publication_status"], packageResult.snapshots.map((snapshot) => [snapshot.scope, snapshot.courseCode, snapshot.difficulty, snapshot.courseId, snapshot.sampleSize, snapshot.distinctVerifiedSourcePlayers, snapshot.courseRating, snapshot.slope, snapshot.maximumPlayerShare, snapshot.ratingConfidence, snapshot.sourceContribution.KWT, snapshot.sourceContribution.THE_WEEKLY, snapshot.quarantinedEvidenceCount, snapshot.publicationStatus]))
writeCsv(path.join(outputDir, "rating_evidence_exceptions.csv"), ["source", "source_fingerprint", "source_evidence_ref", "course_code", "reason"], packageResult.exceptions.map((exception) => [exception.source, exception.sourceFingerprint, exception.sourceEvidenceRef, exception.courseCode, exception.reason]))
const snapshotByKey = new Map(packageResult.snapshots.map((snapshot) => [`${snapshot.scope}:${snapshot.courseCode}`, snapshot]))
const coverageRows: unknown[][] = []
for (const [courseCode, course] of [...courses.entries()].sort(([left], [right]) => left.localeCompare(right))) {
  for (const scope of ["KWT_ONLY", "WEEKLY_ONLY", "KWT_PLUS_WEEKLY"] as const) {
    const snapshot = snapshotByKey.get(`${scope}:${courseCode}`)
    coverageRows.push([
      scope,
      courseCode,
      course.difficulty,
      course.courseId,
      snapshot?.sampleSize ?? 0,
      snapshot?.distinctVerifiedSourcePlayers ?? 0,
      snapshot?.courseRating ?? "",
      snapshot?.slope ?? "",
      snapshot?.maximumPlayerShare ?? "",
      snapshot?.ratingConfidence ?? "UNRATED",
      snapshot?.sourceContribution.KWT ?? 0,
      snapshot?.sourceContribution.THE_WEEKLY ?? 0,
      snapshot?.quarantinedEvidenceCount ?? 0,
      snapshot?.publicationStatus ?? "UNPUBLISHED",
    ])
  }
}
writeCsv(path.join(outputDir, "course_coverage.csv"), ["scope", "course_code", "difficulty", "course_id", "sample_size", "distinct_source_players", "course_rating", "slope", "maximum_player_share", "rating_confidence", "source_kwt", "source_weekly", "quarantined_evidence", "publication_status"], coverageRows)
fs.writeFileSync(path.join(outputDir, "README.md"), `# Phase 60 local rating snapshot package\n\nThis package is a deterministic, unpublished preview. It was generated from the reviewed local KWT source files and the 844 admitted Weekly course observations. It is not an import and contains no Production writes.\n\n- Calculation run: \`${calculationRunId}\`\n- Model: \`${packageResult.ratingModelVersion}\`\n- Differential model: \`${packageResult.differentialModelVersion}\`\n- Reference slope: 8.515\n- Effective date: none supplied; \`effectiveFrom\` is null.\n- Weekly rows are course-rating/slope evidence only and never enter player Handicap histories.\n- ${importPackage.importEligibleDraftCount} snapshots are technically importable as unpublished drafts (${importPackage.statisticallyEligibleCount} statistically eligible and ${importPackage.provisionalDraftCount} provisional).\n- No snapshot is publication eligible until review approval and an approved activation date are recorded.\n- KWT rows without an exact canonical identity, invalid course code, missing score, or source conflict are listed in \`rating_evidence_exceptions.csv\`.\n- The Phase 61 import package is a local candidate only; it must re-run Production preflight and obtain separate authorization.\n`)
function reportNumber(value: number | null): string { return value === null ? "—" : String(value) }
const priority = ["BHE", "BHH", "GLE", "GLH", "HWE", "HWH", "FFE", "FFH", "RCH"]
const priorityLines = priority.flatMap((code) => ["KWT_ONLY", "WEEKLY_ONLY", "KWT_PLUS_WEEKLY"].map((scope) => {
  const snapshot = snapshotByKey.get(`${scope}:${code}`)
  const course = courses.get(code)
  return `| ${scope} | ${code} | ${course?.difficulty ?? "—"} | ${snapshot?.sampleSize ?? 0} | ${snapshot?.distinctVerifiedSourcePlayers ?? 0} | ${reportNumber(snapshot?.courseRating ?? null)} | ${reportNumber(snapshot?.slope ?? null)} | ${snapshot?.ratingConfidence ?? "UNRATED"} |`
}))
const statusCounts = [...new Set(packageResult.snapshots.map((snapshot) => snapshot.ratingConfidence))].sort().map((status) => `${status}: ${packageResult.snapshots.filter((snapshot) => snapshot.ratingConfidence === status).length}`).join(", ")
fs.writeFileSync(path.join(importOutputDir, "rating_snapshot_import_manifest.json"), JSON.stringify(importPackage, null, 2) + "\n")
writeCsv(path.join(importOutputDir, "rating_snapshot_import_rows.csv"), ["id", "calculation_run_id", "course_id", "difficulty", "course_rating", "slope", "sample_size", "distinct_canonical_player_count", "rating_confidence", "model_version", "effective_from", "effective_period", "source_evidence_refs", "publication_status", "review_scope", "statistical_eligibility", "import_eligible", "publication_eligible", "publication_blockers", "source_kwt", "source_weekly", "maximum_player_share", "quarantined_evidence"], importPackage.ratingSnapshots.map((row) => [row.id, row.calculation_run_id, row.course_id, row.difficulty, row.course_rating, row.slope, row.sample_size, row.distinct_canonical_player_count, row.rating_confidence, row.model_version, row.effective_from, row.effective_period, JSON.stringify(row.source_evidence_refs), row.publication_status, row.review_scope, row.statistical_eligibility, row.import_eligible, row.publication_eligible, row.publication_blockers.join("|"), row.source_contribution.KWT, row.source_contribution.THE_WEEKLY, row.maximum_player_share, row.quarantined_evidence_count]))
writeCsv(path.join(importOutputDir, "rating_snapshot_blockers.csv"), ["scope", "course_code", "difficulty", "course_id", "rating_confidence", "sample_size", "distinct_source_players", "maximum_player_share", "import_eligible", "publication_eligible", "blockers"], packageResult.snapshots.map((snapshot) => [snapshot.scope, snapshot.courseCode, snapshot.difficulty, snapshot.courseId, snapshot.ratingConfidence, snapshot.sampleSize, snapshot.distinctVerifiedSourcePlayers, snapshot.maximumPlayerShare, snapshot.importEligible, snapshot.publicationEligible, snapshot.publicationBlockers.join("|")]))
const exceptionCounts = new Map<string, number>()
for (const exception of packageResult.exceptions) exceptionCounts.set(exception.reason, (exceptionCounts.get(exception.reason) ?? 0) + 1)
writeCsv(path.join(importOutputDir, "rating_evidence_exception_breakdown.csv"), ["source", "reason", "count"], [...exceptionCounts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([reason, count]) => ["KWT", reason, count]))
fs.writeFileSync(path.join(importOutputDir, "rating_snapshot_import_report.md"), `# Phase 61 rating snapshot import preparation\n\n## Outcome\n\nPhase 60 produced **${packageResult.snapshots.length}** draft calculations. The previous package set \`publicationEligible=false\` unconditionally and did not expose why. Phase 61 separates the gates without weakening the approved policy:\n\n- **${importPackage.importEligibleDraftCount}** technically importable unpublished draft rows: non-null rating and positive slope.\n- **${importPackage.statisticallyEligibleCount}** statistically eligible rows: at least 50 observations, at least 20 distinct source players, and no player contributes more than 10%.\n- **${importPackage.provisionalDraftCount}** provisional rows: 20–49 observations; importable for review only, not ready for approval.\n- **${importPackage.publicationEligibleCount}** publication-eligible rows: none, because review approval and an approved activation date are still absent.\n- **0** player-index snapshots are included. Weekly evidence remains course-rating/slope-only.\n\n## Why publication is still blocked\n\nEvery candidate is explicitly blocked from publication by \`MISSING_APPROVED_EFFECTIVE_DATE\` and \`EXPLICIT_REVIEW_APPROVAL_REQUIRED\`. Rows with quarantined source evidence also carry \`UNRESOLVED_SOURCE_EXCEPTIONS\`; provisional rows additionally carry \`PROVISIONAL_SAMPLE_SIZE\`. No historical date was invented. The installed Phase 59 schema accepts \`effective_from NULL\` for an unpublished draft, so missing date is not a storage blocker.\n\n## Evidence quarantine\n\n${[...exceptionCounts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([reason, count]) => `- ${reason}: **${count}** KWT observations`).join("\\n")}\n\nThe 808 quarantined KWT observations are therefore **806 UNRESOLVED_CANONICAL_ID** and **2 INVALID_SCORE**. No course alias or duplicate exception was generated by the Phase 60 adapter. Blank scores remain invalid; negative scores are accepted.\n\n## Import contract\n\nThe JSON and CSV files in this directory contain deterministic UUIDs compatible with the installed schema, lowercase database confidence values, nullable \`effective_from\`, stable evidence fingerprints, and explicit stop conditions. They are a candidate package only. A future authorized import must preflight the live schema, reject payload drift or UUID collisions, insert one DRAFT calculation run and append-only provenance/snapshot rows transactionally, and never touch legacy Handicap tables or index snapshots.\n`)
fs.writeFileSync(path.join(outputDir, "rating_snapshot_report.md"), `# Phase 60 rating snapshot preparation\n\n## Status\n\nThis is a local, deterministic, unpublished evidence package. No rows were inserted into Production, no legacy Handicap records were rewritten, and no player-index snapshots were created. Every generated rating row has \`publicationStatus=UNPUBLISHED\` and \`publicationEligible=false\`.\n\n## Evidence accounting\n\n- KWT source rows read: **${kwt.rows.length}** course observations from the verified normalized KWT archive.\n- KWT course observations accepted after exact identity/course/score checks: **${packageResult.accepted.filter((row) => row.source === "KWT").length}**.\n- KWT evidence quarantined: **${packageResult.exceptions.filter((item) => item.source === "KWT").length}**, principally unresolved canonical identity rows.\n- Weekly source rows read: **${weekly.rows.length}**, matching the preserved Phase 54 total of **844** verified observations.\n- Weekly validation rejects in this run: **${weekly.rejected}**.\n- Weekly rows remain course-rating/slope-only; they cannot enter personal Handicap rounds, differentials, or indexes.\n- Generated snapshot rows: **${packageResult.snapshots.length}** across the three source scopes. Status counts: ${statusCounts}.\n\nThe Production preflight also confirmed that the six Phase 59 tables are empty and that the 10,274 legacy \`handicap_rounds\` rows currently have no canonical \`player_id\`. Those legacy rows were not copied into this package. The local KWT archive is therefore the only KWT input used here, and unresolved identities remain quarantined rather than guessed.\n\nNo exact effective date was supplied by the reviewed evidence. All snapshots use \`effectiveFrom=null\` and retain an explicit period description instead of inventing a date.\n\n## Priority-course preview\n\n| Scope | Code | Difficulty | Samples | Distinct source players | Course rating | Slope | Confidence |\n|---|---|---:|---:|---:|---:|---:|---|\n${priorityLines.join("\n")}\n\nThese are simulations under the approved lowest-12%-elite benchmark and Candidate A metadata (reference slope **8.515**). They are not official ratings. GLH remains UNRATED because this package has no independently verified GLH evidence.\n\n## Import gate\n\nThe next executable step is a separately authorized, read-only-reviewed import of only approved snapshot rows after comparing this manifest against the installed six-table schema. That step must create a calculation-run record and append-only provenance/snapshot rows transactionally; it must not import Weekly rows into personal Handicap history, create index snapshots, or publish any player Handicap.\n`)
const importReportPath = path.join(importOutputDir, "rating_snapshot_import_report.md")
fs.writeFileSync(importReportPath, fs.readFileSync(importReportPath, "utf8").replaceAll("\\n", "\n"))
console.log(JSON.stringify({ calculationRunId, kwtInputRows: kwt.rows.length, weeklyInputRows: weekly.rows.length, weeklyRejected: weekly.rejected, acceptedRows: packageResult.accepted.length, exceptions: packageResult.exceptions.length, snapshots: packageResult.snapshots.length, importEligibleDrafts: importPackage.importEligibleDraftCount, statisticallyEligible: importPackage.statisticallyEligibleCount, provisionalDrafts: importPackage.provisionalDraftCount, publicationEligible: importPackage.publicationEligibleCount }, null, 2))

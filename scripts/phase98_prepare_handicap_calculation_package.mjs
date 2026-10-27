import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import Papa from "papaparse"
import { buildPersonalIndexCandidates } from "../lib/handicap/personalIndex.ts"
import { classifyKwtChronology } from "../lib/handicap/kwtChronology.ts"
import { validateKwtOfficialPair } from "../lib/handicap/kwtOfficialSequence.ts"
import { uuidFromText } from "../lib/handicap/ratingSnapshotImport.ts"

const root = process.cwd()
const outputDir = path.join(root, "docs", "handicap", "phase98")
const policyVersion = "krys-handicap-approved-policy-v1"
const modelVersion = "krys-handicap-candidate-a-v1"
const chronologyPolicy = "OFFICIAL_KWT_SEQUENCE"
const packageRef = "phase98-official-kwt-sequence-ready-v1"
const calculationRunId = uuidFromText(`calculation-run:${packageRef}:${policyVersion}:${modelVersion}`)

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8")
}

function sha256(relativePath) {
  return crypto.createHash("sha256").update(read(relativePath)).digest("hex").toUpperCase()
}

function parseCsv(relativePath) {
  const result = Papa.parse(read(relativePath), { header: true, skipEmptyLines: true })
  if (result.errors.length) throw new Error(`${relativePath}: ${JSON.stringify(result.errors)}`)
  return result.data
}

function writeJson(relativePath, value) {
  fs.writeFileSync(path.join(outputDir, relativePath), `${JSON.stringify(value, null, 2)}\n`)
}

function csvCell(value) {
  const text = value === null || value === undefined ? "" : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function writeCsv(relativePath, columns, rows) {
  const lines = [columns.join(","), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(","))]
  fs.writeFileSync(path.join(outputDir, relativePath), `${lines.join("\n")}\n`)
}

function parseMetadata(row) {
  try {
    return JSON.parse(row.metadata)
  } catch (error) {
    throw new Error(`invalid metadata for ${row.source_fingerprint}: ${error.message}`)
  }
}

function numeric(value, label) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) throw new Error(`${label} is not numeric: ${value}`)
  return parsed
}

function evidenceRefs(rating) {
  return Array.isArray(rating.source_evidence_refs) ? rating.source_evidence_refs : JSON.parse(rating.source_evidence_refs)
}

function ratingIsReady(row, maximumPlayerShare, provenanceByFingerprint) {
  const refs = evidenceRefs(row)
  const evidenceValid = refs.length > 0 && refs.every((ref) => {
    const source = provenanceByFingerprint.get(ref)
    return source && source.source_type === "KWT" && source.canonical_player_id
  })
  return row.review_scope === "KWT_ONLY"
    && row.rating_confidence === "ready"
    && numeric(row.sample_size, "sample_size") >= 50
    && numeric(row.distinct_canonical_player_count, "distinct_canonical_player_count") >= 20
    && maximumPlayerShare <= 0.10
    && numeric(row.slope, "slope") > 0.01
    && Number.isFinite(Number(row.course_rating))
    && evidenceValid
}

function maxPlayerShare(row, provenanceByFingerprint) {
  const refs = evidenceRefs(row)
  const counts = new Map()
  for (const ref of refs) {
    const source = provenanceByFingerprint.get(ref)
    if (!source) continue
    const player = source.canonical_player_id
    if (!player) continue
    counts.set(player, (counts.get(player) ?? 0) + 1)
  }
  return refs.length ? Math.max(...counts.values(), 0) / refs.length : 1
}

function roundFromPair(item, pair, rating) {
  const metadata = item.metadata
  const sequence = pair.records.find((record) => record.sourceId === item.row.source_fingerprint)
  if (!sequence) throw new Error(`missing sequence record for ${item.row.source_fingerprint}`)
  return {
    sourceKey: item.row.source_fingerprint,
    playerId: item.row.canonical_player_id,
    score: numeric(metadata.score, "score"),
    courseKey: metadata.course_id,
    ratingVersionId: rating.id,
    ratingSnapshotId: rating.id,
    courseRating: numeric(rating.course_rating, "course_rating"),
    slopeRating: numeric(rating.slope, "slope"),
    sourceType: "KWT",
    personalHandicapEligible: true,
    chronology: classifyKwtChronology(sequence).evidence,
  }
}

function main() {
  fs.mkdirSync(outputDir, { recursive: true })
  const provenanceRows = parseCsv("docs/handicap/phase68/handicap_source_provenance_import.csv")
  const kwtRows = provenanceRows.filter((row) => row.source_type === "KWT")
  const weeklyRows = provenanceRows.filter((row) => row.source_type === "THE_WEEKLY")
  if (kwtRows.length !== 13550 || weeklyRows.length !== 844) throw new Error("unexpected source package counts")
  const provenanceByFingerprint = new Map(kwtRows.map((row) => [row.source_fingerprint, row]))
  if (provenanceByFingerprint.size !== kwtRows.length) throw new Error("duplicate KWT fingerprint")
  if (kwtRows.some((row) => !row.canonical_player_id)) throw new Error("KWT row missing canonical player")
  if (weeklyRows.some((row) => row.canonical_player_id || parseMetadata(row).personal_handicap_eligible !== false)) {
    throw new Error("Weekly row crossed personal-handicap boundary")
  }

  const manifest = JSON.parse(read("docs/handicap/phase68/rating_snapshot_import_manifest.json"))
  const correctedRatings = manifest.ratingSnapshots.filter((row) => row.review_scope === "KWT_ONLY")
  const ratingByCourse = new Map()
  const ratingEligibility = []
  for (const rating of correctedRatings) {
    const share = maxPlayerShare(rating, provenanceByFingerprint)
    const eligible = ratingIsReady(rating, share, provenanceByFingerprint)
    const reason = eligible ? "READY_FOR_INDEX_CALCULATION" : rating.rating_confidence === "provisional" ? "PROVISIONAL_SAMPLE" : "FAILED_READY_CHECKS"
    ratingEligibility.push({
      snapshot_id: rating.id,
      course_id: rating.course_id,
      difficulty: rating.difficulty,
      sample_size: rating.sample_size,
      distinct_canonical_player_count: rating.distinct_canonical_player_count,
      course_rating: rating.course_rating,
      slope: rating.slope,
      rating_confidence: rating.rating_confidence,
      maximum_player_share: share.toFixed(6),
      eligible_for_personal_index: eligible,
      reason,
    })
    if (eligible) ratingByCourse.set(`${rating.course_id}|${rating.difficulty}`, rating)
  }

  const groups = new Map()
  for (const row of kwtRows) {
    const metadata = parseMetadata(row)
    const key = `${row.canonical_player_id}|${row.source_season}|${row.source_week}`
    const group = groups.get(key) ?? { row, rows: new Map() }
    const difficulty = String(metadata.difficulty).toLowerCase()
    if (group.rows.has(difficulty)) throw new Error(`duplicate ${difficulty} row in ${key}`)
    group.rows.set(difficulty, { row, metadata })
    groups.set(key, group)
  }

  const rounds = []
  const incompletePairs = []
  const ratingExcludedRounds = []
  for (const [key, group] of groups) {
    const easy = group.rows.get("easy")
    const hard = group.rows.get("hard")
    if (!easy || !hard || group.rows.size !== 2) {
      incompletePairs.push({ player_week: key, reason: "INCOMPLETE_OR_CONFLICTING_PAIR" })
      continue
    }
    const pair = validateKwtOfficialPair({
      canonicalPlayerId: group.row.canonical_player_id,
      originalPlayerName: group.row.original_player_name,
      seasonNumber: numeric(group.row.source_season, "source_season"),
      weekNumber: numeric(group.row.source_week, "source_week"),
      evidenceRef: `${group.row.source_ref}|official-result`,
      officialResultVerified: true,
      timingRuleEvidence: "RULE_ONLY",
      easy: { sourceId: easy.row.source_fingerprint, sourceFingerprint: easy.row.source_fingerprint },
      hard: { sourceId: hard.row.source_fingerprint, sourceFingerprint: hard.row.source_fingerprint },
    })
    if (!pair.valid) {
      incompletePairs.push({ player_week: key, reason: pair.issues.join("|") })
      continue
    }
    for (const item of [easy, hard]) {
      const rating = ratingByCourse.get(`${item.metadata.course_id}|${item.metadata.difficulty}`)
      if (!rating) {
        ratingExcludedRounds.push({ source_fingerprint: item.row.source_fingerprint, reason: "COURSE_RATING_NOT_READY" })
        continue
      }
      rounds.push(roundFromPair(item, pair, rating))
    }
  }

  const result = buildPersonalIndexCandidates(rounds, {
    calculationRunId,
    differentialModelVersion: modelVersion,
    chronologyPublicationPolicy: "EXACT_OR_OFFICIAL_KWT_SEQUENCE",
  })
  const indexes = result.indexes
    .filter((index) => index.index !== null)
    .map((index) => result.snapshotCandidates.find((snapshot) => snapshot.canonicalPlayerId === index.playerId))
    .filter(Boolean)
  if (indexes.some((snapshot) => snapshot.publicationStatus !== "UNPUBLISHED")) throw new Error("index package is not unpublished")
  if (indexes.some((snapshot) => snapshot.sourceRoundIds.some((source) => !provenanceByFingerprint.has(source)))) throw new Error("index references missing provenance")
  if (indexes.some((snapshot) => snapshot.sourceRoundIds.some((source) => provenanceByFingerprint.get(source).source_type !== "KWT"))) throw new Error("Weekly source entered index package")

  const blockedPlayers = result.indexes.filter((index) => index.index === null).map((index) => ({
    canonical_player_id: index.playerId,
    latest_round_count: index.latestRoundCount,
    selected_round_count: index.selectedRoundCount,
    chronology_confidence: index.chronologyConfidence,
    reason: "FEWER_THAN_FIVE_ELIGIBLE_ROUNDS_AFTER_READY_RATING_FILTER",
  }))
  const packageManifest = {
    schemaVersion: "phase98-handicap-calculation-package-v1",
    packageRef,
    calculationRun: {
      id: calculationRunId,
      label: packageRef,
      policyVersion,
      modelVersion,
      sourcePackageRef: "phase68-provenance-recovery-v1",
      chronologyPolicy,
      status: "DRAFT",
      publicationEligibility: "QUARANTINED",
      metadata: {
        allow_official_kwt_sequence_publication: true,
        source_scope: "KWT_ONLY",
        source_separation: "THE_WEEKLY excluded from personal indexes",
        effective_from: null,
      },
    },
    policy: {
      differential: "(score - course rating) * 8.515 / course slope",
      referenceSlope: 8.515,
      latestRoundLimit: 10,
      bestRoundLimit: 5,
      minimumIndexRounds: 5,
      chronologyOrdering: "Season -> Week -> Easy -> Hard",
    },
    sourceHashes: {
      ratingSnapshotManifest: sha256("docs/handicap/phase68/rating_snapshot_import_manifest.json"),
      provenanceImport: sha256("docs/handicap/phase68/handicap_source_provenance_import.csv"),
    },
    ratingEligibility: {
      correctedKwtOnlySnapshots: correctedRatings.length,
      readyForPersonalIndexes: ratingEligibility.filter((row) => row.eligible_for_personal_index).length,
      provisionalExcluded: ratingEligibility.filter((row) => row.reason === "PROVISIONAL_SAMPLE").length,
    },
    evidence: {
      correctedKwtRows: kwtRows.length,
      completePairs: groups.size - incompletePairs.length,
      incompletePairs: incompletePairs.length,
      roundsWithReadyRatings: rounds.length,
      roundsExcludedForRating: ratingExcludedRounds.length,
      weeklyRowsExcludedFromPersonalIndexes: weeklyRows.length,
    },
    indexCandidates: indexes,
    blockedPlayers,
    publication: {
      allIndexSnapshotsUnpublished: true,
      noProductionWrites: true,
      requiresSeparateReviewAndActivation: true,
    },
  }
  writeJson("calculation_run_manifest.json", packageManifest)
  writeCsv("rating_eligibility.csv", Object.keys(ratingEligibility[0]), ratingEligibility)
  writeCsv("incomplete_pairs.csv", ["player_week", "reason"], incompletePairs)
  writeCsv("rating_excluded_rounds.csv", ["source_fingerprint", "reason"], ratingExcludedRounds)
  writeCsv("blocked_players.csv", Object.keys(blockedPlayers[0] ?? { canonical_player_id: "", latest_round_count: "", selected_round_count: "", chronology_confidence: "", reason: "" }), blockedPlayers)
  writeCsv("index_snapshot_import_rows.csv", ["id", "calculation_run_id", "canonical_player_id", "source_round_ids", "rating_snapshot_ids", "rating_version_ids", "differential_model_version", "latest_ten_source_round_ids", "best_five_source_round_ids", "resulting_index", "chronology_confidence", "publication_status"], indexes.map((snapshot) => ({
    id: snapshot.snapshotId,
    calculation_run_id: snapshot.calculationRunId,
    canonical_player_id: snapshot.canonicalPlayerId,
    source_round_ids: JSON.stringify(snapshot.sourceRoundIds),
    rating_snapshot_ids: JSON.stringify(snapshot.ratingSnapshotIds),
    rating_version_ids: JSON.stringify(snapshot.ratingVersionIds),
    differential_model_version: snapshot.differentialModelVersion,
    latest_ten_source_round_ids: JSON.stringify(snapshot.latestTenSourceRoundIds),
    best_five_source_round_ids: JSON.stringify(snapshot.bestFiveSourceRoundIds),
    resulting_index: snapshot.index,
    chronology_confidence: snapshot.chronologyConfidence,
    publication_status: snapshot.publicationStatus,
  })))
  fs.writeFileSync(path.join(outputDir, "calculation_package_report.md"), `# Phase 98 Handicap calculation package\n\n- Package: \`${packageRef}\`\n- Calculation run: \`${calculationRunId}\`\n- Status: **DRAFT / QUARANTINED**\n- Publication: **unpublished only**\n- Policy: \`${policyVersion}\` / \`${modelVersion}\`\n- Chronology: \`${chronologyPolicy}\` with Season → Week → Easy → Hard ordering\n- Corrected KWT rows: **${kwtRows.length}**\n- Complete pairs: **${groups.size - incompletePairs.length}**\n- Ready KWT-only ratings: **${ratingEligibility.filter((row) => row.eligible_for_personal_index).length}**\n- Provisional KWT-only ratings excluded from personal indexes: **${ratingEligibility.filter((row) => row.reason === "PROVISIONAL_SAMPLE").length}**\n- KWT rounds with ready ratings: **${rounds.length}**\n- Numeric unpublished index candidates: **${indexes.length}**\n- Players blocked by the five-round minimum after rating filtering: **${blockedPlayers.length}**\n- Rounds excluded for provisional/unready course ratings: **${ratingExcludedRounds.length}**\n- Weekly rows excluded from personal indexes: **${weeklyRows.length}**\n\nThe package contains no Production SQL and was generated without Production writes. The explicit opt-in metadata is inert while the run remains DRAFT/QUARANTINED and all index snapshots remain UNPUBLISHED.\n`)
  fs.writeFileSync(path.join(outputDir, "production_installation_plan.md"), `# Phase 98 controlled installation plan\n\nThis is a future review package only. Do not execute automatically.\n\n1. Read-only preflight the six persistence tables, Phase 97 gate, current row counts, existing run IDs, and all deterministic IDs in this package.\n2. Verify the calculation run ID, package hashes, every rating snapshot reference, canonical player UUID, KWT-only source type, and unpublished statuses.\n3. Insert one DRAFT/QUARANTINED calculation run and the ${indexes.length} unpublished index snapshots in one transaction using the approved service-role workflow.\n4. Assert no Weekly source fingerprint appears in any index array and no legacy Handicap tables are touched.\n5. Run postflight: existing counts plus one run and ${indexes.length} index rows; zero publishable rows while the run is DRAFT/QUARANTINED and ratings remain UNPUBLISHED.\n6. Any mismatch aborts the transaction; no UPDATE/DELETE/legacy rebuild is permitted.\n\nNo effective date is invented. Publication requires a separately reviewed activation step and the installed Phase 97 gate.\n`)
  console.log(JSON.stringify({
    calculationRunId,
    correctedKwtRows: kwtRows.length,
    completePairs: groups.size - incompletePairs.length,
    readyRatings: ratingEligibility.filter((row) => row.eligible_for_personal_index).length,
    provisionalRatingsExcluded: ratingEligibility.filter((row) => row.reason === "PROVISIONAL_SAMPLE").length,
    roundsWithReadyRatings: rounds.length,
    roundsExcludedForRating: ratingExcludedRounds.length,
    numericIndexCandidates: indexes.length,
    blockedPlayers: blockedPlayers.length,
    weeklyRowsExcluded: weeklyRows.length,
    allUnpublished: true,
  }, null, 2))
}

main()

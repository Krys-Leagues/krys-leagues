import fs from "node:fs"
import path from "node:path"
import Papa from "papaparse"
import { buildPersonalIndexCandidates } from "../lib/handicap/personalIndex.ts"
import { classifyKwtChronology } from "../lib/handicap/kwtChronology.ts"
import { validateKwtOfficialPair } from "../lib/handicap/kwtOfficialSequence.ts"

const root = process.cwd()
const read = (file) => fs.readFileSync(path.join(root, file), "utf8")
const parseCsv = (file) => Papa.parse(read(file), { header: true, skipEmptyLines: true }).data
const provenance = parseCsv("docs/handicap/phase68/handicap_source_provenance_import.csv")
  .filter((row) => row.source_type === "KWT")
const ratings = parseCsv("docs/handicap/phase61/rating_snapshot_import_rows.csv")
  .filter((row) => row.review_scope === "KWT_ONLY")

const ratingByCourse = new Map()
const duplicateRatingKeys = []
for (const row of ratings) {
  const key = `${row.course_id}|${row.difficulty}`
  if (ratingByCourse.has(key)) duplicateRatingKeys.push(key)
  ratingByCourse.set(key, {
    id: row.id,
    courseRating: Number(row.course_rating),
    slopeRating: Number(row.slope),
  })
}

const groups = new Map()
for (const row of provenance) {
  const metadata = JSON.parse(row.metadata)
  const key = `${row.canonical_player_id}|${row.source_season}|${row.source_week}`
  const group = groups.get(key) ?? { rowByDifficulty: new Map(), row, metadata }
  group.rowByDifficulty.set(metadata.difficulty, { row, metadata })
  groups.set(key, group)
}

const validPairs = []
const incompletePairs = []
const rowToPair = new Map()
for (const [key, group] of groups) {
  const easy = group.rowByDifficulty.get("easy")
  const hard = group.rowByDifficulty.get("hard")
  if (!easy || !hard || group.rowByDifficulty.size !== 2) {
    incompletePairs.push(key)
    continue
  }
  const result = validateKwtOfficialPair({
    canonicalPlayerId: group.row.canonical_player_id,
    originalPlayerName: group.row.original_player_name,
    seasonNumber: Number(group.row.source_season),
    weekNumber: Number(group.row.source_week),
    evidenceRef: `${group.row.source_ref}|official-result`,
    officialResultVerified: true,
    timingRuleEvidence: "RULE_ONLY",
    easy: { sourceId: easy.row.source_fingerprint, sourceFingerprint: easy.row.source_fingerprint },
    hard: { sourceId: hard.row.source_fingerprint, sourceFingerprint: hard.row.source_fingerprint },
  })
  if (!result.valid) {
    incompletePairs.push(`${key}|${result.issues.join(",")}`)
    continue
  }
  validPairs.push({ key, result, easy, hard })
  for (const record of result.records) rowToPair.set(record.sourceId, record)
}

function buildRounds(mode) {
  const rounds = []
  const missingRatings = []
  for (const pair of validPairs) {
    for (const item of [pair.easy, pair.hard]) {
      const metadata = item.metadata
      const rating = ratingByCourse.get(`${metadata.course_id}|${metadata.difficulty}`)
      if (!rating) {
        missingRatings.push(item.row.source_fingerprint)
        continue
      }
      const sequence = rowToPair.get(item.row.source_fingerprint)
      const chronology = mode === "official"
        ? classifyKwtChronology(sequence).evidence
        : classifyKwtChronology({
            sourceId: item.row.source_fingerprint,
            seasonNumber: Number(item.row.source_season),
            weekNumber: Number(item.row.source_week),
          }).evidence
      rounds.push({
        sourceKey: item.row.source_fingerprint,
        playerId: item.row.canonical_player_id,
        score: Number(metadata.score),
        courseKey: metadata.course_id,
        ratingVersionId: rating.id,
        ratingSnapshotId: rating.id,
        courseRating: rating.courseRating,
        slopeRating: rating.slopeRating,
        sourceType: "KWT",
        personalHandicapEligible: true,
        chronology,
      })
    }
  }
  return { rounds, missingRatings }
}

function summarize(result, prepared) {
  return {
    roundsWithApprovedRating: prepared.rounds.length,
    missingRatingRounds: prepared.missingRatings.length,
    playersWithRounds: result.indexes.length,
    playersWithNumericPreview: result.indexes.filter((item) => item.index !== null).length,
    unpublishedSnapshotCandidates: result.snapshotCandidates.length,
    chronologyConfidence: Object.fromEntries(
      [...result.indexes.reduce((counts, item) => counts.set(item.chronologyConfidence, (counts.get(item.chronologyConfidence) ?? 0) + 1), new Map())],
    ),
    issueCounts: Object.fromEntries(
      [...result.issues.reduce((counts, issue) => counts.set(issue.code, (counts.get(issue.code) ?? 0) + 1), new Map())],
    ),
    indexes: new Map(result.indexes.map((item) => [item.playerId, item])),
  }
}

const periodPrepared = buildRounds("period")
const officialPrepared = buildRounds("official")
const period = summarize(buildPersonalIndexCandidates(periodPrepared.rounds, { calculationRunId: "phase95-period-preview" }), periodPrepared)
const official = summarize(buildPersonalIndexCandidates(officialPrepared.rounds, { calculationRunId: "phase95-official-sequence-preview" }), officialPrepared)
const playerIds = new Set([...period.indexes.keys(), ...official.indexes.keys()])
let statusChanges = 0
let numericChanges = 0
let selectionChanges = 0
for (const playerId of playerIds) {
  const before = period.indexes.get(playerId)
  const after = official.indexes.get(playerId)
  if (!before || !after) continue
  if (before.chronologyConfidence !== after.chronologyConfidence || before.publicationStatus !== after.publicationStatus) statusChanges++
  if (before.index !== after.index) numericChanges++
  if (before.latestSourceKeys.join("|") !== after.latestSourceKeys.join("|")) selectionChanges++
}

console.log(JSON.stringify({
  sourceRows: provenance.length,
  canonicalPlayers: new Set(provenance.map((row) => row.canonical_player_id)).size,
  playerWeekGroups: groups.size,
  validEasyHardPairs: validPairs.length,
  validKwtRows: validPairs.length * 2,
  incompletePairs,
  kwtOnlyRatingKeys: ratingByCourse.size,
  duplicateRatingKeys,
  periodPreview: { ...period, indexes: undefined },
  officialSequencePreview: { ...official, indexes: undefined },
  comparison: { statusChanges, numericChanges, selectionChanges },
}, null, 2))

import { readFile, writeFile } from "node:fs/promises"

function parseCsv(text) {
  const rows = []
  let row = []
  let field = ""
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"'
        index += 1
      } else if (character === '"') {
        quoted = false
      } else {
        field += character
      }
    } else if (character === '"' && field.length === 0) {
      quoted = true
    } else if (character === ",") {
      row.push(field)
      field = ""
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""))
      if (row.some((value) => value.length > 0)) rows.push(row)
      row = []
      field = ""
    } else {
      field += character
    }
  }
  row.push(field.replace(/\r$/, ""))
  if (row.some((value) => value.length > 0)) rows.push(row)
  const header = rows.shift() ?? []
  return rows.map((values) => Object.fromEntries(header.map((name, index) => [name, values[index] ?? ""])))
}

function number(value) {
  if (value === "" || value === undefined) return null
  const result = Number(value)
  return Number.isFinite(result) ? result : null
}

function integer(value) {
  const result = number(value)
  return result === null ? null : Math.trunc(result)
}

function boolean(value) {
  return value === "true"
}

const comparison = parseCsv(await readFile("docs/handicap/phase118/phase118_player_index_comparison.csv", "utf8"))
const movementSummary = parseCsv(await readFile("docs/handicap/phase119/phase119_movement_summary.csv", "utf8"))
const movementRounds = parseCsv(await readFile("docs/handicap/phase119/phase119_movement_rounds.csv", "utf8"))
const courses = parseCsv(await readFile("docs/handicap/phase119/phase119_course_fairness_review.csv", "utf8"))

if (comparison.length !== 166) throw new Error(`expected 166 comparison rows, found ${comparison.length}`)
if (movementSummary.length !== 33) throw new Error(`expected 33 movement rows, found ${movementSummary.length}`)
if (courses.length !== 82) throw new Error(`expected 82 course rows, found ${courses.length}`)

const movementByPlayer = new Map(movementSummary.map((row) => [row.canonical_player_id, row]))
const playerRows = comparison.map((row) => {
  const movement = movementByPlayer.get(row.canonical_player_id)
  const flags = [row.review_flag, movement?.flags].filter(Boolean).join(",")
  return {
    canonicalPlayerId: row.canonical_player_id,
    canonicalScreenName: row.canonical_screen_name,
    previousIndex: number(row.old_phase105_index),
    previousGolfDisplay: row.old_golf_display,
    revisedIndex: number(row.revised_local_index),
    revisedGolfDisplay: row.revised_golf_display,
    movement: number(row.signed_delta),
    absoluteChange: number(row.absolute_change),
    qualifyingRounds: integer(row.revised_eligible_rounds),
    latestTenCount: integer(row.revised_latest_ten),
    bestFiveCount: integer(row.revised_best_five),
    chronologyConfidence: row.chronology_confidence,
    weeklyRowsUsed: integer(row.weekly_rows_used),
    reviewFlag: flags || "NO_LARGE_MOVEMENT",
    status: row.status,
    cause: movement?.cause ?? null,
    recommendation: movement?.recommendation ?? "ACCEPT FOR REVIEW",
    newSeason14RoundsInLatestTen: integer(movement?.new_s14_rounds_in_revised_latest_ten),
    oldLatestTenCount: integer(movement?.old_latest_ten_count),
    oldBestFiveCount: integer(movement?.old_best_five_count),
  }
})

const roundsByPlayer = new Map()
for (const row of movementRounds) {
  const list = roundsByPlayer.get(row.canonical_player_id) ?? []
  list.push({
    source: row.source,
    sourceFingerprint: row.source_fingerprint,
    season: integer(row.season),
    week: integer(row.week),
    difficulty: row.difficulty,
    courseCode: row.course_code,
    courseId: row.course_id,
    score: number(row.score),
    oldCourseRating: number(row.course_rating_used_for_old),
    oldSlope: number(row.slope_used_for_old),
    oldDifferential: number(row.differential_used_for_old),
    revisedCourseRating: number(row.course_rating_used_for_revised),
    revisedSlope: number(row.slope_used_for_revised),
    revisedDifferential: number(row.differential_used_for_revised),
    inOldLatestTen: boolean(row.in_old_latest_ten),
    inNewLatestTen: boolean(row.in_new_latest_ten),
    inOldBestFive: boolean(row.in_old_best_five),
    inNewBestFive: boolean(row.in_new_best_five),
    chronology: row.chronology,
    transition: row.transition,
  })
  roundsByPlayer.set(row.canonical_player_id, list)
}

const courseRows = courses.map((row) => ({
  courseId: row.course_id,
  difficulty: row.difficulty,
  courseRating: number(row.course_rating),
  slope: number(row.slope),
  sampleSize: integer(row.sample_size) ?? 0,
  distinctPlayers: integer(row.distinct_players) ?? 0,
  maxPlayerConcentration: number(row.max_player_concentration),
  confidence: row.confidence,
  provenance: row.provenance,
  kwtRating: number(row.kwt_rating),
  kwtSlope: number(row.kwt_slope),
  weeklyRounds: integer(row.weekly_rounds) ?? 0,
  weeklyDistinctPlayers: integer(row.weekly_distinct_players) ?? 0,
  weeklyRating: number(row.weekly_rating),
  weeklySlope: number(row.weekly_slope),
  combinedRating: number(row.combined_rating),
  combinedSlope: number(row.combined_slope),
  playerIndexEligible: row.player_index_eligible === "true",
  flags: row.flags,
  recommendation: row.recommendation,
  note: row.note,
}))

// The generated module contains a compact explicit contract; JSON data remains
// build-embedded and is imported by the server-only review reader.
const output = `// Generated by scripts/phase120_generate_review_module.mjs. Do not edit by hand.\n\nexport type Phase120PreliminaryPlayer = Readonly<{\n  canonicalPlayerId: string\n  canonicalScreenName: string\n  previousIndex: number | null\n  previousGolfDisplay: string\n  revisedIndex: number | null\n  revisedGolfDisplay: string\n  movement: number | null\n  absoluteChange: number | null\n  qualifyingRounds: number\n  latestTenCount: number\n  bestFiveCount: number\n  chronologyConfidence: string\n  weeklyRowsUsed: number\n  reviewFlag: string\n  status: string\n  cause: string | null\n  recommendation: string\n  newSeason14RoundsInLatestTen: number | null\n  oldLatestTenCount: number | null\n  oldBestFiveCount: number | null\n}>\n\nexport type Phase120MovementRound = Readonly<{\n  source: string\n  sourceFingerprint: string\n  season: number | null\n  week: number | null\n  difficulty: string\n  courseCode: string\n  courseId: string\n  score: number | null\n  oldCourseRating: number | null\n  oldSlope: number | null\n  oldDifferential: number | null\n  revisedCourseRating: number | null\n  revisedSlope: number | null\n  revisedDifferential: number | null\n  inOldLatestTen: boolean\n  inNewLatestTen: boolean\n  inOldBestFive: boolean\n  inNewBestFive: boolean\n  chronology: string\n  transition: string\n}>\n\nexport type Phase120CourseReview = Readonly<{\n  courseId: string\n  difficulty: string\n  courseRating: number | null\n  slope: number | null\n  sampleSize: number\n  distinctPlayers: number\n  maxPlayerConcentration: number | null\n  confidence: string\n  provenance: string\n  kwtRating: number | null\n  kwtSlope: number | null\n  weeklyRounds: number\n  weeklyDistinctPlayers: number\n  weeklyRating: number | null\n  weeklySlope: number | null\n  combinedRating: number | null\n  combinedSlope: number | null\n  playerIndexEligible: boolean\n  flags: string\n  recommendation: string\n  note: string\n}>\n\nexport const PHASE120_PRELIMINARY_PLAYERS = ${JSON.stringify(playerRows, null, 2)} as const\nexport const PHASE120_MOVEMENT_ROUNDS = ${JSON.stringify(Object.fromEntries(roundsByPlayer), null, 2)} as const\nexport const PHASE120_COURSE_REVIEW = ${JSON.stringify(courseRows, null, 2)} as const\nexport const PHASE120_REVIEW_METADATA = ${JSON.stringify({ phase: 120, sourcePhase118: "8f0da3465ddedaef8c9c89c72e236990ccce0b03", sourcePhase119: "025e10ec1ee2353514a54732a9b520945dc8cbf5", status: "PRELIMINARY_UNPUBLISHED", players: 166, majorMovements: 33, courses: 82, weeklyRowsUsedForIndexes: 0, unratedCourse: "GLH", provisionalCourses: 2 }, null, 2)} as const\n`

await writeFile("lib/handicap/phase120PreliminaryReview.ts", output, "utf8")
console.log(`generated 166 players, 33 movement summaries, ${movementRounds.length} movement rounds, 82 courses`)

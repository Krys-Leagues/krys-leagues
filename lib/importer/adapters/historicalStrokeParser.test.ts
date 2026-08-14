import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import test from "node:test"

import {
  HISTORICAL_STROKE_PARSER_VERSION,
  parseHistoricalStrokeCsv,
  parseHistoricalStrokeCsvRows,
  parseHistoricalStrokeMatrix,
} from "./historicalStrokeParser.ts"
import { resolveIdentity } from "../../identity/resolveIdentity.ts"
import type { PlayerIdentityAlias } from "../../identity/types.ts"
import {
  buildHistoricalStrokeCommitPayload,
  categorizeHistoricalStrokeDatabaseError,
  historicalStrokeCommitBlockers,
  historicalStrokeCommitState,
  historicalStrokePreviewFingerprint,
  historicalStrokeSourceSha256,
  reviewHistoricalStrokeIdentity,
} from "../historicalStrokeCommit.ts"

const FIXTURE_URL = new URL("./fixtures/current-season-stroke-play-60.csv.base64", import.meta.url)
const SOURCE_FILENAME = "CURRENT SEASON STROKE PLAY - 60.csv"
const SOURCE_SHA256 = "f406096523039def3556e2b4fda4c6479356f185eacb5d29808ac64162455756"

async function loadFixture() {
  const originalBytes = Buffer.from((await readFile(FIXTURE_URL, "utf8")).trim(), "base64")
  assert.equal(createHash("sha256").update(originalBytes).digest("hex"), SOURCE_SHA256)
  const csv = originalBytes.toString("utf8")
  return {
    csv,
    preview: parseHistoricalStrokeCsv(csv, {
      filename: SOURCE_FILENAME,
      sourceSha256: SOURCE_SHA256,
    }),
  }
}

function findStanding(
  preview: ReturnType<typeof parseHistoricalStrokeCsv>,
  name: string
) {
  const standing = preview.divisions.flatMap((division) => division.standings)
    .find((candidate) => candidate.historicalDisplayName === name)
  assert.ok(standing, `Expected standing for ${name}`)
  return standing
}

function cloneFixtureMatrix(csv: string) {
  return parseHistoricalStrokeCsvRows(csv).map((row) => [...row])
}

test("parses the verified Season 60 source metadata without inventing a year", async () => {
  const { preview } = await loadFixture()
  assert.equal(preview.parserVersion, HISTORICAL_STROKE_PARSER_VERSION)
  assert.equal(preview.parserVersion, "historical-stroke-v1")
  assert.equal(preview.source.filename, SOURCE_FILENAME)
  assert.equal(preview.source.sourceSha256, SOURCE_SHA256)
  assert.equal(preview.source.rows, 62)
  assert.equal(preview.source.columnsPerRow, 40)
  assert.equal(preview.season.seasonNumber, 60)
  assert.equal(preview.season.historicalSeasonLabel, "60*")
  assert.equal(preview.season.rawHeader, "SEASON 60*    ENDS JUNE 27th")
  assert.equal(preview.season.rawEndDateText, "ENDS JUNE 27th")
  assert.equal(preview.season.historicalYear, null)
})

test("detects seven divisions, five populated divisions, and collapses horizontal duplicates", async () => {
  const { preview } = await loadFixture()
  assert.equal(preview.audit.divisionsFound, 7)
  assert.equal(preview.audit.populatedDivisions, 5)
  assert.equal(preview.audit.standingsParsed, 19)
  assert.equal(preview.audit.duplicateRecordsCollapsed, 20)
  assert.equal(preview.audit.leftRightConflicts, 0)
  assert.deepEqual(preview.divisions.map((division) => division.divisionNumber), [1, 2, 3, 4, 5, 6, 7])
  assert.deepEqual(preview.divisions.map((division) => division.populated), [true, true, true, true, true, false, false])
})

test("classifies BYE and eight blank templates without creating standings", async () => {
  const { preview } = await loadFixture()
  assert.equal(preview.audit.byeRowsClassified, 1)
  assert.equal(preview.byeRows[0].sourceName, "BYE")
  assert.equal(preview.byeRows[0].divisionNumber, 4)
  assert.equal(preview.byeRows[0].sourcePosition, 16)
  assert.equal(preview.audit.templateRowsClassified, 8)
  assert.deepEqual(preview.templateRows.map((row) => row.sourcePosition), [17, 18, 19, 20, 21, 22, 23, 24])
  assert.equal(preview.divisions.flatMap((division) => division.standings).some((standing) => standing.historicalDisplayName === "BYE"), false)
  assert.equal(preview.audit.malformedRealPlayerRows, 0)
})

test("preserves exact names, nullable identity, and source positions as provenance only", async () => {
  const { preview } = await loadFixture()
  for (const name of ["THE REAL JB", "RACOONSWHISKER", "ZOEDARLIN", "MAXIMUS_PRIME"]) {
    assert.equal(findStanding(preview, name).historicalDisplayName, name)
    assert.equal(findStanding(preview, name).canonicalPlayerId, null)
  }
  assert.equal(findStanding(preview, "WENDY").sourcePosition, 13)
  assert.equal(findStanding(preview, "ADAMANN").sourcePosition, 13)
  assert.equal(typeof findStanding(preview, "WENDY").sourcePosition, "number")
  assert.equal("playerId" in findStanding(preview, "WENDY"), false)
})

test("captures right-side display order without asserting final placement", async () => {
  const { preview } = await loadFixture()
  const division1 = preview.divisions.find((division) => division.divisionNumber === 1)
  const division4 = preview.divisions.find((division) => division.divisionNumber === 4)
  assert.deepEqual(division1?.sourceDisplayOrder, ["SPICY", "WAREY", "BIGJA", "LAURENT"])
  assert.deepEqual(division4?.sourceDisplayOrder, ["WENDY", "MAXIMUS_PRIME", "CATWEAZEL"])
  assert.equal(findStanding(preview, "WAREY").sourceDisplayPosition, 2)
  assert.equal("finalRank" in findStanding(preview, "WAREY"), false)
  assert.equal("champion" in findStanding(preview, "WAREY"), false)
})

test("reconciles all Season 60 totals and produces no statistical conflicts", async () => {
  const { preview } = await loadFixture()
  assert.equal(preview.audit.statisticalConflicts, 0)
  assert.equal(preview.issues.length, 0)
  for (const standing of preview.divisions.flatMap((division) => division.standings)) {
    assert.equal(standing.played, standing.wins + standing.draws + standing.losses)
    assert.equal(standing.points, standing.wins * 3 + standing.draws)
    const played = standing.courses.filter((course) => course.played)
    assert.equal(played.length, standing.played)
    assert.equal(played.filter((course) => course.outcome === "W").length, standing.wins)
    assert.equal(played.filter((course) => course.outcome === "D").length, standing.draws)
    assert.equal(played.filter((course) => course.outcome === "L").length, standing.losses)
    assert.equal(played.reduce((sum, course) => sum + (course.score ?? 0), 0), standing.strokes)
  }
})

test("reports the exact Season 60 course counts and score signs", async () => {
  const { preview } = await loadFixture()
  assert.equal(preview.audit.totalCourseAppearances, 57)
  assert.equal(preview.audit.playedCourseAppearances, 38)
  assert.equal(preview.audit.unplayedCourseAppearances, 19)
  assert.equal(preview.audit.negativePlayedScores, 30)
  assert.equal(preview.audit.positivePlayedScores, 8)
  assert.equal(preview.audit.numericZeroPlayedScores, 0)
  assert.equal(preview.audit.historicalFixtures, 0)
  assert.equal("fixtures" in preview, false)
  assert.equal("opponents" in preview, false)
})

test("preserves negative and positive scores and maps standalone dash to unplayed null", async () => {
  const { preview } = await loadFixture()
  const spicy = findStanding(preview, "SPICY")
  assert.equal(spicy.courses[0].rawScoreToken, "-")
  assert.equal(spicy.courses[0].played, false)
  assert.equal(spicy.courses[0].score, null)
  assert.equal(spicy.courses[1].score, -6)
  assert.equal(spicy.courses[2].score, -18)
  assert.equal(findStanding(preview, "THE REAL JB").courses[1].score, 1)
  assert.equal(findStanding(preview, "AUDREY").courses[1].score, 9)
})

test("treats a numeric zero with one outcome marker as a legitimate played score", async () => {
  const { csv } = await loadFixture()
  const matrix = cloneFixtureMatrix(csv)
  for (const offset of [0, 20]) {
    matrix[4][offset + 2] = "3"
    matrix[4][offset + 3] = "3"
    matrix[4][offset + 6] = "9"
    matrix[4][offset + 8] = "0"
    matrix[4][offset + 9] = "1"
  }
  const preview = parseHistoricalStrokeMatrix(matrix)
  const course = findStanding(preview, "SPICY").courses[0]
  assert.equal(course.played, true)
  assert.equal(course.score, 0)
  assert.equal(course.outcome, "W")
  assert.equal(preview.audit.numericZeroPlayedScores, 1)
  assert.equal(preview.audit.statisticalConflicts, 0)
})

test("reports a left/right disagreement without silently replacing left-side facts", async () => {
  const { csv } = await loadFixture()
  const matrix = cloneFixtureMatrix(csv)
  matrix[4][26] = "999"
  const preview = parseHistoricalStrokeMatrix(matrix)
  assert.equal(preview.audit.leftRightConflicts, 1)
  assert.equal(findStanding(preview, "SPICY").points, 6)
  assert.ok(preview.issues.some((issue) => issue.code === "left_right_conflict"))
})

test("distinguishes a malformed real-player row from structural and template rows", async () => {
  const { csv } = await loadFixture()
  const matrix = cloneFixtureMatrix(csv)
  matrix[5][2] = "not-a-number"
  const preview = parseHistoricalStrokeMatrix(matrix)
  assert.equal(preview.audit.malformedRealPlayerRows, 1)
  assert.equal(preview.malformedRows[0].sourceName, "BIGJA")
  assert.equal(preview.audit.templateRowsClassified, 8)
  assert.equal(preview.audit.byeRowsClassified, 1)
})

test("reports contradictory course markers as a statistical conflict", async () => {
  const { csv } = await loadFixture()
  const matrix = cloneFixtureMatrix(csv)
  matrix[4][14] = "1"
  matrix[4][34] = "1"
  const preview = parseHistoricalStrokeMatrix(matrix)
  assert.ok(preview.issues.some((issue) => issue.code === "contradictory_course_outcome"))
  assert.ok(preview.audit.statisticalConflicts > 0)
})

test("produces deterministic semantic output for the same source", async () => {
  const { csv } = await loadFixture()
  const first = parseHistoricalStrokeCsv(csv, { filename: SOURCE_FILENAME, sourceSha256: SOURCE_SHA256 })
  const second = parseHistoricalStrokeCsv(csv, { filename: SOURCE_FILENAME, sourceSha256: SOURCE_SHA256 })
  assert.deepEqual(second, first)
  assert.equal(createHash("sha256").update(JSON.stringify(first)).digest("hex"), createHash("sha256").update(JSON.stringify(second)).digest("hex"))
})

test("future Historical Stroke imports reuse only verified global aliases", () => {
  const player = {
    id: "11111111-1111-1111-1111-111111111111",
    screenName: "ZoeCurrent",
    discordName: null,
    discordId: null,
    active: true,
  }
  const alias: PlayerIdentityAlias = {
    playerId: player.id,
    aliasName: "ZOEDARLIN",
    normalizedAlias: "zoedarlin",
    source: "historical_alias",
    verified: true,
    active: true,
  }

  const verified = resolveIdentity({ importedName: "ZOEDARLIN", players: [player], aliases: [alias] })
  assert.equal(verified.status, "alias")
  assert.equal(verified.playerId, player.id)
  assert.equal(verified.matchedSource, "historical_alias")

  const unverified = resolveIdentity({ importedName: "ZOEDARLIN", players: [player], aliases: [{ ...alias, verified: false }] })
  assert.notEqual(unverified.status, "alias")
})

test("Historical Stroke SQL integrates global memory, merge survival, preview, and audit without rewriting history", async () => {
  const sql = await readFile("historical_stroke_identity_integration.sql", "utf8")
  const audit = await readFile("audit_player_identity_references.sql", "utf8")
  const mergeFunction = sql.slice(
    sql.indexOf("create or replace function public.canonicalize_historical_stroke_player_links"),
    sql.indexOf("create or replace function public.preview_site_player_identity_merge")
  )

  assert.match(sql, /public\.remember_verified_player_alias\(\s*p_player_id uuid,\s*p_alias text/)
  assert.match(sql, /perform public\.remember_verified_player_alias\(\s*v_canonical_id,\s*v_standing\.historical_display_name/)
  assert.match(sql, /already belongs to a different canonical player identity/)
  assert.match(sql, /after insert or update of canonical_player_id\s+on public\.player_identity_links/)
  assert.match(sql, /approved_history_count[\s\S]*public\.historical_stroke_standings/)
  assert.match(audit, /\('historical_stroke_standings', 'player_id', 'frozen imported Stroke history; canonicalize on merge'\)/)
  assert.doesNotMatch(mergeFunction, /set\s+(?:historical_display_name|played|wins|draws|losses|points|strokes)\s*=/i)
})

test("hashes exact source bytes and fingerprints only canonical source facts", async () => {
  const originalBytes = Buffer.from((await readFile(FIXTURE_URL, "utf8")).trim(), "base64")
  assert.equal(await historicalStrokeSourceSha256(originalBytes), SOURCE_SHA256)
  const { preview } = await loadFixture()
  const first = await historicalStrokePreviewFingerprint(preview)
  const second = await historicalStrokePreviewFingerprint(structuredClone(preview))
  assert.equal(first, second)
  assert.match(first, /^[a-f0-9]{64}$/)

  const payload = buildHistoricalStrokeCommitPayload(preview, SOURCE_FILENAME, SOURCE_SHA256, first)
  const standing = (payload.p_validated_preview.divisions as Array<{ standings: Array<{ canonicalPlayerId: string | null }> }>)[0].standings[0]
  assert.equal(standing.canonicalPlayerId, null)
  assert.equal(await historicalStrokePreviewFingerprint({
    ...preview,
    source: { ...preview.source, filename: "RENAMED.csv", sourceSha256: "0".repeat(64) },
    divisions: preview.divisions.map((division) => ({
      ...division,
      standings: division.standings.map((item) => ({ ...item, canonicalPlayerId: "11111111-1111-1111-1111-111111111111" })),
    })),
  }), first)
})

test("keeps verified aliases authoritative while suggestions remain unresolved", () => {
  const players = [
    { id: "11111111-1111-1111-1111-111111111111", screenName: "ZoeCurrent", discordName: null, discordId: null, active: true },
    { id: "22222222-2222-2222-2222-222222222222", screenName: "Zoey", discordName: null, discordId: null, active: true },
  ]
  const alias: PlayerIdentityAlias = {
    playerId: players[0].id,
    aliasName: "ZOEDARLIN",
    normalizedAlias: "zoedarlin",
    source: "historical_alias",
    verified: true,
    active: true,
  }
  const verified = reviewHistoricalStrokeIdentity("ZOEDARLIN", players, [alias])
  assert.equal(verified.status, "verified")
  assert.equal(verified.canonicalPlayerId, players[0].id)

  const unverified = reviewHistoricalStrokeIdentity("ZOEDARLIN", players, [{ ...alias, verified: false }])
  assert.equal(unverified.status, "suggested")
  assert.equal(unverified.canonicalPlayerId, null)

  const fuzzy = reviewHistoricalStrokeIdentity("ZoeCurren", players, [])
  assert.equal(fuzzy.status, "suggested")
  assert.equal(fuzzy.canonicalPlayerId, null)
})

test("blocks ambiguous verified aliases instead of silently choosing a player", async () => {
  const players = [
    { id: "11111111-1111-1111-1111-111111111111", screenName: "One", discordName: null, discordId: null, active: true },
    { id: "22222222-2222-2222-2222-222222222222", screenName: "Two", discordName: null, discordId: null, active: true },
  ]
  const aliases: PlayerIdentityAlias[] = players.map((player) => ({
    playerId: player.id,
    aliasName: "OLD NAME",
    normalizedAlias: "oldname",
    source: "historical_alias",
    verified: true,
    active: true,
  }))
  const review = reviewHistoricalStrokeIdentity("OLD NAME", players, aliases)
  assert.equal(review.status, "conflict")
  assert.equal(review.canonicalPlayerId, null)
  const { preview } = await loadFixture()
  const fingerprint = await historicalStrokePreviewFingerprint(preview)
  assert.ok(historicalStrokeCommitBlockers(preview, SOURCE_SHA256, fingerprint, [review]).some((item) => /conflicting verified/i.test(item)))
})

test("allows unresolved real players while excluding BYE and templates from commit identities", async () => {
  const { preview } = await loadFixture()
  const fingerprint = await historicalStrokePreviewFingerprint(preview)
  assert.deepEqual(historicalStrokeCommitBlockers(preview, SOURCE_SHA256, fingerprint, []), [])
  const payload = buildHistoricalStrokeCommitPayload(preview, SOURCE_FILENAME, SOURCE_SHA256, fingerprint)
  const divisions = payload.p_validated_preview.divisions as Array<{ standings: Array<{ historicalDisplayName: string; canonicalPlayerId: null }> }>
  const committedNames = divisions.flatMap((division) => division.standings.map((standing) => standing.historicalDisplayName))
  assert.equal(committedNames.length, 19)
  assert.equal(committedNames.includes("BYE"), false)
  assert.equal(committedNames.includes(""), false)
  assert.ok(divisions.flatMap((division) => division.standings).every((standing) => standing.canonicalPlayerId === null))
})

test("commit payload preserves score signs, numeric zero, and standalone dash semantics", async () => {
  const { csv } = await loadFixture()
  const matrix = cloneFixtureMatrix(csv)
  for (const offset of [0, 20]) {
    matrix[4][offset + 2] = "3"
    matrix[4][offset + 3] = "3"
    matrix[4][offset + 6] = "9"
    matrix[4][offset + 8] = "0"
    matrix[4][offset + 9] = "1"
  }
  const preview = parseHistoricalStrokeMatrix(matrix, { filename: SOURCE_FILENAME, sourceSha256: SOURCE_SHA256 })
  const fingerprint = await historicalStrokePreviewFingerprint(preview)
  const payload = buildHistoricalStrokeCommitPayload(preview, SOURCE_FILENAME, SOURCE_SHA256, fingerprint)
  const courses = (payload.p_validated_preview.divisions as Array<{ standings: Array<{ historicalDisplayName: string; courses: Array<{ score: number | null; rawScoreToken: string; played: boolean }> }> }>).flatMap((division) => division.standings).flatMap((standing) => standing.courses)
  assert.ok(courses.some((course) => course.score! < 0))
  assert.ok(courses.some((course) => course.score! > 0))
  assert.ok(courses.some((course) => course.score === 0 && course.played))
  assert.ok(courses.some((course) => course.rawScoreToken === "-" && course.score === null && !course.played))
})

test("calculates parser blockers and categorizes commit outcomes and errors", async () => {
  const { preview } = await loadFixture()
  assert.ok(historicalStrokeCommitBlockers(preview, "", "").some((item) => /SHA-256/i.test(item)))
  assert.ok(historicalStrokeCommitBlockers({ ...preview, audit: { ...preview.audit, malformedRealPlayerRows: 1 } }, SOURCE_SHA256, "a".repeat(64)).some((item) => /malformed/i.test(item)))
  assert.equal(historicalStrokeCommitState({ historical_stroke_import_id: "id", idempotent: false, standing_count: 19, course_appearance_count: 57, resolved_identity_count: 0, unresolved_identity_count: 19 }), "new")
  assert.equal(historicalStrokeCommitState({ historical_stroke_import_id: "id", idempotent: true, standing_count: 19, course_appearance_count: 57, resolved_identity_count: 1, unresolved_identity_count: 18 }), "idempotent")
  assert.match(categorizeHistoricalStrokeDatabaseError({ code: "42501", message: "denied" }), /^Authorization error:/)
  assert.match(categorizeHistoricalStrokeDatabaseError({ message: "already has different committed source" }), /^Source conflict:/)
  assert.match(categorizeHistoricalStrokeDatabaseError({ message: "alias belongs to a different canonical player identity" }), /^Identity conflict:/)
  assert.match(categorizeHistoricalStrokeDatabaseError({ message: "Preview payload is invalid" }), /^Invalid preview payload:/)
})

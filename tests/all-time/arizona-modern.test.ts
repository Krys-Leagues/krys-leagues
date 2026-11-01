import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import test from "node:test"

import {
  ARIZONA_COURSES,
  mapArizonaCourse,
} from "../../lib/all-time/arizona/catalog.ts"
import {
  parseLegacyCombinedCsv,
  reconcileLegacyCombinedRows,
} from "../../lib/all-time/arizona/legacy.ts"
import {
  buildPreviewRows,
  classifyBestScore,
  combinedScore,
  isOfficialCombinedSource,
} from "../../lib/all-time/arizona/scoring.ts"
import type {
  ArizonaSourceRecord,
  IdentityPreview,
} from "../../lib/all-time/arizona/types.ts"
import { parseArizonaModernWorkbook, parseIndividualCourseWorkbook } from "../../lib/all-time/arizona/xlsm.ts"
import { parseArizonaCourseCsv } from "../../lib/all-time/arizona/csv.ts"
import {
  DEFAULT_ALL_TIME_PAGE_SIZE,
  effectivePreviewCategory,
  identityReviewComplete,
  paginateRows,
} from "../../lib/all-time/arizona/review.ts"
import { matchPlayers } from "../../lib/importer/matchPlayers.ts"
import type { PlayerRecord } from "../../lib/importer/loadPlayers.ts"
import type { PlayerIdentityAlias } from "../../lib/identity/types.ts"
import { denseRanks } from "../../lib/all-time/dense-rank.ts"

const downloads = "C:\\Users\\kryst\\Downloads"

function record(overrides: Partial<ArizonaSourceRecord> = {}): ArizonaSourceRecord {
  return {
    courseCode: "AME",
    difficulty: "Easy",
    canonicalBaseMap: "Arizona Modern",
    canonicalDisplayName: "Arizona Modern Easy",
    sourceCourseName: "Arazona Modern",
    sourceWorksheet: "All Time",
    sourceFilename: "fixture.xlsm",
    sourceFileHash: "a".repeat(64),
    sourceRow: 2,
    sourceRank: 1,
    sourceNameCell: "V2",
    sourceScoreCell: "W2",
    historicalPlayerName: "Player-Alpha",
    score: -24,
    fingerprint: "b".repeat(64),
    ...overrides,
  }
}

function resolved(name = "Player-Alpha", playerId = "player-1"): IdentityPreview {
  return {
    historicalPlayerName: name,
    status: "resolved",
    playerId,
    canonicalScreenName: "PLAYERALPHA",
    matchedSource: "historical_alias",
    confidence: 100,
    candidates: [],
  }
}

test("negative scores are valid and lower score wins", () => {
  assert.equal(classifyBestScore(null, -24), "new_record")
  assert.equal(classifyBestScore(-24, -27), "better_score")
  assert.equal(classifyBestScore(-27, -24), "worse_score_ignored")
  assert.equal(classifyBestScore(-27, -27), "equal_unchanged")
})

test("Single Course Records use dense ranking for tied distinct scores", () => {
  const records = [-25, -25, -25, -24, -24, -22, -20, -20].map((score) => ({ score }))
  assert.deepEqual(denseRanks(records), [1, 1, 1, 2, 2, 3, 4, 4])
})

test("missing scores do not consume a dense rank", () => {
  const records = [{ score: -25 }, { score: null }, { score: -24 }, { score: undefined }, { score: -22 }]
  assert.deepEqual(denseRanks(records), [1, null, 2, null, 3])
})

test("Easy and Hard Single Course rankings are calculated independently", () => {
  const easy = [-25, -25, -24].map((score) => ({ score }))
  const hard = [-18, -17, -17].map((score) => ({ score }))
  assert.deepEqual(denseRanks(easy), [1, 1, 2])
  assert.deepEqual(denseRanks(hard), [1, 2, 2])
})

test("rank layout reserves room through three digits without changing player names", () => {
  const page = readFileSync("app/admin/records/single/page.tsx", "utf8")
  const styles = readFileSync("components/admin/records/AdminRecordsUI.module.css", "utf8")
  const ranks = denseRanks(Array.from({ length: 111 }, (_, index) => ({ score: index - 111 })))
  assert.deepEqual([ranks[8], ranks[9], ranks[98], ranks[99], ranks[110]], [9, 10, 99, 100, 111])
  assert.match(styles, /grid-template-columns:76px minmax\(0,1fr\) minmax\(72px,auto\)/)
  assert.match(styles, /\.rank \{ width:76px;/)
  assert.match(styles, /\.player \{ min-width:0;/)
  assert.match(styles, /overflow-wrap:anywhere/)
  assert.match(page, /\{record\.player_name\}/)
  assert.match(page, /left\.score - right\.score/)
})

test("two different players may remain tied", () => {
  const identities = new Map<string, IdentityPreview>([
    ["A", resolved("A", "player-a")],
    ["B", resolved("B", "player-b")],
  ])
  const preview = buildPreviewRows(
    [
      record({ historicalPlayerName: "A", score: -27, fingerprint: "1".repeat(64) }),
      record({ historicalPlayerName: "B", score: -27, fingerprint: "2".repeat(64) }),
    ],
    identities,
    []
  )
  assert.deepEqual(preview.map((row) => row.category), ["new_record", "new_record"])
  assert.deepEqual(preview.map((row) => row.score), [-27, -27])
})

test("unresolved identity is preserved without a guessed UUID", () => {
  const preview = buildPreviewRows([record()], new Map(), [])
  assert.equal(preview[0].category, "unresolved_identity")
  assert.equal(preview[0].identity.playerId, null)
  assert.equal(preview[0].historicalPlayerName, "Player-Alpha")
})

test("historical name remains exact after canonical linkage", () => {
  const identities = new Map([["Player-Alpha", resolved()]])
  const preview = buildPreviewRows([record()], identities, [])
  assert.equal(preview[0].historicalPlayerName, "Player-Alpha")
  assert.equal(preview[0].identity.canonicalScreenName, "PLAYERALPHA")
})

test("repeat observation fingerprints are idempotent", () => {
  const fingerprints = new Set<string>()
  const observation = record()
  const apply = () => {
    if (fingerprints.has(observation.fingerprint)) return "duplicate_source_row"
    fingerprints.add(observation.fingerprint)
    return "inserted"
  }
  assert.equal(apply(), "inserted")
  assert.equal(apply(), "duplicate_source_row")
  assert.equal(fingerprints.size, 1)
})

test("explicit Arazona Modern mappings create AME and AMH", () => {
  assert.deepEqual(mapArizonaCourse("Arazona Modern", "Easy"), ARIZONA_COURSES.Easy)
  assert.deepEqual(mapArizonaCourse("Arazona Modern", "Hard"), ARIZONA_COURSES.Hard)
  assert.equal(mapArizonaCourse("Arizona Modern", "Easy"), null)
  assert.equal(mapArizonaCourse("Arazona Modern", "Medium"), null)
})

test("combined score and official sources are restricted", () => {
  assert.equal(combinedScore(-27, -24), -51)
  assert.equal(isOfficialCombinedSource("KWT"), true)
  assert.equal(isOfficialCombinedSource("PRO"), true)
  assert.equal(isOfficialCombinedSource("handicap_rounds"), false)
  assert.equal(isOfficialCombinedSource("CASUAL"), false)
})

test("legacy pending rows are preserved but not official", () => {
  const csv = [
    "id,player_id,player_name,course_name,easy_score,hard_score,combined_score,proof_url,played_at,notes,created_at",
    `11111111-1111-1111-1111-111111111111,,Historical Name,Arizona Modern,-27,-24,-51,,2026-05-03,Imported from handicap_rounds,2026-05-11`,
  ].join("\n")
  const parsed = parseLegacyCombinedCsv(csv, "legacy.csv")
  assert.equal(parsed.rows.length, 1)
  assert.equal(parsed.rows[0].sourceStatus, "pending_source_verification")
  assert.equal(parsed.rows[0].official, false)
})

test("available legacy fixtures reconcile to exactly 104 rows", { skip: !existsSync(`${downloads}\\Supabase Snippet Untitled query (84).csv`) }, () => {
  const files = [
    `${downloads}\\Supabase Snippet Untitled query (84).csv`,
    `${downloads}\\Supabase Snippet Untitled query (85).csv`,
  ]
  const rows = files.flatMap((path) =>
    parseLegacyCombinedCsv(readFileSync(path, "utf8"), path).rows
  )
  const report = reconcileLegacyCombinedRows(rows, new Map())
  assert.equal(rows.length, 104)
  assert.equal(report.expected, 104)
  assert.equal(report.accountedFor, 104)
  assert.equal(report.missing, 0)
  assert.equal(report.duplicate, 0)
  assert.equal(report.sourcePendingVerification, 104)
  assert.equal(report.sourceVerifiedKwtOrPro, 0)
})

for (const filename of [
  "All Time Leaderboard Krys (1).xlsm",
  "All Time Leaderboard To 14th Aug 2026 Dawn.xlsm",
]) {
  const path = `${downloads}\\${filename}`
  test(`parser reads only the Arizona pilot block from ${filename}`, { skip: !existsSync(path) }, () => {
    const parsed = parseArizonaModernWorkbook(readFileSync(path), filename)
    assert.equal(parsed.sourceWorksheet, "All Time")
    assert.equal(parsed.sourceCourseName, "Arazona Modern")
    assert.equal(parsed.records.length, 251)
    assert.equal(parsed.records.filter((row) => row.courseCode === "AME").length, 125)
    assert.equal(parsed.records.filter((row) => row.courseCode === "AMH").length, 126)
    assert.equal(parsed.issues.length, 1)
    assert.deepEqual(parsed.issues[0], {
      category: "invalid_score",
      sourceFilename: filename,
      sourceWorksheet: "All Time",
      sourceRow: 128,
      difficulty: "Hard",
      historicalPlayerName: null,
      rawScore: null,
      message: "A score row has no historical player name.",
    })
    assert.ok(parsed.records.every((row) => row.sourceCourseName === "Arazona Modern"))
    assert.ok(parsed.records.every((row) => row.courseCode === "AME" || row.courseCode === "AMH"))
    assert.ok(parsed.records.some((row) => row.score < 0))
    assert.ok(parsed.records.every((row) => Number.isInteger(row.score)))
  })
}

test("August 14 Arizona source differs by one improvement and one name change", {
  skip: !existsSync(`${downloads}\\All Time Leaderboard Krys (1).xlsm`) ||
    !existsSync(`${downloads}\\All Time Leaderboard To 14th Aug 2026 Dawn.xlsm`),
}, () => {
  const oldRows = parseArizonaModernWorkbook(
    readFileSync(`${downloads}\\All Time Leaderboard Krys (1).xlsm`),
    "All Time Leaderboard Krys (1).xlsm"
  ).records
  const newRows = parseArizonaModernWorkbook(
    readFileSync(`${downloads}\\All Time Leaderboard To 14th Aug 2026 Dawn.xlsm`),
    "All Time Leaderboard To 14th Aug 2026 Dawn.xlsm"
  ).records
  const key = (row: ArizonaSourceRecord) =>
    `${row.difficulty}\u0000${row.historicalPlayerName}\u0000${row.score}`
  const oldKeys = new Set(oldRows.map(key))
  const newKeys = new Set(newRows.map(key))

  assert.deepEqual(
    newRows.filter((row) => !oldKeys.has(key(row))).map((row) => [row.difficulty, row.historicalPlayerName, row.score, row.sourceRow]),
    [["Easy", "THE REAL JB", -28, 36], ["Easy", "KD0017", -23, 86], ["Hard", "KD0017", -8, 109]]
  )
  assert.deepEqual(
    oldRows.filter((row) => !newKeys.has(key(row))).map((row) => [row.difficulty, row.historicalPlayerName, row.score, row.sourceRow]),
    [["Easy", "THE REAL JB", -24, 74], ["Easy", "KD", -23, 86], ["Hard", "KD", -8, 109]]
  )
})

test("protected apply resolves supplied UUIDs through Global Identity", () => {
  const sql = readFileSync("all_time_records_apply.sql", "utf8")
  assert.match(sql, /public\.resolve_canonical_player_id\(\(v_item->>'player_id'\)::uuid\)/)
  assert.match(sql, /v_player_id := public\.resolve_canonical_player_id\(/)
})

type MergeBestFixture = {
  playerId: string
  key: string
  score: number
  observationId: string
}

function reconcileBestFamily(
  rows: MergeBestFixture[],
  familyIds: Set<string>,
  keepId: string
) {
  const unaffected = rows.filter((row) => !familyIds.has(row.playerId))
  const affected = rows.filter((row) => familyIds.has(row.playerId))
  const winners = new Map<string, MergeBestFixture>()
  for (const row of affected) {
    const winner = winners.get(row.key)
    if (!winner || row.score < winner.score) winners.set(row.key, row)
  }
  return [
    ...unaffected,
    ...[...winners.values()].map((row) => ({ ...row, playerId: keepId })),
  ]
}

test("identity merge keeps the lower AME and AMH rows with no canonical duplicates", () => {
  const merged = reconcileBestFamily([
    { playerId: "keep", key: "AME", score: -24, observationId: "ame-keep" },
    { playerId: "merge", key: "AME", score: -27, observationId: "ame-merge" },
    { playerId: "keep", key: "AMH", score: -18, observationId: "amh-keep" },
    { playerId: "merge", key: "AMH", score: -15, observationId: "amh-merge" },
  ], new Set(["keep", "merge"]), "keep")

  assert.deepEqual(merged.map((row) => [row.key, row.score, row.observationId]), [
    ["AME", -27, "ame-merge"],
    ["AMH", -18, "amh-keep"],
  ])
  assert.equal(new Set(merged.map((row) => `${row.playerId}:${row.key}`)).size, merged.length)
})

test("identity merge keeps the lower official combined row", () => {
  const merged = reconcileBestFamily([
    { playerId: "keep", key: "Arizona Modern", score: -42, observationId: "combined-keep" },
    { playerId: "merge", key: "Arizona Modern", score: -49, observationId: "combined-merge" },
  ], new Set(["keep", "merge"]), "keep")
  assert.deepEqual(merged, [{
    playerId: "keep",
    key: "Arizona Modern",
    score: -49,
    observationId: "combined-merge",
  }])
})

test("identity merge preserves every historical observation", () => {
  const observations = [
    { playerId: "keep", fingerprint: "source-a" },
    { playerId: "merge", fingerprint: "source-b" },
  ]
  const canonicalized = observations.map((row) => ({ ...row, playerId: "keep" }))
  assert.equal(canonicalized.length, observations.length)
  assert.deepEqual(canonicalized.map((row) => row.fingerprint), ["source-a", "source-b"])
})

test("identity merge with no All-Time rows is unaffected", () => {
  assert.deepEqual(reconcileBestFamily([], new Set(["keep", "merge"]), "keep"), [])
})

test("merge integration is deferred, canonical, and classifies all four references", () => {
  const integration = readFileSync("all_time_identity_merge_integration.sql", "utf8")
  const audit = readFileSync("audit_all_time_identity_references.sql", "utf8")
  const centralAudit = readFileSync("audit_player_identity_references.sql", "utf8")
  assert.match(integration, /create constraint trigger[\s\S]*deferrable initially deferred/i)
  assert.match(integration, /order by best\.score asc/)
  assert.match(integration, /order by best\.combined_score asc/)
  assert.match(integration, /update public\.all_time_record_observations/)
  assert.match(integration, /update public\.all_time_combined_observations/)
  for (const table of [
    "all_time_record_observations",
    "all_time_best_records",
    "all_time_combined_observations",
    "all_time_combined_best_records",
  ]) {
    assert.match(audit, new RegExp(`\\('${table}', 'player_id'`))
    assert.match(centralAudit, new RegExp(`\\('${table}', 'player_id'`))
  }
})

const csvHeader = "historical_player_name,score,source_row,rank,source_workbook,source_date,notes,course_code"

test("AME CSV preserves negative, zero, positive scores and exact historical names", () => {
  const parsed = parseArizonaCourseCsv([
    csvHeader,
    "THE REAL JB,-28,36,35,August.xlsm,2026-08-14,source,AME",
    "KD0017,0,86,85,August.xlsm,2026-08-14,source,AME",
    "Exact_Name,4,90,89,August.xlsm,2026-08-14,source,AME",
  ].join("\n"), "AME", "easy.csv")
  assert.equal(parsed.issues.length, 0)
  assert.deepEqual(parsed.records.map((row) => [row.courseCode, row.historicalPlayerName, row.score]), [
    ["AME", "THE REAL JB", -28], ["AME", "KD0017", 0], ["AME", "Exact_Name", 4],
  ])
})

test("AMH CSV maps only to Arizona Modern Hard", () => {
  const parsed = parseArizonaCourseCsv(`${csvHeader}\nKD0017,-8,109,108,August.xlsm,2026-08-14,source,AMH`, "AMH", "hard.csv")
  assert.equal(parsed.issues.length, 0)
  assert.equal(parsed.records[0].courseCode, "AMH")
  assert.equal(parsed.records[0].difficulty, "Hard")
  assert.equal(parsed.records[0].historicalPlayerName, "KD0017")
})

const aroundCourses = {
  Easy: { code: "AWE", difficulty: "Easy" as const, baseMap: "Around The World", displayName: "Around The World Easy" },
  Hard: { code: "AWH", difficulty: "Hard" as const, baseMap: "Around The World", displayName: "Around The World Hard" },
}

test("generic CSV parser supports AWE and AWH while keeping difficulties separate", () => {
  const easy = parseArizonaCourseCsv(`${csvHeader}\nWorld Player,-20,2,1,August.xlsm,2026-08-14,,AWE`, { ...aroundCourses.Easy, sourceCourseName: "Around The World" }, "awe.csv")
  const hard = parseArizonaCourseCsv(`${csvHeader}\nWorld Player,-12,2,1,August.xlsm,2026-08-14,,AWH`, { ...aroundCourses.Hard, sourceCourseName: "Around The World" }, "awh.csv")
  assert.equal(easy.issues.length, 0)
  assert.equal(hard.issues.length, 0)
  assert.deepEqual([easy.records[0].courseCode, easy.records[0].difficulty, easy.records[0].sourceCourseName], ["AWE", "Easy", "Around The World"])
  assert.deepEqual([hard.records[0].courseCode, hard.records[0].difficulty, hard.records[0].sourceCourseName], ["AWH", "Hard", "Around The World"])
  const mismatch = parseArizonaCourseCsv(`${csvHeader}\nWorld Player,-12,2,1,August.xlsm,2026-08-14,,AWH`, { ...aroundCourses.Easy, sourceCourseName: "Around The World" }, "wrong.csv")
  assert.equal(mismatch.records.length, 0)
  assert.equal(mismatch.issues[0].category, "course_mapping_issue")
})

test("latest workbook has exactly 119 AWE and 114 AWH observations", { skip: !existsSync(`${downloads}\\All Time Leaderboard To 14th Aug 2026 Dawn.xlsm`) }, () => {
  const parsed = parseIndividualCourseWorkbook(readFileSync(`${downloads}\\All Time Leaderboard To 14th Aug 2026 Dawn.xlsm`), "All Time Leaderboard To 14th Aug 2026 Dawn.xlsm", "Around The World", aroundCourses)
  assert.equal(parsed.issues.length, 0)
  assert.equal(parsed.records.filter((row) => row.courseCode === "AWE").length, 119)
  assert.equal(parsed.records.filter((row) => row.courseCode === "AWH").length, 114)
  assert.ok(parsed.records.every((row) => row.sourceWorksheet === "All Time" && row.sourceCourseName === "Around The World"))
})

test("generic migration catalogs AWE/AWH and validates catalog, activity, difficulty, and mapping", () => {
  const sql = readFileSync("all_time_records_generic_course_import.sql", "utf8")
  assert.match(sql, /'AWE', 'Around The World', 'Easy', 'Around The World Easy'/)
  assert.match(sql, /'AWH', 'Around The World', 'Hard', 'Around The World Hard'/)
  assert.match(sql, /course\.active/)
  assert.match(sql, /course\.difficulty in \('Easy', 'Hard'\)/)
  assert.match(sql, /mapping\.source_course_name = v_item->>'source_course_name'/)
  assert.match(sql, /unknown, inactive, Combined/)
  assert.doesNotMatch(sql, /update public\.all_time_record_observations/)
  assert.doesNotMatch(sql, /course\.code in \('AME', 'AMH'\)/)
  assert.doesNotMatch(sql, /all_time_combined_observations/)
  assert.match(sql, /security definer set search_path to ''/)
  assert.match(sql, /resolve_canonical_player_id/)
  assert.match(sql, /site-player-identity-merge/)
})

test("complete catalog migration has unique official individual courses and is rerunnable", () => {
  const sql = readFileSync("all_time_complete_course_catalog.sql", "utf8")
  const rowPattern = /^\s*\('([A-Z0-9]{3})', '((?:''|[^'])*)', '(Easy|Hard)', '((?:''|[^'])*)', 'https:[^']+', \d+, '\d{4}-\d{2}-\d{2}', (null|'((?:''|[^'])*)')\)(?:,|$)/gm
  const rows = [...sql.matchAll(rowPattern)].map((match) => ({
    code: match[1],
    baseMap: match[2].replaceAll("''", "'"),
    difficulty: match[3],
    displayName: match[4].replaceAll("''", "'"),
    sourceCourseName: match[5] === "null" ? null : match[6].replaceAll("''", "'"),
  }))

  assert.equal(rows.length, 82)
  assert.equal(rows.filter((row) => row.difficulty === "Easy").length, 41)
  assert.equal(rows.filter((row) => row.difficulty === "Hard").length, 41)
  assert.equal(new Set(rows.map((row) => row.code)).size, rows.length)
  assert.equal(new Set(rows.map((row) => `${row.baseMap}\0${row.difficulty}`)).size, rows.length)
  assert.equal(rows.filter((row) => row.sourceCourseName !== null).length, 78)
  assert.equal((sql.match(/on conflict \([^)]*\) do nothing;/g) ?? []).length, 2)
  assert.doesNotMatch(sql, /on conflict[\s\S]{0,100}do update/i)
  assert.doesNotMatch(sql, /all_time_record_observations|all_time_best_records|all_time_combined/i)
})

test("complete catalog migration has no temporary staging dependency", () => {
  const sql = readFileSync("all_time_complete_course_catalog.sql", "utf8")
  assert.doesNotMatch(sql, /create\s+(?:temporary|temp)\s+table/i)
  assert.doesNotMatch(sql, /_all_time_catalog_stage/)
  assert.doesNotMatch(sql, /\btruncate\s+table\b/i)
  assert.match(sql, /do \$migration\$[\s\S]*jsonb_agg\(to_jsonb\(staged\)/)
  assert.ok((sql.match(/jsonb_to_recordset\(v_catalog\)/g) ?? []).length >= 6)
  assert.match(sql, /insert into public\.all_time_courses[\s\S]*on conflict \(code\) do nothing/)
  assert.match(sql, /insert into public\.all_time_course_source_mappings[\s\S]*on conflict \(source_type, source_course_name, difficulty\) do nothing/)
})

test("complete catalog preserves exact historical aliases and does not invent Gloop sources", () => {
  const sql = readFileSync("all_time_complete_course_catalog.sql", "utf8")
  assert.match(sql, /\('AME',[^\n]*'Arazona Modern'\)/)
  assert.match(sql, /\('AMH',[^\n]*'Arazona Modern'\)/)
  assert.match(sql, /\('SLE', 'Shangri-La',[^\n]*'Shangri La'\)/)
  assert.match(sql, /\('SLH', 'Shangri-La',[^\n]*'Shangri La'\)/)
  assert.match(sql, /\('MOE', 'Mount Olympus', 'Easy',[^\n]*'Olympus Easy'\)/)
  assert.match(sql, /\('MOH', 'Mount Olympus', 'Hard',[^\n]*'Olympus Hard'\)/)
  assert.match(sql, /\('GLE', 'Gloop Lair', 'Easy',[^\n]*, null\)/)
  assert.match(sql, /\('GLH', 'Gloop Lair', 'Hard',[^\n]*, null\)/)
  assert.doesNotMatch(sql, /\bSBE\b|Strong Badia/)
})

test("admin All-Time course choices use active catalog rows without an SBE special case", () => {
  const singlePage = readFileSync("app/admin/records/single/page.tsx", "utf8")
  const sharedLoader = readFileSync("app/api/admin/records/arizona-modern/_shared.ts", "utf8")
  const allTimePage = readFileSync("app/admin/records/all-time/page.tsx", "utf8")
  const allTimePreview = readFileSync("app/api/admin/records/all-time/preview/route.ts", "utf8")
  const choices = [
    { code: "SBE", active: false, difficulty: "Easy" },
    { code: "GLE", active: true, difficulty: "Easy" },
    { code: "GLH", active: true, difficulty: "Hard" },
  ].filter((course) => course.active && (course.difficulty === "Easy" || course.difficulty === "Hard"))

  assert.deepEqual(choices.map((course) => course.code), ["GLE", "GLH"])
  assert.match(singlePage, /from\("all_time_courses"\)[\s\S]{0,200}\.eq\("active", true\)/)
  assert.ok((sharedLoader.match(/\.eq\("active", true\)/g) ?? []).length >= 2)
  assert.match(allTimePage, /export \{ default \} from "\.\.\/arizona-modern\/page"/)
  assert.match(allTimePreview, /arizona-modern\/preview\/route/)
  assert.doesNotMatch(singlePage, /\bSBE\b|Strong Badia/)
  assert.doesNotMatch(sharedLoader, /\bSBE\b|Strong Badia/)
})

test("Single Course Records loads each leaderboard by canonical course UUID", () => {
  const page = readFileSync("app/admin/records/single/page.tsx", "utf8")
  const scopedQueries = page.match(/\.eq\("course_id", selected\.id\)/g) ?? []
  const courses = {
    twentyEasy: "00000000-0000-0000-0000-000000000020",
    otherEasy: "00000000-0000-0000-0000-000000000021",
    hard: "00000000-0000-0000-0000-000000000022",
    empty: "00000000-0000-0000-0000-000000000023",
  }
  const bestRows = [
    ...Array.from({ length: 132 }, (_, index) => ({ course_id: courses.twentyEasy, score: index - 40 })),
    ...Array.from({ length: 3 }, (_, index) => ({ course_id: courses.otherEasy, score: index - 20 })),
    ...Array.from({ length: 2 }, (_, index) => ({ course_id: courses.hard, score: index - 10 })),
  ]
  const forCourse = (courseId: string) => bestRows.filter((row) => row.course_id === courseId)

  assert.equal(scopedQueries.length, 2)
  assert.equal(forCourse(courses.twentyEasy).length, 132)
  assert.equal(forCourse(courses.otherEasy).length, 3)
  assert.equal(forCourse(courses.hard).length, 2)
  assert.equal(forCourse(courses.empty).length, 0)
  assert.doesNotMatch(page, /single_course_records/)
  assert.doesNotMatch(page, /course_name/)
  assert.match(page, /left\.score - right\.score/)
})

type WorkbookLayout = {
  heading: string
  rank: string
  easyName: string
  easyScore: string
  easyCount: number
  easyLast: number
  hardName: string
  hardScore: string
  hardCount: number
  hardLast: number
}

const workbookLayouts: WorkbookLayout[] = [
  { heading: "8 BIT Lair", rank: "A", easyName: "B", easyScore: "C", easyCount: 108, easyLast: 109, hardName: "D", hardScore: "E", hardCount: 107, hardLast: 108 },
  { heading: "20000 Leagues", rank: "F", easyName: "G", easyScore: "H", easyCount: 133, easyLast: 134, hardName: "I", hardScore: "J", hardCount: 130, hardLast: 131 },
  { heading: "Alfheim", rank: "K", easyName: "L", easyScore: "M", easyCount: 138, easyLast: 139, hardName: "N", hardScore: "O", hardCount: 142, hardLast: 143 },
  { heading: "Alice In Wonderland", rank: "P", easyName: "Q", easyScore: "R", easyCount: 62, easyLast: 63, hardName: "S", hardScore: "T", hardCount: 60, hardLast: 61 },
  { heading: "Arazona Modern", rank: "U", easyName: "V", easyScore: "W", easyCount: 125, easyLast: 126, hardName: "X", hardScore: "Y", hardCount: 126, hardLast: 127 },
  { heading: "Around The World", rank: "Z", easyName: "AA", easyScore: "AB", easyCount: 119, easyLast: 120, hardName: "AC", hardScore: "AD", hardCount: 114, hardLast: 115 },
  { heading: "Atlantis", rank: "AE", easyName: "AF", easyScore: "AG", easyCount: 159, easyLast: 160, hardName: "AH", hardScore: "AI", hardCount: 151, hardLast: 152 },
  { heading: "Bogeys Bonanza", rank: "AJ", easyName: "AK", easyScore: "AL", easyCount: 144, easyLast: 145, hardName: "AM", hardScore: "AN", hardCount: 146, hardLast: 147 },
  { heading: "Cherry Blossom", rank: "AO", easyName: "AP", easyScore: "AQ", easyCount: 135, easyLast: 136, hardName: "AR", hardScore: "AS", hardCount: 126, hardLast: 127 },
  { heading: "Crystal Lair", rank: "AT", easyName: "AU", easyScore: "AV", easyCount: 83, easyLast: 84, hardName: "AW", hardScore: "AX", hardCount: 82, hardLast: 83 },
  { heading: "El Dorado", rank: "AY", easyName: "AZ", easyScore: "BA", easyCount: 153, easyLast: 154, hardName: "BB", hardScore: "BC", hardCount: 152, hardLast: 153 },
  { heading: "Forgotten Fairyland", rank: "BD", easyName: "BE", easyScore: "BF", easyCount: 80, easyLast: 81, hardName: "BG", hardScore: "BH", hardCount: 71, hardLast: 72 },
  { heading: "Gardens of Babylon", rank: "BI", easyName: "BJ", easyScore: "BK", easyCount: 148, easyLast: 149, hardName: "BL", hardScore: "BM", hardCount: 145, hardLast: 146 },
  { heading: "Holiday Hideaway", rank: "BN", easyName: "BO", easyScore: "BP", easyCount: 101, easyLast: 102, hardName: "BQ", hardScore: "BR", hardCount: 100, hardLast: 101 },
  { heading: "Ice Lair", rank: "BS", easyName: "BT", easyScore: "BU", easyCount: 116, easyLast: 117, hardName: "BV", hardScore: "BW", hardCount: 112, hardLast: 113 },
  { heading: "Journey", rank: "BX", easyName: "BY", easyScore: "BZ", easyCount: 137, easyLast: 138, hardName: "CA", hardScore: "CB", hardCount: 137, hardLast: 138 },
  { heading: "Labyrinth", rank: "CC", easyName: "CD", easyScore: "CE", easyCount: 146, easyLast: 147, hardName: "CF", hardScore: "CG", hardCount: 148, hardLast: 149 },
  { heading: "Laser Lair", rank: "CH", easyName: "CI", easyScore: "CJ", easyCount: 143, easyLast: 144, hardName: "CK", hardScore: "CL", hardCount: 141, hardLast: 142 },
  { heading: "Mars Gardens", rank: "CM", easyName: "CN", easyScore: "CO", easyCount: 111, easyLast: 112, hardName: "CP", hardScore: "CQ", hardCount: 109, hardLast: 110 },
  { heading: "Meow Wolf", rank: "CR", easyName: "CS", easyScore: "CT", easyCount: 104, easyLast: 105, hardName: "CU", hardScore: "CV", hardCount: 100, hardLast: 101 },
  { heading: "Myst", rank: "CW", easyName: "CX", easyScore: "CY", easyCount: 136, easyLast: 137, hardName: "CZ", hardScore: "DA", hardCount: 136, hardLast: 137 },
  { heading: "Original Gothic", rank: "DG", easyName: "DH", easyScore: "DI", easyCount: 136, easyLast: 137, hardName: "DJ", hardScore: "DK", hardCount: 143, hardLast: 144 },
  { heading: "Quixote Valley", rank: "DL", easyName: "DM", easyScore: "DN", easyCount: 125, easyLast: 126, hardName: "DO", hardScore: "DP", hardCount: 129, hardLast: 130 },
  { heading: "Raptor Cliffs", rank: "DQ", easyName: "DR", easyScore: "DS", easyCount: 93, easyLast: 94, hardName: "DT", hardScore: "DU", hardCount: 93, hardLast: 94 },
  { heading: "Seagull Stacks", rank: "DV", easyName: "DW", easyScore: "DX", easyCount: 149, easyLast: 150, hardName: "DY", hardScore: "DZ", hardCount: 149, hardLast: 150 },
  { heading: "Shangri La", rank: "EA", easyName: "EB", easyScore: "EC", easyCount: 141, easyLast: 142, hardName: "ED", hardScore: "EE", hardCount: 133, hardLast: 134 },
  { heading: "Sweetopia", rank: "EF", easyName: "EG", easyScore: "EH", easyCount: 141, easyLast: 142, hardName: "EI", hardScore: "EJ", hardCount: 136, hardLast: 137 },
  { heading: "Tiki a Coco", rank: "EK", easyName: "EL", easyScore: "EM", easyCount: 66, easyLast: 67, hardName: "EN", hardScore: "EO", hardCount: 66, hardLast: 67 },
  { heading: "Temple at Zerzura", rank: "EP", easyName: "EQ", easyScore: "ER", easyCount: 132, easyLast: 133, hardName: "ES", hardScore: "ET", hardCount: 134, hardLast: 135 },
  { heading: "Tethys Station", rank: "EU", easyName: "EV", easyScore: "EW", easyCount: 133, easyLast: 134, hardName: "EX", hardScore: "EY", hardCount: 137, hardLast: 138 },
  { heading: "Tokyo", rank: "EZ", easyName: "FA", easyScore: "FB", easyCount: 89, easyLast: 90, hardName: "FC", hardScore: "FD", hardCount: 88, hardLast: 89 },
  { heading: "Tourist Trap", rank: "FE", easyName: "FF", easyScore: "FG", easyCount: 142, easyLast: 143, hardName: "FH", hardScore: "FI", hardCount: 138, hardLast: 139 },
  { heading: "Upside Town", rank: "FJ", easyName: "FK", easyScore: "FL", easyCount: 99, easyLast: 100, hardName: "FM", hardScore: "FN", hardCount: 97, hardLast: 98 },
  { heading: "Venice", rank: "FO", easyName: "FP", easyScore: "FQ", easyCount: 112, easyLast: 113, hardName: "FR", hardScore: "FS", hardCount: 109, hardLast: 110 },
  { heading: "Viva Las Elvis", rank: "FT", easyName: "FU", easyScore: "FV", easyCount: 97, easyLast: 98, hardName: "FW", hardScore: "FX", hardCount: 97, hardLast: 98 },
  { heading: "Wallace & Gromit", rank: "FY", easyName: "FZ", easyScore: "GA", easyCount: 112, easyLast: 113, hardName: "GB", hardScore: "GC", hardCount: 107, hardLast: 108 },
  { heading: "Widows Walkabout", rank: "GD", easyName: "GE", easyScore: "GF", easyCount: 105, easyLast: 106, hardName: "GG", hardScore: "GH", hardCount: 105, hardLast: 106 },
  { heading: "Hollywood", rank: "GI", easyName: "GJ", easyScore: "GK", easyCount: 58, easyLast: 59, hardName: "GL", hardScore: "GM", hardCount: 57, hardLast: 58 },
]

test("latest workbook exact All Time blocks match every historical source mapping", {
  skip: !existsSync(`${downloads}\\All Time Leaderboard To 14th Aug 2026 Dawn.xlsm`),
}, () => {
  const input = readFileSync(`${downloads}\\All Time Leaderboard To 14th Aug 2026 Dawn.xlsm`)
  const courses = {
    Easy: { code: "TESTE", difficulty: "Easy" as const, baseMap: "Test", displayName: "Test Easy" },
    Hard: { code: "TESTH", difficulty: "Hard" as const, baseMap: "Test", displayName: "Test Hard" },
  }
  for (const layout of workbookLayouts) {
    const parsed = parseIndividualCourseWorkbook(input, "All Time Leaderboard To 14th Aug 2026 Dawn.xlsm", layout.heading, courses)
    const easy = parsed.records.filter((row) => row.difficulty === "Easy")
    const hard = parsed.records.filter((row) => row.difficulty === "Hard")
    assert.deepEqual([easy.length, easy[0].sourceRow, easy.at(-1)?.sourceRow, easy[0].sourceNameCell, easy[0].sourceScoreCell], [layout.easyCount, 2, layout.easyLast, `${layout.easyName}2`, `${layout.easyScore}2`], `${layout.heading} Easy`)
    assert.deepEqual([hard.length, hard[0].sourceRow, hard.at(-1)?.sourceRow, hard[0].sourceNameCell, hard[0].sourceScoreCell], [layout.hardCount, 2, layout.hardLast, `${layout.hardName}2`, `${layout.hardScore}2`], `${layout.heading} Hard`)
    assert.equal(easy[0].sourceRank, 1, `${layout.heading} rank ${layout.rank}`)
  }

  const olympus = parseIndividualCourseWorkbook(input, "All Time Leaderboard To 14th Aug 2026 Dawn.xlsm", "Olympus Hard", courses)
  const olympusEasy = olympus.records.filter((row) => row.difficulty === "Easy")
  const olympusHard = olympus.records.filter((row) => row.difficulty === "Hard")
  assert.deepEqual([olympusEasy.length, olympusEasy[0].sourceRow, olympusEasy.at(-1)?.sourceRow, olympusEasy[0].sourceNameCell, olympusEasy[0].sourceScoreCell], [92, 2, 93, "DC2", "DD2"])
  assert.deepEqual([olympusHard.length, olympusHard[0].sourceRow, olympusHard.at(-1)?.sourceRow, olympusHard[0].sourceNameCell, olympusHard[0].sourceScoreCell], [92, 2, 93, "DE2", "DF2"])
  assert.equal(olympusEasy[0].sourceRank, 1)
  assert.equal(olympusHard[0].sourceRank, 1)
})

test("one-course CSV rejects mixed targets and Combined columns", () => {
  const mixed = parseArizonaCourseCsv(`${csvHeader}\nPlayer,-8,2,1,August.xlsm,2026-08-14,source,AMH`, "AME", "mixed.csv")
  assert.equal(mixed.records.length, 0)
  assert.equal(mixed.issues[0].category, "course_mapping_issue")
  const combined = parseArizonaCourseCsv("historical_player_name,score,easy_score,hard_score,combined_score\nPlayer,-8,-4,-4,-8", "AME", "combined.csv")
  assert.equal(combined.records.length, 0)
  assert.match(combined.issues[0].message, /Combined/)
})

test("CSV duplicate rows are identified and skipped deterministically", () => {
  const source = `${csvHeader}\nPlayer,-8,2,1,August.xlsm,2026-08-14,source,AME\nPlayer,-8,3,2,August.xlsm,2026-08-14,source,AME`
  const parsed = parseArizonaCourseCsv(source, "AME", "duplicate.csv")
  assert.equal(parsed.records.length, 1)
  assert.equal(parsed.issues[0].category, "duplicate_source_row")
  assert.equal(parseArizonaCourseCsv(source, "AME", "duplicate.csv").records[0].fingerprint, parsed.records[0].fingerprint)
})

test("review pagination defaults to 50 and supports stable next pages", () => {
  const rows = Array.from({ length: 126 }, (_, index) => index + 1)
  const first = paginateRows(rows, 1, DEFAULT_ALL_TIME_PAGE_SIZE)
  const second = paginateRows(rows, 2, DEFAULT_ALL_TIME_PAGE_SIZE)
  assert.equal(first.rows.length, 50)
  assert.equal(second.rows[0], 51)
  assert.equal(first.totalPages, 3)
})

function player(id: string, screenName: string): PlayerRecord {
  return { id, screen_name: screenName, discord_name: null, discord_username: null, discord_id: null, active: true }
}

test("All-Time review reuses exact and verified-alias canonical matching", () => {
  const canonical = player("player-1", "CURRENT")
  assert.equal(matchPlayers(["CURRENT"], [canonical])[0].autoLinkEligible, true)
  const alias: PlayerIdentityAlias = { playerId: canonical.id, aliasName: "OLD_NAME", normalizedAlias: "oldname", source: "historical_alias", active: true, verified: true }
  const matched = matchPlayers(["OLD_NAME"], [canonical], [alias])[0]
  assert.equal(matched.playerId, canonical.id)
  assert.equal(matched.autoLinkEligible, true)
  assert.equal(matched.evidence, "historical_alias")
})

test("ambiguous and unresolved identities are never auto-accepted", () => {
  const ambiguous = matchPlayers(["SAME"], [player("one", "SAME"), player("two", "SAME")])[0]
  assert.equal(ambiguous.autoLinkEligible, false)
  const unresolved = matchPlayers(["NO SUCH PLAYER"], [player("one", "CURRENT")])[0]
  assert.equal(unresolved.playerId, null)
  assert.equal(unresolved.autoLinkEligible, false)
})

test("admin-selected player and explicit leave-unresolved complete review", () => {
  const previewRow = buildPreviewRows([record()], new Map(), [])[0]
  const selected = { playerId: "chosen", canonicalScreenName: "Chosen", selectionSource: "manual" as const }
  const unresolved = { playerId: null, canonicalScreenName: null, selectionSource: "unresolved" as const }
  assert.equal(identityReviewComplete(previewRow, selected), true)
  assert.equal(effectivePreviewCategory(previewRow, selected, []).category, "new_record")
  assert.equal(identityReviewComplete(previewRow, unresolved), true)
  assert.equal(effectivePreviewCategory(previewRow, unresolved, []).category, "unresolved_identity")
})

test("generic admin page is catalog-driven, CSV-only, and apply remains protected server-side", () => {
  const page = readFileSync("app/admin/records/arizona-modern/page.tsx", "utf8")
  const applyRoute = readFileSync("app/api/admin/records/arizona-modern/apply/route.ts", "utf8")
  const shared = readFileSync("app/api/admin/records/arizona-modern/_shared.ts", "utf8")
  assert.match(page, /accept="\.csv,text\/csv"/)
  assert.doesNotMatch(page, /accept="\.xlsm"/)
  assert.match(page, /\/api\/admin\/records\/all-time/)
  assert.match(page, /INITIAL BEST RECORD/)
  assert.match(page, /NOT LINKED/)
  assert.match(page, /isUnlinked \? "border-b border-amber-500 bg-amber-950\/60/)
  assert.match(page, /isUnlinked \? "bg-amber-400 p-3 text-slate-950"/)
  assert.match(page, /block text-base font-black/)
  assert.match(shared, /all_time_courses/)
  assert.match(shared, /\.eq\("active", true\)/)
  assert.match(shared, /\.in\("difficulty", \["Easy", "Hard"\]\)/)
  const catalogLoader = shared.slice(shared.indexOf("export async function loadIndividualCourses"), shared.indexOf("export async function loadSelectedCourse"))
  assert.doesNotMatch(catalogLoader, /all_time_course_source_mappings/)
  assert.match(shared, /has no historical workbook source mapping and cannot be previewed or imported/)
  for (const code of ["EDE", "EDH", "GBE", "GBH", "SSE", "SSH", "TTE", "TTH"]) {
    assert.doesNotMatch(page, new RegExp(`value=["']${code}["']`))
  }
  assert.match(applyRoute, /authorizedAdminClient/)
  assert.match(applyRoute, /apply_all_time_record_import/)
  assert.doesNotMatch(applyRoute, /apply_all_time_combined_observation/)
})

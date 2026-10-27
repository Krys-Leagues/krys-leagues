import assert from "node:assert/strict"
import test from "node:test"
import { parseCurrentKwtCsv } from "./currentSeasonCsv.ts"

const setup = { season: 15, week: 1, eventIdentifier: "KWTS15W01", courseName: "Raptor Cliffs", easyCourseCode: "RCE", hardCourseCode: "RCH" }
const header = ["Pos", "Player", "Rank Code", "Easy Code", "Hard Code", "Easy", "Hard", "Total Score", "Points", "Badges", ...Array.from({ length: 18 }, (_, i) => `E${i + 1}`), ...Array.from({ length: 18 }, (_, i) => `H${i + 1}`)].join(",")
const row = (position: number, name: string, easy = -20, hard = -18, rankCode = "PRO") => [position, name, rankCode, "RCE", "RCH", easy, hard, easy + hard, 25, "", ...Array(18).fill(1), ...Array(18).fill(2)].join(",")

test("parses complete Easy/Hard hole evidence and preserves negative gross totals", () => {
  const result = parseCurrentKwtCsv(new TextEncoder().encode(`${header}\n${row(1, "Laurent��")}`), "kwt15w01.csv", setup)
  assert.equal(result.rows.length, 1)
  assert.equal(result.rows[0].easyHoles.length, 18)
  assert.equal(result.rows[0].hardHoles.length, 18)
  assert.equal(result.rows[0].totalScore, -38)
  assert.equal(result.rows[0].divisionPlacement, 1)
  assert.equal(result.rows[0].validationErrors.length, 0)
  assert.match(result.sourceSha256, /^[0-9a-f]{64}$/)
})

test("flags duplicate players and course/score validation problems before commit", () => {
  const invalid = row(1, "ALPHA", -20, -18).replace("RCE", "BAD")
  const result = parseCurrentKwtCsv(new TextEncoder().encode(`${header}\n${invalid}\n${row(2, "ALPHA")}`), "kwt15w01.csv", setup)
  assert.equal(result.rows.length, 2)
  assert.ok(result.rows[0].validationErrors.some((error) => error.startsWith("course:")))
  assert.ok(result.rows[1].validationErrors.some((error) => error.startsWith("duplicate:")))
})

test("requires hole-by-hole evidence for the current-season workflow", () => {
  const result = parseCurrentKwtCsv(new TextEncoder().encode("Player,Easy Code,Hard Code,Easy,Hard,Total Score\nALPHA,RCE,RCH,-20,-18,-38\n"), "kwt15w01.csv", setup)
  assert.ok(result.warnings.some((warning) => warning.includes("hole-by-hole")))
  assert.ok(result.rows[0].validationErrors.some((error) => error.startsWith("scores:")))
})

test("derives competition-ranked division placements without a Division Placement column", () => {
  const csv = `${header}\n${row(1, "ALPHA", -24, -21, "ELITE")}\n${row(2, "BRAVO", -20, -20, "ELITE")}\n${row(2, "CHARLIE", -19, -21, "ELITE")}\n${row(4, "DELTA", -20, -20, "PRO")}\n${row(4, "ECHO", -18, -22, "PRO")}\n`
  const result = parseCurrentKwtCsv(new TextEncoder().encode(csv), "kwt15w01.csv", setup)
  assert.deepEqual(result.rows.map((item) => item.divisionPlacement), [1, 2, 2, 1, 1])
  assert.equal(result.rows.every((item) => !item.validationErrors.some((error) => error.startsWith("placement: Division Placement"))), true)
  assert.ok(result.warnings.some((warning) => warning.includes("no Division Placement column")))
})

test("accepts the 46-row current-season shape and preserves source Pos ties", () => {
  const rows = Array.from({ length: 46 }, (_, index) => {
    const total = -45 + Math.floor(index / 2)
    return row(index === 0 ? 1 : Math.floor(index / 2) + 1, `PLAYER_${index + 1}`, Math.floor(total / 2), total - Math.floor(total / 2), index < 12 ? "ELITE" : index < 24 ? "PRO" : index < 33 ? "SEMI" : "AMA")
  })
  const result = parseCurrentKwtCsv(new TextEncoder().encode(`${header}\n${rows.join("\n")}\n`), "kwt15w01_ful_results.csv", setup)
  assert.equal(result.rows.length, 46)
  assert.equal(result.rows.filter((item) => item.validationErrors.length).length, 0)
  assert.equal(result.rows[0].overallPlacement, 1)
  assert.equal(result.rows[1].overallPlacement, 1)
  assert.equal(result.rows[0].divisionPlacement, 1)
  assert.equal(result.rows[1].divisionPlacement, 1)
})

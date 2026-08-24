import assert from "node:assert/strict"
import test from "node:test"
import { previewKwtLibrary, reconcileKwtObservation } from "./kwtLibraryPreview.ts"

const players = Array.from({ length: 50 }, (_, index) => ({ id: `p${index}`, screenName: `Player ${index}`, verifiedAliases: [], status: index === 0 ? "archived" : "active", memorial: index === 1 }))
const row = (index: number, hard = `${-index}`) => ({ Player: `Player ${index}`, "Easy Code": "AME", Easy: `${-index - 1}`, "Hard Code": "AMH", Hard: hard, "Rank Code": "PRO", Pos: `${index + 1}`, "Total Score": `${-index * 2 - 1}`, Points: `${50 - index}` })
const source = (filename: string, rows: Record<string, string>[], sourceHash = filename) => ({ filename, rows, sourceHash })

test("collapses semantically identical variants while preserving source copies", () => {
  const preview = previewKwtLibrary([source("kwt12w1_a.csv", [row(0)]), source("kwt12w1_b.csv", [row(0)])], players)
  assert.equal(preview.periods[0].variants.length, 1)
  assert.deepEqual(preview.periods[0].variants[0].identicalCopies, [{ filename: "kwt12w1_b.csv", sourceHash: "kwt12w1_b.csv" }])
})

test("download-time Rank Code and Pos differences do not create historical score conflicts", () => {
  const first = row(0)
  const second = { ...row(0), "Rank Code": "ELITE", Pos: "99" }
  const period = previewKwtLibrary([source("kwt12w1_a.csv", [first]), source("kwt12w1_b.csv", [second])], players).periods[0]
  assert.equal(period.variants.length, 1)
  assert.equal(period.conflicts.length, 0)
  assert.equal(period.variants[0].rows[0].publishedPosition, "1")
  assert.equal(period.variants[0].rows[0].placement, null)
})

test("reports a strict subset and recommends the unique fuller source", () => {
  const six = Array.from({ length: 6 }, (_, index) => row(index))
  const fortyEight = Array.from({ length: 48 }, (_, index) => row(index))
  const period = previewKwtLibrary([source("kwt12w12_6.csv", six), source("kwt12w12_48.csv", fortyEight)], players).periods[0]
  assert.equal(period.variants.find(variant => variant.recommended)?.rowCount, 48)
  assert.match(period.subsetNotes[0], /plus 42 additional players/)
  assert.equal(period.status, "NEEDS SOURCE CHOICE")
})

test("shows exact conflicting score observations without choosing authority", () => {
  const period = previewKwtLibrary([source("kwt13w1_a.csv", [row(0, "-4")]), source("kwt13w1_b.csv", [row(0, "-5")])], players).periods[0]
  assert.equal(period.conflicts.length, 1)
  assert.deepEqual(period.conflicts[0].observations.map(value => value.hardScore), [-4, -5])
  assert.equal(period.variants.some(variant => variant.recommended), false)
})

test("keeps valid Easy when Hard is missing and retains Pos only as source-snapshot metadata", () => {
  const period = previewKwtLibrary([source("kwt14w1.csv", [row(0, "")])], players).periods[0]
  assert.equal(period.variants[0].easyScoreCount, 1)
  assert.equal(period.variants[0].hardScoreCount, 0)
  assert.equal(period.variants[0].rows[0].publishedPosition, "1")
  assert.equal(period.variants[0].rows[0].placement, null)
  assert.equal(period.status, "MISSING SCORE FACT")
})

test("flags duplicate players inside a source", () => {
  const period = previewKwtLibrary([source("kwt11w12.csv", [row(0), row(0)])], players).periods[0]
  assert.deepEqual(period.variants[0].duplicatePlayers, ["Player 0"])
})

test("archived and Memorial canonical identities remain resolved", () => {
  const period = previewKwtLibrary([source("kwt10w1.csv", [row(0), row(1)])], players).periods[0]
  assert.equal(period.identitiesResolved, true)
  assert.equal(period.variants[0].rows[0].canonicalPlayerStatus, "archived")
  assert.equal(period.variants[0].rows[1].canonicalPlayerMemorial, true)
})

test("reconciliation is deterministic and re-import is idempotent", () => {
  assert.equal(reconcileKwtObservation(null, "fact"), "NEW MISSING PERIOD")
  assert.equal(reconcileKwtObservation("fact", "fact", 1, 1), "EXACT MATCH")
  assert.equal(reconcileKwtObservation("fact", "fact", 0, 1), "SOURCE ENRICHMENT")
  assert.equal(reconcileKwtObservation("old", "new"), "CONFLICT")
})

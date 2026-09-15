import assert from "node:assert/strict"
import test from "node:test"

import { sourceAfterScorecardSelection, validScorecardFile, workspaceAfterSuccessfulSave, type FastEntryWorkspace } from "./fast-entry-workflow.ts"

const workspace = (): FastEntryWorkspace => ({
  period: "previous",
  courseId: "course-1",
  playerId: "player-1",
  playerSearch: "Krys",
  scoreText: "-21",
  holes: Array.from({ length: 18 }, () => "2"),
  source: "SCORECARD",
  reference: "message 123",
  notes: "player-specific note",
  scorecardKey: "card.png",
})

test("scorecard selection defaults provenance without overwriting an explicit source", () => {
  assert.equal(sourceAfterScorecardSelection("", false), "SCORECARD")
  assert.equal(sourceAfterScorecardSelection("Discord backlog", true), "Discord backlog")
})

test("ADD AGAIN clears player, course, scores, evidence, and result-specific provenance", () => {
  const next = workspaceAfterSuccessfulSave(workspace(), "add_again")
  assert.equal(next.period, "previous")
  assert.equal(next.source, "SCORECARD")
  assert.equal(next.playerId, "")
  assert.equal(next.courseId, "")
  assert.equal(next.scorecardKey, null)
  assert.deepEqual(next.holes, Array.from({ length: 18 }, () => ""))
  assert.equal(next.scoreText, "")
  assert.equal(next.reference, "")
  assert.equal(next.notes, "")
})

test("ADD AGAIN SC keeps only the same scorecard, course, source, and period", () => {
  const next = workspaceAfterSuccessfulSave(workspace(), "add_again_scorecard")
  assert.equal(next.period, "previous")
  assert.equal(next.courseId, "course-1")
  assert.equal(next.scorecardKey, "card.png")
  assert.equal(next.source, "SCORECARD")
  assert.equal(next.playerId, "")
  assert.equal(next.playerSearch, "")
  assert.equal(next.scoreText, "")
  assert.ok(next.holes.every((hole) => hole === ""))
})

test("ADD & FINISH clears the whole entry workspace while preserving safe batch defaults", () => {
  const next = workspaceAfterSuccessfulSave(workspace(), "finish")
  assert.equal(next.playerId, "")
  assert.equal(next.courseId, "")
  assert.equal(next.scorecardKey, null)
  assert.equal(next.period, "previous")
  assert.equal(next.source, "SCORECARD")
})

test("scorecard validation accepts supported images up to 10 MB", () => {
  assert.equal(validScorecardFile({ size: 1, type: "image/png" }), true)
  assert.equal(validScorecardFile({ size: 10 * 1024 * 1024, type: "image/jpeg" }), true)
  assert.equal(validScorecardFile({ size: 10 * 1024 * 1024 + 1, type: "image/jpeg" }), false)
  assert.equal(validScorecardFile({ size: 100, type: "application/pdf" }), false)
})

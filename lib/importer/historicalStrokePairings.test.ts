import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import {
  assignOpponent,
  clearPairing,
  pairingCounts,
  pairingWarnings,
  serializePairingState,
  type PairingAppearance,
} from "./historicalStrokePairings.ts"

const appearances: PairingAppearance[] = [
  { id: "a1", standingId: "a", importId: "season-60", divisionNumber: 1, courseOrder: 1, courseName: "ATLANTIS EASY", historicalDisplayName: "ALPHA", played: true, score: -8, rawScoreToken: "-8 W", outcome: "W" },
  { id: "b1", standingId: "b", importId: "season-60", divisionNumber: 1, courseOrder: 1, courseName: "ATLANTIS EASY", historicalDisplayName: "BRAVO", played: true, score: -4, rawScoreToken: "-4 L", outcome: "L" },
  { id: "c1", standingId: "c", importId: "season-60", divisionNumber: 1, courseOrder: 1, courseName: "ATLANTIS EASY", historicalDisplayName: "CHARLIE", played: false, score: null, rawScoreToken: "-", outcome: null },
  { id: "d1", standingId: "d", importId: "season-60", divisionNumber: 2, courseOrder: 1, courseName: "ATLANTIS EASY", historicalDisplayName: "DELTA", played: false, score: null, rawScoreToken: "-", outcome: null },
  { id: "a2", standingId: "a", importId: "season-60", divisionNumber: 1, courseOrder: 2, courseName: "LABYRINTH HARD", historicalDisplayName: "ALPHA", played: false, score: null, rawScoreToken: "-", outcome: null },
  { id: "x1", standingId: "x", importId: "season-59", divisionNumber: 1, courseOrder: 1, courseName: "ATLANTIS EASY", historicalDisplayName: "XRAY", played: true, score: 0, rawScoreToken: "0 D", outcome: "D" },
]

test("existing Season 60 appearances can be grouped for review without re-import", () => {
  assert.equal(appearances.filter((item) => item.importId === "season-60").length, 5)
})

test("player assignment creates the reciprocal assignment", () => {
  const state = assignOpponent({}, appearances, "a1", "player", "b")
  assert.equal(state.a1.opponentStandingId, "b")
  assert.equal(state.b1.opponentStandingId, "a")
})

test("self pairing is rejected", () => assert.throws(() => assignOpponent({}, appearances, "a1", "player", "a"), /themself/))

test("a reviewed player cannot be paired twice without a deliberate clear", () => {
  const state = assignOpponent({}, appearances, "a1", "player", "b")
  assert.throws(() => assignOpponent(state, appearances, "c1", "player", "b"), /already has/)
})

test("cross-division pairing is rejected", () => assert.throws(() => assignOpponent({}, appearances, "a1", "player", "d"), /same import, division, and course/))
test("cross-import pairing is rejected", () => assert.throws(() => assignOpponent({}, appearances, "a1", "player", "x"), /same import, division, and course/))
test("cross-course pairing is rejected", () => {
  const withoutSameGameOpponent = appearances.filter((item) => item.id !== "b1")
  assert.throws(() => assignOpponent({}, withoutSameGameOpponent, "a1", "player", "b"), /same import, division, and course/)
})

test("BYE and Unknown carry no opponent standing UUID", () => {
  assert.equal(assignOpponent({}, appearances, "a1", "bye").a1.opponentStandingId, null)
  assert.equal(assignOpponent({}, appearances, "a1", "unknown").a1.opponentStandingId, null)
})

test("unplayed games may receive a confirmed opponent without source mutation", () => {
  const source = structuredClone(appearances)
  const state = assignOpponent({}, appearances, "c1", "player", "b")
  assert.equal(state.c1.kind, "player")
  assert.deepEqual(appearances, source)
})

test("pairing leaves played, score, outcome, and frozen names untouched", () => {
  const before = JSON.stringify(appearances)
  assignOpponent({}, appearances, "a1", "player", "b")
  assert.equal(JSON.stringify(appearances), before)
})

test("clearing a player pair clears both reciprocal assignments", () => {
  const state = clearPairing(assignOpponent({}, appearances, "a1", "player", "b"), appearances, "a1")
  assert.deepEqual(state, {})
})

test("clearing BYE affects only that assignment", () => {
  const state = assignOpponent(assignOpponent({}, appearances, "a1", "bye"), appearances, "c1", "unknown")
  assert.deepEqual(Object.keys(clearPairing(state, appearances, "a1")), ["c1"])
})

test("clearing Unknown affects only that assignment", () => {
  const state = assignOpponent(assignOpponent({}, appearances, "a1", "unknown"), appearances, "c1", "bye")
  assert.deepEqual(Object.keys(clearPairing(state, appearances, "a1")), ["c1"])
})

test("source-result mismatch is warning-only", () => {
  const mismatched = appearances.map((item) => item.id === "b1" ? { ...item, outcome: "W" as const } : item)
  const state = assignOpponent({}, mismatched, "a1", "player", "b")
  assert.match(pairingWarnings(state, mismatched).join(" "), /do not reconcile/)
  assert.equal(state.a1.kind, "player")
})

test("an already-reviewed pairing cannot be silently replaced", () => {
  const state = assignOpponent({}, appearances, "a1", "player", "b")
  assert.throws(() => assignOpponent(state, appearances, "a1", "player", "c"), /Clear Pairing/)
})

test("standing-to-standing pairings do not contain Global Player identity UUIDs", () => {
  const payload = serializePairingState(assignOpponent({}, appearances, "a1", "player", "b"))
  assert.ok(payload.every((item) => !("player_id" in item)))
  assert.equal(payload[0].opponent_standing_id, "b")
})

test("unreviewed and explicit Unknown are distinct", () => {
  const state = assignOpponent({}, appearances, "a1", "unknown")
  assert.equal(state.a1.kind, "unknown")
  assert.equal(state.b1, undefined)
  assert.deepEqual(pairingCounts(state, 2), { total: 2, reviewed: 1, unreviewed: 1, player: 0, bye: 0, unknown: 1 })
})

test("negative, numeric-zero, and unplayed source display semantics remain available", () => {
  assert.equal(appearances.find((item) => item.id === "a1")?.score, -8)
  assert.equal(appearances.find((item) => item.id === "x1")?.score, 0)
  assert.equal(appearances.find((item) => item.id === "c1")?.score, null)
  assert.equal(appearances.find((item) => item.id === "c1")?.played, false)
})

test("SQL enforces admin-only separate evidence with reciprocal validation and concurrency protection", async () => {
  const sql = await readFile(new URL("../../historical_stroke_pairing_review.sql", import.meta.url), "utf8")
  assert.match(sql, /create table if not exists public\.historical_stroke_opponent_assignments/)
  assert.match(sql, /public\.is_current_user_site_admin\(\)/)
  assert.match(sql, /Pairing review changed since it was loaded/)
  assert.match(sql, /Player pairings must be reciprocal/)
  assert.match(sql, /opponent_historical_stroke_standing_id uuid/)
  assert.doesNotMatch(sql, /opponent_player_id/)
})

test("SQL validates BYE source evidence and never creates a BYE standing or player", async () => {
  const sql = await readFile(new URL("../../historical_stroke_pairing_review.sql", import.meta.url), "utf8")
  assert.match(sql, /validated_preview->'byeRows'/)
  assert.doesNotMatch(sql, /insert into public\.historical_stroke_standings/i)
  assert.doesNotMatch(sql, /insert into public\.players/i)
})

test("pairing SQL cannot rewrite frozen source facts, managed Stroke, Match, or identities", async () => {
  const sql = await readFile(new URL("../../historical_stroke_pairing_review.sql", import.meta.url), "utf8")
  assert.doesNotMatch(sql, /update\s+public\.historical_stroke_(?:imports|standings|course_appearances)/i)
  assert.doesNotMatch(sql, /(?:insert|update|delete)\s+(?:from\s+)?public\.(?:players|player_aliases|stroke_|historical_match)/i)
  assert.doesNotMatch(sql, /source_sha256|preview_fingerprint|historical_display_name|\bplayed\b|\bscore\b/)
})

test("UI offers existing import selection, local draft editing, explicit save, and evidence-limited BYE", async () => {
  const component = await readFile(new URL("../../app/admin/import/csv/components/CommittedHistoricalStrokePairings.tsx", import.meta.url), "utf8")
  assert.match(component, /historical_stroke_imports/)
  assert.match(component, /setDraftState/)
  assert.match(component, /Save Pairings/)
  assert.match(component, /byeDivisions\.has/)
  assert.match(component, /Unreviewed/)
  assert.match(component, /Unknown \(reviewed\)/)
})

test("BYE structural evidence remains metadata rather than a standing", async () => {
  const parser = await readFile(new URL("./adapters/historicalStrokeParser.ts", import.meta.url), "utf8")
  assert.match(parser, /byeRows\.push/)
  assert.doesNotMatch(parser, /historicalDisplayName:\s*"BYE"/)
})

test("the existing Historical Stroke fingerprint implementation is not changed by pairing state", async () => {
  const commit = await readFile(new URL("./historicalStrokeCommit.ts", import.meta.url), "utf8")
  assert.doesNotMatch(commit, /opponent|pairing/i)
})

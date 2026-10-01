import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import test from "node:test"

import { buildMastersLiveRows, formatMastersLiveScore, sortMastersLiveRows } from "./mastersLiveResults.ts"
import type { MajorPlayerScorecard, MajorResultsPayload } from "./majors.ts"

function card(entry: number, round: 1 | 2 | 3 | 4, toPar: number, status: "submitted" | "verified" = "verified"): MajorPlayerScorecard {
  return {
    id: `card-${entry}-${round}`,
    major_event_id: "event",
    play_day_id: `day-${round}`,
    entry_id: `entry-${entry}`,
    player_id: `player-${entry}`,
    player_screen_name_snapshot: `PLAYER_${entry}`,
    course_code: round <= 2 ? "CBE" : "CBH",
    status,
    submitted_at: null,
    submitted_by: null,
    verified_at: null,
    verified_by: null,
    verifier_screen_name: null,
    verification_notes: null,
    total_strokes: 60 + toPar,
    score_to_par: toPar,
    slot_starts_at: null,
    room_label: null,
    day_number: round,
    day_label: `Round ${round}`,
    holes: [],
  }
}

function payload(cards: MajorPlayerScorecard[], activeDay = 2): MajorResultsPayload {
  return {
    event: { id: "event", slug: "masters", name: "The Mini-Golf Masters", year: 2026, is_test_event: false },
    notice: "Live standings can change until verified.",
    active_day_number: activeDay,
    entrants: [1, 2, 3, 4].map((entry) => ({
      entry_id: `entry-${entry}`,
      player_id: `player-${entry}`,
      player_screen_name_snapshot: `PLAYER_${entry}`,
    })),
    rounds: [1, 2, 3, 4].map((round) => ({
      day_number: round as 1 | 2 | 3 | 4,
      label: `Round ${round}`,
      course_code: round <= 2 ? "CBE" : "CBH",
      is_entry_open: round === activeDay,
      is_finalized: round < activeDay,
      cards: cards.filter((item) => item.day_number === round),
    })),
    snapshots: [],
  }
}

test("full-field rows preserve entrants with clean unplayed placeholders", () => {
  const rows = buildMastersLiveRows(payload([card(1, 1, -8), card(1, 2, -7), card(2, 1, -5)]))
  assert.equal(rows.length, 4)
  assert.equal(rows.find((row) => row.entryId === "entry-1")?.easyTotal, -15)
  assert.equal(rows.find((row) => row.entryId === "entry-2")?.easyTotal, null)
  assert.equal(rows.find((row) => row.entryId === "entry-2")?.overallPlace, null)
  assert.equal(formatMastersLiveScore(null), "—")
  assert.equal(formatMastersLiveScore(0), "E")
  assert.equal(formatMastersLiveScore(3), "+3")
})

test("overall rankings use current completed rounds and standard tied placements", () => {
  const rows = buildMastersLiveRows(payload([
    card(1, 1, -8), card(1, 2, -7),
    card(2, 1, -6), card(2, 2, -9),
    card(3, 1, -5), card(3, 2, -4),
  ]))
  const ordered = sortMastersLiveRows(rows, "overall")
  assert.deepEqual(ordered.map((row) => [row.name, row.overallPlace, row.overallTotal]), [
    ["PLAYER_1", "T1", -15],
    ["PLAYER_2", "T1", -15],
    ["PLAYER_3", "3", -9],
    ["PLAYER_4", null, null],
  ])
})

test("provisional cards remain visible without changing score aggregation", () => {
  const rows = buildMastersLiveRows(payload([card(1, 1, -8), card(1, 2, -7, "submitted")]))
  const player = rows.find((row) => row.entryId === "entry-1")!
  assert.equal(player.easyTotal, -15)
  assert.equal(player.overallTotal, -15)
  assert.equal(player.provisional, true)
  assert.equal(player.rounds[2].status, "submitted")
})

test("easy and hard totals require both rounds and never count missing rounds as zero", () => {
  const rows = buildMastersLiveRows(payload([
    card(1, 1, -8), card(1, 2, -7), card(1, 3, -6),
    card(2, 1, -4), card(2, 2, -4), card(2, 3, -7), card(2, 4, -5),
  ], 4))
  const one = rows.find((row) => row.entryId === "entry-1")!
  const two = rows.find((row) => row.entryId === "entry-2")!
  assert.equal(one.hardTotal, null)
  assert.equal(one.overallTotal, null)
  assert.equal(two.hardTotal, -12)
  assert.equal(two.overallTotal, -20)
  assert.equal(sortMastersLiveRows(rows, "hard")[0]?.entryId, "entry-2")
})

test("full field supports at least 56 entrants without inventing score rows", () => {
  const fullFieldPayload = payload([])
  fullFieldPayload.entrants = Array.from({ length: 56 }, (_, index) => ({
    entry_id: `entry-${index + 1}`,
    player_id: `player-${index + 1}`,
    player_screen_name_snapshot: `PLAYER_${index + 1}`,
  }))
  const rows = buildMastersLiveRows(fullFieldPayload)
  assert.equal(rows.length, 56)
  assert.ok(rows.every((row) => row.overallTotal === null && row.overallPlace === null))
})

test("public board exposes one four-round tracker without hidden-field wording", () => {
  const pageSource = readFileSync(new URL("../app/majors/[slug]/results/page.tsx", import.meta.url), "utf8")
  const migrationSource = readFileSync(
    new URL("../supabase/migrations/20260930215309_public_masters_full_field_results.sql", import.meta.url),
    "utf8"
  )
  const playerFacingSource = `${pageSource}\n${migrationSource}`

  assert.match(pageSource, /MASTERS LIVE SCORE TRACKER/)
  assert.match(pageSource, /ROUND 1/)
  assert.match(pageSource, /ROUND 2/)
  assert.match(pageSource, /ROUND 3/)
  assert.match(pageSource, /FINAL ROUND/)
  assert.match(pageSource, /OVERALL/)
  assert.match(pageSource, /PlayerDetail/)
  assert.doesNotMatch(pageSource, /BOARD_OPTIONS|RoundPairBoard|boardNavigation/)
  assert.doesNotMatch(playerFacingSource, /CUT LINE|TOP 50%|QUALIFYING|ADVANCE|ELIMINATED|SECONDARY TROPHY|SECOND FIELD/i)
  assert.doesNotMatch(migrationSource, /weekend_field/)
})

test("Masters board uses the byte-identical supplied Krys Leagues logo", () => {
  const logo = readFileSync(new URL("../public/masters/krys-leagues-logo-source.png", import.meta.url))
  const digest = createHash("sha256").update(logo).digest("hex")
  assert.equal(digest, "21824c766ce4602a5bc339a0ae0e1b4854ae16a23a671969f896ef02958d30cd")
})

test("Masters board uses the byte-identical locked ornate scoreboard artwork", () => {
  const artwork = readFileSync(new URL("../public/masters/masters-live-scoreboard-reference.png", import.meta.url))
  const digest = createHash("sha256").update(artwork).digest("hex")
  assert.equal(digest, "9781c93b3a877128c69b806c9459de092f72e575b61e1372b676ddfd485c8022")
})

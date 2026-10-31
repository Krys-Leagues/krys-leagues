import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"
import { groupSoloSubmissionsByDay, soloSubmissionDayKey, soloTrackLabel } from "./soloAdminReview.ts"

const row = (id: string, submitted_at: string, status: "provisional" | "verified" | "rejected", affects_score = false, affects_hn1 = false) => ({ id, submitted_at, status, difficulty: "easy" as const, affects_score, affects_hn1 })

test("Solo review groups cards by submission day and summarizes review state", () => {
  const groups = groupSoloSubmissionsByDay([row("old", "2026-10-04T13:00:00.000Z", "verified"), row("new-review", "2026-10-05T14:00:00.000Z", "provisional"), row("new-verified", "2026-10-05T15:00:00.000Z", "verified")])
  assert.deepEqual(groups.map((group) => group.day), ["2026-10-05", "2026-10-04"])
  assert.deepEqual(groups[0] && { total: groups[0].total, verified: groups[0].verified, needReview: groups[0].needReview }, { total: 2, verified: 1, needReview: 1 })
})

test("Solo review preserves a stable day key for invalid timestamps", () => {
  assert.equal(soloSubmissionDayKey("not-a-date"), "unknown")
})

test("Solo review makes independent score and HN1 effects obvious", () => {
  assert.equal(soloTrackLabel(true, true), "BOTH")
  assert.equal(soloTrackLabel(true, false), "SCORE TRACK")
  assert.equal(soloTrackLabel(false, true), "HN1 TRACK")
  assert.equal(soloTrackLabel(false, false), "NEITHER")
})

test("Solo admin review keeps evidence inline and manual override secondary", () => {
  const reviewPage = fs.readFileSync(new URL("../app/admin/solo/review/page.tsx", import.meta.url), "utf8")
  const manualRoute = fs.readFileSync(new URL("../app/api/admin/solo/manual/route.ts", import.meta.url), "utf8")
  assert.match(reviewPage, /ADMIN OVERRIDE \/ MANUAL CARD ENTRY/)
  assert.match(reviewPage, /Scroll inside the card to pan while zoomed/)
  assert.match(reviewPage, /<img src=\{row\.evidence_url\}/)
  assert.match(reviewPage, /TRACK EFFECT/)
  assert.match(manualRoute, /authorizeSoloAdmin/)
  assert.match(manualRoute, /solo_submissions/)
  assert.match(manualRoute, /status: "verified"/)
  assert.doesNotMatch(manualRoute, /save_solo_card/)
})

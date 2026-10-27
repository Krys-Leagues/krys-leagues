import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"
import { test } from "node:test"

import { historyStage, historyStageLabel, normalizeAdminHistoryFilters, recentSubmissionWindow } from "./adminHistory.ts"

const root = new URL("../../", import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), "utf8")

test("admin history filters fail closed to bounded, known values", () => {
  const filters = normalizeAdminHistoryFilters(new URLSearchParams("page=-3&pageSize=999&difficulty=bogus&status=approved&stage=ace"))
  assert.equal(filters.page, 1)
  assert.equal(filters.pageSize, 50)
  assert.equal(filters.difficulty, "all")
  assert.equal(filters.status, "approved")
  assert.equal(filters.stage, "ace")
})

test("admin history labels preserve level, Ace, and prestige tracks", () => {
  assert.equal(historyStage("level"), "level")
  assert.equal(historyStage("ace"), "ace")
  assert.equal(historyStage("prestige"), "prestige")
  assert.equal(historyStage("unexpected"), "level")
  assert.equal(historyStageLabel("level", 3, null, null), "Level 3")
  assert.equal(historyStageLabel("ace", 1, 2, null), "Ace 2")
  assert.equal(historyStageLabel("prestige", 1, null, 2), "Prestige 2")
})

test("player history and evidence routes remain admin-only and server-side", () => {
  const route = read("app/api/admin/course-challenges/history/route.ts")
  const evidence = read("app/api/admin/course-challenges/history/evidence/route.ts")
  const queue = read("components/admin/course-challenges/CourseChallengeReviewQueue.tsx")
  assert.match(route, /requireCourseChallengeAdmin\(\)/)
  assert.match(route, /createCourseChallengesServiceClient\(\)/)
  assert.match(route, /loadAdminGlobalPlayerDirectory/)
  assert.match(route, /course_challenge_submissions/)
  assert.match(route, /proof_image_sha256/)
  assert.match(evidence, /requireCourseChallengeAdmin\(\)/)
  assert.match(evidence, /createSignedUrl/)
  assert.doesNotMatch(evidence, /export async function POST|\.update\(|\.insert\(|\.delete\(/)
  assert.match(queue, /VIEW PLAYER HISTORY/)
  assert.match(queue, /target="_blank"/)
})

test("recent submission windows use Eastern calendar boundaries and a bounded seven-day range", () => {
  const today = recentSubmissionWindow(new Date("2026-10-23T03:30:00.000Z"), 0)
  assert.equal(today.timeZone, "America/New_York")
  assert.equal(today.dateKey, "2026-10-22")
  assert.equal(today.startIso, "2026-10-22T04:00:00.000Z")
  assert.equal(today.endIso, "2026-10-23T04:00:00.000Z")
  assert.equal(today.dayLabel, "TODAY")

  const oldest = recentSubmissionWindow(new Date("2026-10-23T16:00:00.000Z"), 99)
  assert.equal(oldest.dayOffset, 6)
  assert.equal(oldest.dateKey, "2026-10-17")
  assert.equal(oldest.dayLabel, "6 DAYS AGO")
})

test("recent submissions stay admin-only, use server-side identity resolution, and query a half-open day window", () => {
  const route = read("app/api/admin/course-challenges/history/route.ts")
  const ui = read("components/admin/course-challenges/CourseChallengePlayerHistory.tsx")
  assert.match(route, /recentSubmissionWindow/)
  assert.match(route, /loadAdminGlobalPlayerDirectory\(recent \? "" : search\)/)
  assert.match(route, /\.gte\("created_at", day\.startIso\)/)
  assert.match(route, /\.lt\("created_at", day\.endIso\)/)
  assert.match(route, /createCourseChallengesServiceClient\(\)/)
  assert.match(route, /requireCourseChallengeAdmin\(\)/)
  assert.doesNotMatch(route, /\.insert\(|\.update\(|\.delete\(/)
  assert.match(ui, /RECENT SUBMISSIONS/)
  assert.match(ui, /ArrowDown/)
  assert.match(ui, /AbortController/)
  assert.match(ui, /dayOffset >= 6/)
  assert.match(ui, /No Course Challenge submissions for this day\./)
})

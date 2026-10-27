import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { classifyRecord, climbersPoints } from "../all-time/normal-records.ts"

const sql = readFileSync(new URL("../../course_challenges_all_time_integration.sql", import.meta.url), "utf8")
const route = readFileSync(new URL("../../app/api/admin/course-challenges/route.ts", import.meta.url), "utf8")

test("Course Challenge approval uses the existing All-Time comparison semantics", () => {
  assert.equal(classifyRecord(null, -12), "FIRST")
  assert.equal(classifyRecord(-10, -15), "BETTER")
  assert.equal(classifyRecord(-15, -15), "EQUAL")
  assert.equal(classifyRecord(-15, -10), "WORSE")
  assert.equal(climbersPoints("FIRST", 3), 0)
  assert.equal(climbersPoints("BETTER", 3), 3)
  assert.equal(climbersPoints("BETTER", 0), 0)
  assert.equal(climbersPoints("EQUAL", 3), 0)
})

test("Course Challenge All-Time integration preserves canonical PB, pass, and timestamp rules", () => {
  assert.match(sql, /create or replace function public\.apply_all_time_entry/i)
  assert.match(sql, /create or replace function public\.record_all_time_normal_entry/i)
  assert.match(sql, /score > v_score/i)
  assert.match(sql, /starts_at <= v_authoritative_at and ends_at > v_authoritative_at/i)
  assert.match(sql, /effective_at,effective_date/i)
  assert.match(sql, /course_challenge_submission_id/i)
  assert.match(sql, /for update/i)
  assert.match(sql, /all_time_processing_status = 'processed'/i)
})

test("approval routes through the idempotent database path before Course Challenge progression", () => {
  assert.match(route, /approve_course_challenge_submission/)
  assert.match(route, /updateProgressAndRewards\(/)
  assert.match(route, /No All-Time, Climbers, progress, or rewards were changed\./)
  assert.match(route, /formatApprovalMessage/)
})

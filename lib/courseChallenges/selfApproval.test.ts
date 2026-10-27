import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const root = new URL("../../", import.meta.url)
const read = (path: string) => readFile(new URL(path, root), "utf8")

test("self-approval is enforced with the canonical player resolver in the RPC and API", async () => {
  const sql = await read("course_challenges_self_approval_guard.sql")
  const api = await read("app/api/admin/course-challenges/route.ts")
  assert.match(sql, /current_user_canonical_player_id\(\)/)
  assert.match(sql, /v_reviewer_player_id\s*=\s*v_submission\.player_id/)
  assert.match(sql, /cannot approve your own Course Challenge submission/i)
  assert.match(api, /current_user_canonical_player_id/)
  assert.match(api, /reviewer\.data.*submission\.data\.player_id/)
})

test("the shared queue disables self-approval while keeping rejection available", async () => {
  const queue = await read("components/admin/course-challenges/CourseChallengeReviewQueue.tsx")
  assert.match(queue, /isOwnSubmission/)
  assert.match(queue, /You cannot approve your own Course Challenge submission\./)
  assert.match(queue, /disabled=\{busy \|\| submission\.isOwnSubmission/)
  assert.match(queue, /disabled=\{busy\} onClick=\{\(\) => void onReview\(submission, "reject"\)/)
})

test("cross-admin approval and retry protections remain in the same secured path", async () => {
  const sql = await read("course_challenges_self_approval_guard.sql")
  const api = await read("app/api/admin/course-challenges/route.ts")
  assert.match(sql, /is_current_user_site_admin\(\)/)
  assert.match(sql, /for update/)
  assert.match(sql, /already_processed/)
  assert.match(api, /approve_course_challenge_submission/)
  assert.match(api, /status: 403/)
})

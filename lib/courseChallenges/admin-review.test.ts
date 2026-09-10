import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const root = new URL("../../", import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), "utf8")

test("admin review hotfix keeps review actions, mode selection, and private history in one queue", () => {
  const api = read("app/api/admin/course-challenges/route.ts")
  const queue = read("components/admin/course-challenges/CourseChallengeReviewQueue.tsx")
  assert.match(api, /return_to_review/)
  assert.match(api, /p_admin_verified_game_mode/)
  assert.match(api, /course_challenge_submission_review_events/)
  assert.match(api, /course_challenge_submissions.*proof_image_sha256/)
  assert.match(queue, /includeRejected/)
  assert.match(queue, /PAST CARDS/)
  assert.match(queue, /possibleDuplicate/)
  assert.match(queue, /MULTIPLAYER proof required/)
})

test("admin review migration is additive and retry-safe", () => {
  const sql = read("course_challenges_admin_review_hotfix.sql")
  assert.match(sql, /add column if not exists/i)
  assert.match(sql, /unique \(submission_id, notification_kind\)/i)
  assert.match(sql, /for update/i)
  assert.match(sql, /return_course_challenge_submission_to_review/i)
  assert.match(sql, /submission_id uuid not null references public\.course_challenge_submissions/i)
  assert.doesNotMatch(sql, /delete from public\.course_challenge_submissions/i)
})

test("review desk and site-wide alert use the same protected queue", () => {
  const desk = read("app/admin/course-challenges/review-desk/page.tsx")
  const alert = read("components/admin/CourseChallengePendingAlert.tsx")
  const submissions = read("app/api/course-challenges/submissions/route.ts")
  assert.match(desk, /CourseChallengeReviewQueue/)
  assert.match(alert, /\/api\/admin\/course-challenges\?summary=1/)
  assert.match(alert, /course-challenge-dismissed-latest/)
  assert.match(alert, /CC REVIEWS/)
  assert.match(submissions, /DISCORD_WEBHOOK_COURSE_CHALLENGE_REVIEW/)
  assert.match(submissions, /notification_kind: "discord_review_needed"/)
})

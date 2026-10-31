import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { allowedDiscordEvidenceUrl, discordEvidenceExtension, nextIncompleteCourseChallengeLevel } from "./discordHandoff.ts"

test("selects the first incomplete regular Level without changing challenge rules", () => {
  assert.equal(nextIncompleteCourseChallengeLevel([]), 1)
  assert.equal(nextIncompleteCourseChallengeLevel([1, 2]), 3)
  assert.equal(nextIncompleteCourseChallengeLevel([1, 2, 3, 4, 5]), null)
})

test("accepts only Discord-hosted HTTPS evidence", () => {
  assert.equal(allowedDiscordEvidenceUrl("https://cdn.discordapp.com/attachments/1/2/card.png"), true)
  assert.equal(allowedDiscordEvidenceUrl("https://media.discordapp.net/attachments/1/2/card.jpg"), true)
  assert.equal(allowedDiscordEvidenceUrl("http://cdn.discordapp.com/attachments/1/2/card.png"), false)
  assert.equal(allowedDiscordEvidenceUrl("https://example.com/card.png"), false)
})

test("uses stable image extensions", () => {
  assert.equal(discordEvidenceExtension("image/png"), "png")
  assert.equal(discordEvidenceExtension("image/webp"), "webp")
  assert.equal(discordEvidenceExtension("image/jpeg"), "jpg")
})

test("internal handoff is signed, canonical, idempotent, and review-only", () => {
  const route = readFileSync(new URL("../../app/api/internal/course-challenges/review-submissions/route.ts", import.meta.url), "utf8")
  const migration = readFileSync(new URL("../../supabase/migrations/20261002160906_course_challenge_discord_review_handoff.sql", import.meta.url), "utf8")
  assert.match(route, /verifyScorecardBridgeRequest/)
  assert.match(route, /resolveCanonicalDiscordPlayerResult/)
  assert.match(route, /CANONICAL_PLAYER_NOT_FOUND/)
  assert.match(route, /AMBIGUOUS_PLAYER_IDENTITY/)
  assert.match(route, /source_idempotency_key/)
  assert.match(route, /status: "needs_review"/)
  assert.doesNotMatch(route, /approve_course_challenge_submission/)
  assert.match(migration, /create unique index if not exists course_challenge_submissions_source_idempotency_idx/i)
})

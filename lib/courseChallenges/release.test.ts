import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { audienceForCanonicalPlayer, eligibleRoundDate } from "./release.ts"

test("Course Challenge tester audience requires canonical player identity and approved tester status", () => {
  const canonicalPlayerId = "11111111-1111-1111-1111-111111111111"

  assert.equal(audienceForCanonicalPlayer(canonicalPlayerId, true), "tester")
  assert.equal(audienceForCanonicalPlayer(canonicalPlayerId, false), "public")
  assert.equal(audienceForCanonicalPlayer("", true), "public")
})

test("Course Challenge release source has no separate tester identity allowlist", async () => {
  const source = await readFile(new URL("./release.ts", import.meta.url), "utf8")

  assert.doesNotMatch(source, /COURSE_CHALLENGES_TESTER_(?:EMAILS|IDS)/)
  assert.doesNotMatch(source, /email/i)
})

test("Course Challenge server and submission routes use the canonical site-access identity", async () => {
  const serverSource = await readFile(new URL("./server.ts", import.meta.url), "utf8")
  const submissionSource = await readFile(new URL("../../app/api/course-challenges/submissions/route.ts", import.meta.url), "utf8")

  assert.match(serverSource, /get_current_site_access/)
  assert.match(serverSource, /canonical_player_id/)
  assert.match(submissionSource, /identity\.playerId/)
  assert.doesNotMatch(submissionSource, /audienceForUser|user\.email/)
})

test("release dates remain configurable for tester and public audiences", () => {
  const previousTestingDate = process.env.COURSE_CHALLENGES_TESTING_START_DATE
  const previousPublicDate = process.env.COURSE_CHALLENGES_PUBLIC_LAUNCH_DATE

  try {
    process.env.COURSE_CHALLENGES_TESTING_START_DATE = "2026-09-09"
    process.env.COURSE_CHALLENGES_PUBLIC_LAUNCH_DATE = "2026-09-12"

    assert.deepEqual(eligibleRoundDate("2026-09-08", "tester"), {
      allowed: false,
      reason: "This scorecard predates the testing date.",
    })
    assert.deepEqual(eligibleRoundDate("2026-09-09", "tester"), { allowed: true, reason: null })
    assert.deepEqual(eligibleRoundDate("2026-09-11", "public"), {
      allowed: false,
      reason: "This scorecard predates the public launch date.",
    })
  } finally {
    if (previousTestingDate === undefined) delete process.env.COURSE_CHALLENGES_TESTING_START_DATE
    else process.env.COURSE_CHALLENGES_TESTING_START_DATE = previousTestingDate
    if (previousPublicDate === undefined) delete process.env.COURSE_CHALLENGES_PUBLIC_LAUNCH_DATE
    else process.env.COURSE_CHALLENGES_PUBLIC_LAUNCH_DATE = previousPublicDate
  }
})

import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

test("player Handicap route is GET-only and uses the current authenticated identity", async () => {
  const source = await readFile("app/api/handicap/me/route.ts", "utf8")
  assert.match(source, /export async function GET\(\)/)
  assert.match(source, /readCurrentPlayerHandicap/)
  assert.doesNotMatch(source, /searchParams|params|playerId|canonical_player_id:/)
  assert.doesNotMatch(source, /export async function (POST|PUT|PATCH|DELETE)/)
})

test("player UI does not expose private review evidence or unofficial indexes", async () => {
  const source = await readFile("app/handicap/page.tsx", "utf8")
  assert.match(source, /NOT YET PUBLISHED/)
  assert.match(source, /approved published Handicap information/)
  assert.doesNotMatch(source, /review_evidence|source_provenance|handicap_rounds/)
})

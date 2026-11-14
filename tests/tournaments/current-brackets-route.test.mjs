import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const route = await readFile(new URL("../../app/tournaments/[slug]/page.tsx", import.meta.url), "utf8")

test("Current Brackets uses the authoritative read-only tournament records", () => {
  assert.match(route, /const TOURNAMENT_SLUG = "5-4-3-2-1"/u)
  assert.match(route, /from\("tournaments"\)/u)
  assert.match(route, /from\("tournament_rounds"\)/u)
  assert.match(route, /from\("tournament_matches"\)/u)
  assert.match(route, /from\("players"\)/u)
  assert.doesNotMatch(route, /insert\(|update\(|upsert\(|delete\(/u)
})

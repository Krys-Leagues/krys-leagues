import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const page = fs.readFileSync(new URL("../app/doubles-standings/page.tsx", import.meta.url), "utf8")

test("public Doubles standings retain the approved historical read path", () => {
  assert.match(page, /doubles_historical_public_standings/)
  assert.match(page, /Historical Doubles · Season/)
  assert.match(page, /Holes Won/)
  assert.doesNotMatch(page, /\.from\("doubles_historical_public_standings"\)[\s\S]*\.(insert|update|upsert|delete)\(/)
})

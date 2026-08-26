import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) => readFileSync(path, "utf8")

test("Historical Pro exposes all partial pairing records for review", () => {
  const page = read("app/admin/import/pro/page.tsx")
  assert.match(page, /Review partial pairing records/)
  assert.match(page, /Needs review only/)
  assert.match(page, /Previous/)
  assert.match(page, /Next/)
  assert.match(page, /Save reviewed decision/)
  assert.match(page, /historical-pro-review-v2-partial-pairings/)
  assert.match(page, /UNKNOWN \/ NEEDS LATER REVIEW/)
  assert.match(page, /Items marked UNKNOWN \/ NEEDS LATER REVIEW remain excluded/)
})

test("Historical Pro partial review preserves source values and evidence", () => {
  const page = read("app/admin/import/pro/page.tsx")
  assert.match(page, /activePartialPairing\.playerAExactName/)
  assert.match(page, /activePartialPairing\.playerBExactName/)
  assert.match(page, /activePlayerARow\?\.easyScore/)
  assert.match(page, /activePlayerBRow\?\.hardScore/)
  assert.match(page, /effectiveTextColor/)
  assert.match(page, /sourceASourceCells|playerASourceCells/)
  assert.match(page, /sourceUrl/)
  assert.match(page, /no scores were committed/i)
})

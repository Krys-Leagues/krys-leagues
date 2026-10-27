import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const page = readFileSync("app/majors/[slug]/championship/page.tsx", "utf8")
const records = readFileSync("components/records/PublicAllTimeRecordsPage.tsx", "utf8")

test("Masters showcase is finalization-gated and uses existing official tables", () => {
  assert.match(page, /major_final_placements/)
  assert.match(page, /is_finalized === true/)
  assert.match(page, /major_player_scorecards/)
  assert.match(page, /major_player_scorecard_holes/)
  assert.match(page, /Final leaderboard is awaiting authorized finalization/)
})

test("main leaderboard area links to the Masters championship showcase", () => {
  assert.match(records, /href="\/majors\/masters\/championship"/)
})

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) => readFileSync(path, "utf8")

test("All-Time batch scorecard uses the compact reusable player-row layout", () => {
  const page = read("app/admin/records/backfill/page.tsx")
  const grid = read("components/admin/records/CompactScorecardGrid.tsx")

  assert.match(page, /CompactScorecardGrid/)
  assert.match(grid, /data-scorecard-layout="compact-players-by-row"/)
  assert.match(grid, /FRONT 9/)
  assert.match(grid, /BACK 9/)
  assert.match(grid, /data-hole-index/)
  assert.match(grid, /data-player-index/)
  assert.match(grid, /focusCell/)
})

test("All-Time batch page keeps the protected batch RPCs", () => {
  const page = read("app/admin/records/backfill/page.tsx")
  assert.match(page, /preview_all_time_late_backfill_batch/)
  assert.match(page, /record_all_time_late_backfill_batch/)
  assert.match(page, /p_confirmation_token/)
})

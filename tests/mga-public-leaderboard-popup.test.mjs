import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"
import { formatPublicMGAScore, normalizePublicMGAStandings } from "../lib/mgaPublicLeaderboard.ts"

test("public standings preserve canonical names, DB ranks, four rounds, totals, negatives, and missing rounds", () => {
  const rows = normalizePublicMGAStandings([
    { position: 1, screen_name: "Exact_Name", r1: -29, r2: null, r3: 0, r4: null, combined: -29 },
    { position: 1, screen_name: "Tied Player", r1: -29, r2: null, r3: null, r4: null, combined: -29 },
  ])

  assert.equal(rows[0].screen_name, "Exact_Name")
  assert.equal(rows[0].position, 1)
  assert.deepEqual([rows[0].r1, rows[0].r2, rows[0].r3, rows[0].r4, rows[0].combined], [-29, null, 0, null, -29])
  assert.equal(rows[1].position, rows[0].position, "tie positions come from the authoritative database reader")
  assert.deepEqual([formatPublicMGAScore(rows[0].r1), formatPublicMGAScore(rows[0].r2), formatPublicMGAScore(rows[0].r3)], ["-29", "—", "E"])
})

test("hub popup calls only the public verified-results reader and refreshes while open", async () => {
  const source = await readFile(new URL("../components/announcements/MgaPublicLeaderboardPopup.tsx", import.meta.url), "utf8")
  assert.match(source, /scoring_studio_public_leaderboard_v1/)
  assert.match(source, /p_slug: MGA_STUDIO_SLUG/)
  assert.match(source, /window\.setInterval\(\(\) => void loadStandings\(\), REFRESH_INTERVAL_MS\)/)
  assert.doesNotMatch(source, /scoring_studio_submit|scoring-studio-evidence|player_submissions_enabled/)
  assert.match(source, /role="dialog" aria-modal="true"/)
})

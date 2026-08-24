import test from "node:test"
import assert from "node:assert/strict"
import { discoverMonthlyPublicHtml, validateMonthlySourceUrl } from "./monthlyPublicSource.ts"

test("discovers optional status evidence and both result levels while ignoring Overall Leaders", () => {
  const html = `<h1>2026 July</h1><span>Completed</span><table aria-label="Overall Leaders - 2026 July"><tr><th>Player</th><th>Courses Played</th></tr></table><table aria-label="Master Leaders"><tr><th>Player</th><th>Courses Played</th><th>Total Strokes</th></tr></table><table aria-label="Tourist Trap"><tr><th>Player</th><th>Score</th><th>HN1</th><th>Points</th></tr></table><a title="Previous" href="/ords/r/wmgt/monthly/home?period=1">x</a>`
  const result = discoverMonthlyPublicHtml(html, "https://dqvo64m7q9ujvqa-wmgt23ai.adb.us-ashburn-1.oraclecloudapps.com/ords/r/wmgt/monthly/home", "2026-08-23T00:00:00.000Z")
  assert.equal(result.sourceSaysCompleted, true)
  assert.equal(result.divisionStandingsFound, 1)
  assert.equal(result.courseTablesFound, 1)
})

test("source URL validation cannot escape the approved public Monthly application", () => {
  assert.throws(() => validateMonthlySourceUrl("https://example.com/private"))
})

import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

test("handicap admin page uses existing server-side site-admin authorization", async () => {
  const source = await readFile("app/admin/handicaps/page.tsx", "utf8")
  assert.match(source, /authorizeSiteAdminMutation/)
  assert.match(source, /if \(!authorization\.authorized\) redirect\("\/admin"\)/)
  assert.match(source, /readAdminCourseReview\(adminDataClient, indexReview\.run\.id\)/)
  assert.match(source, /readAdminIndexReview\(adminDataClient\)/)
  assert.doesNotMatch(source, /readLocalAdminIndexReview/)
  assert.doesNotMatch(source, /phase104\/index_snapshot_import_rows\.csv/)
})

test("handicap admin page is read-only and exposes no mutation controls", async () => {
  const source = await readFile("app/admin/handicaps/page.tsx", "utf8")
  assert.doesNotMatch(source, /<button\b/)
  assert.doesNotMatch(source, /fetch\(/)
  assert.doesNotMatch(source, /\/api\//)
  assert.match(source, /approval, import, rebuild, recalculation, or publish actions are exposed/)
})

test("player and course selections navigate directly to their rendered detail panels", async () => {
  const source = await readFile("app/admin/handicaps/page.tsx", "utf8")
  const styles = await readFile("app/admin/handicaps/page.module.css", "utf8")
  assert.match(source, /hrefWith\(\{ course: course\.code, search \}, "course-inspection"\)/)
  assert.match(source, /hrefWith\(\{ player: row\.canonicalPlayerId, filter, sort, direction, search \}, "player-inspection"\)/)
  assert.match(source, /id="course-inspection"/)
  assert.match(source, /id="player-inspection"/)
  assert.match(styles, /scroll-margin-top/)
})

test("technical source and security boundary panels are not rendered", async () => {
  const source = await readFile("app/admin/handicaps/page.tsx", "utf8")
  assert.doesNotMatch(source, /title="Source boundary"/)
  assert.doesNotMatch(source, /title="Security boundary"/)
  assert.doesNotMatch(source, /Weekly personal use/)
  assert.doesNotMatch(source, /THE_WEEKLY evidence is not eligible/)
})

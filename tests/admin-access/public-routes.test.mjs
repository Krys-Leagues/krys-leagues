import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { test } from "node:test"

const root = process.cwd()
const requiredRoutes = [
  "app/page.tsx",
  "app/our-mission/page.tsx",
  "app/course-challenges/page.tsx",
  "app/course-challenges/[slug]/page.tsx",
  "app/kwt/history/page.tsx",
  "app/stroke/page.tsx",
  "app/match-play/page.tsx",
  "app/players/page.tsx",
]

test("required public route contracts exist", () => {
  for (const route of requiredRoutes) assert.equal(existsSync(`${root}/${route}`), true, route)
})

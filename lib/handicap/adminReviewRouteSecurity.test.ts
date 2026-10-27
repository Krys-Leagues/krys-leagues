import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const route = "app/api/admin/handicaps/review/route.ts"

test("handicap review API authorizes before any read and is GET-only", async () => {
  const source = await readFile(route, "utf8")
  assert.match(source, /export async function GET\(\)/)
  assert.match(source, /const authorization = await authorizeSiteAdminMutation\(\)/)
  assert.match(source, /if \(!authorization\.authorized\) return authorization\.response/)
  assert.ok(source.indexOf("authorizeSiteAdminMutation") < source.indexOf("readHandicapAdminProductionData"))
  assert.doesNotMatch(source, /export async function (POST|PUT|PATCH|DELETE)/)
  assert.doesNotMatch(source, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/)
})

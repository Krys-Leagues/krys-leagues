import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const protectedPlayerPages = [
  "components/admin/ManagedLeaguePlayersPage.tsx",
  "app/admin/career/page.tsx",
  "app/admin/doubles/teams/page.tsx",
  "app/admin/match/setup/page.tsx",
  "app/admin/match/transition/page.tsx",
  "app/admin/player-matching/page.tsx",
  "app/admin/players/[id]/page.tsx",
  "app/admin/players/[id]/play-profile.tsx",
  "app/admin/players/merge/page.tsx",
  "app/admin/players/page.tsx",
  "app/admin/pro/schedule/page.tsx",
  "app/admin/pyp/setup/page.tsx",
  "app/admin/pyp/transition/page.tsx",
  "app/admin/records/backfill/page.tsx",
  "app/admin/records/climbers/page.tsx",
  "app/admin/records/combined/page.tsx",
  "app/admin/records/history/page.tsx",
  "app/admin/solo/setup/page.tsx",
  "app/admin/stroke/setup/page.tsx",
  "app/admin/stroke/transition/page.tsx",
]

test("admin player selectors use the protected server directory instead of browser table reads", async () => {
  for (const file of protectedPlayerPages) {
    const source = await readFile(file, "utf8")
    assert.doesNotMatch(source, /\.from\(["']players["']\)/, file)
    assert.match(source, /loadProtectedAdminPlayer/, file)
  }
})

test("admin players endpoint authorizes before its privileged player read", async () => {
  const source = await readFile("app/api/admin/players/route.ts", "utf8")
  const authorization = source.indexOf("await authorizeSiteAdminMutation()")
  const privilegedRead = source.indexOf('.from("players")')

  assert.ok(authorization >= 0)
  assert.ok(privilegedRead > authorization)
  assert.match(source, /discord_username/)
  assert.match(source, /discord_avatar/)
  assert.match(source, /division/)
  assert.match(source, /Cache-Control.*no-store/)
})

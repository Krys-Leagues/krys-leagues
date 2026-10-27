import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const ownerRoute = readFileSync("app/api/players/[id]/avatar-submission/route.ts", "utf8")
const adminRoute = readFileSync("app/api/admin/avatar-submissions/route.ts", "utf8")
const proposal = readFileSync("supabase/proposals/20261023_player_avatar_submissions.proposed.sql", "utf8")
const ownerUi = readFileSync("components/PlayerAvatarSubmission.tsx", "utf8")

test("owner avatar submission binds auth to the canonical route player and validates uploads", () => {
  assert.ok(ownerRoute.indexOf("await session.auth.getUser()") < ownerRoute.indexOf("resolveCanonicalSessionPlayer(service"))
  assert.match(ownerRoute, /identity\.playerId !== playerId/)
  assert.match(ownerRoute, /isSupportedPlayerAvatar\(contentType, bytes\.byteLength\)/)
  assert.match(ownerRoute, /hasSupportedPlayerAvatarSignature\(contentType, bytes\)/)
  assert.match(ownerRoute, /player_avatar_submissions/)
  assert.match(ownerRoute, /status: "PENDING"/)
  assert.match(ownerUi, /SUBMIT AVATAR/)
  assert.match(ownerUi, /current avatar is not changed until approval/)
})

test("avatar review is admin-only and private until approval", () => {
  assert.ok(adminRoute.indexOf("authorizeSiteAdminMutation()") < adminRoute.indexOf("createScorecardServiceClient()"))
  assert.match(adminRoute, /createSignedUrl/)
  assert.match(adminRoute, /player-avatars/)
  assert.match(adminRoute, /eq\("status", "PENDING"\)/)
  assert.match(proposal, /public = false/)
  assert.match(proposal, /revoke all on public\.player_avatar_submissions from anon, authenticated/)
  assert.match(proposal, /status in \('UPLOADING', 'PENDING', 'APPROVED', 'REJECTED'\)/)
})

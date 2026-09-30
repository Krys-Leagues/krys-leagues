import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

function read(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
}

test("successful Discord player login opens the protected personalized dashboard", () => {
  const callback = read("app/auth/callback/page.tsx")
  const accessDenied = read("app/access-denied/AccessDeniedActions.tsx")
  const adminLayout = read("app/admin/layout.tsx")

  assert.match(callback, /router\.replace\("\/player-dashboard"\)/)
  assert.match(accessDenied, /router\.replace\("\/player-dashboard"\)/)
  assert.match(adminLayout, /router\.replace\("\/player-dashboard"\)/)
  assert.doesNotMatch(callback, /router\.replace\("\/dashboard"\)/)
  assert.match(read("app/dashboard/page.tsx"), /redirect\("\/player-dashboard"\)/)
})

test("protected membership data paths replace browser-direct membership reads", () => {
  const publicProfile = read("app/players/[id]/page.tsx")
  const publicRoute = read("app/api/players/public-memberships/route.ts")
  const publicServer = read("lib/publicProfiles/server.ts")
  const adminPlayers = read("app/api/admin/players/route.ts")
  const adminConsumers = [
    read("app/admin/career/page.tsx"),
    read("app/admin/players/[id]/page.tsx"),
    read("app/admin/players/[id]/play-profile.tsx"),
  ]

  assert.match(publicProfile, /fetch\(`\/api\/players\/public-memberships\?playerId=/)
  assert.doesNotMatch(publicProfile, /from\("player_league_memberships"\)/)
  assert.match(publicRoute, /loadPublicProfileMemberships/)
  assert.match(publicServer, /get_public_player_canonical_identity/)
  assert.match(publicServer, /from\("player_league_memberships"\)/)
  assert.match(adminPlayers, /select\("id, player_id, league_type, season_number, division"\)/)
  for (const consumer of adminConsumers) {
    assert.match(consumer, /loadProtectedAdminPlayerDirectory/)
    assert.doesNotMatch(consumer, /from\("player_league_memberships"\)/)
  }
})

test("admin navigation never opens managed Stroke pages without required context", () => {
  const commandCenter = read("app/admin/command-center/page.tsx")
  const transition = read("app/admin/stroke/transition/page.tsx")
  const legacyResults = read("app/admin/results/page.tsx")

  assert.doesNotMatch(commandCenter, /href: "\/admin\/stroke\/(?:setup|results|standings)"/)
  assert.match(commandCenter, /href: "\/admin\/stroke\/season"/)
  assert.match(commandCenter, /href: "\/admin\/stroke\/manage"/)
  assert.match(transition, /\/admin\/stroke\/standings\?seasonId=/)
  assert.match(legacyResults, /href="\/admin\/stroke\/manage"/)
})

test("the player identity hub exposes the existing protected Discord matcher", () => {
  const identityHub = read("app/admin/player-identity/page.tsx")

  assert.match(identityHub, /href="\/admin\/player-matching"/)
  assert.doesNotMatch(identityHub, /<strong>Discord Links<\/strong>\s*<span>Coming Soon<\/span>/)
})

test("admin navigation does not expose known missing destinations", () => {
  const admin = read("app/admin/page.tsx")
  const pro = read("app/admin/pro/page.tsx")

  assert.doesNotMatch(admin, /href: "\/admin\/(?:race|awards)"/)
  assert.match(pro, /href="\/amateur-pro-standings"/)
  assert.doesNotMatch(pro, /href="\/pro-standings"/)
})

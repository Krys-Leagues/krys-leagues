import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) => readFileSync(path, "utf8")

test("Stroke Play restores the historical public board beneath the approved artwork", () => {
  const page = read("app/stroke/page.tsx")
  const board = read("components/publicLeague/PublicLeagueBoard.tsx")
  const css = read("components/publicLeague/PublicLeagueBoard.module.css")
  const route = read("app/api/public/league-board/route.ts")
  const server = read("lib/publicLeague/server.ts")

  assert.match(page, /PublicLeagueBoard/)
  assert.match(page, /kind="stroke"/)
  assert.match(board, /fetch\(`\/api\/public\/league-board\?kind=/)
  assert.match(board, /CURRENT STANDINGS/)
  assert.match(board, /player1_score/)
  assert.match(css, /@media \(max-width: 620px\)/)
  assert.match(route, /loadPublicLeagueBoard/)
  assert.match(server, /from\("schedule"\)/)
  assert.match(server, /from\("results"\)/)
  assert.match(server, /from\("season_standings"\)/)
  assert.match(server, /get_public_player_canonical_identity/)
  assert.doesNotMatch(board, /service_role|SUPABASE_SECRET_KEY/)
})

test("guest public surfaces do not show the optional sign-in overlay", () => {
  const welcome = read("components/auth/OptionalSignInWelcome.tsx")
  assert.match(welcome, /PUBLIC_STROKE_PATHS/)
  assert.match(welcome, /\/stroke/)
  assert.match(welcome, /\/standings/)
  assert.match(welcome, /setWelcomeState\("settled"\)/)
})

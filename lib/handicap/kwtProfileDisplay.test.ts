import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

const root = process.cwd()

test("public profile keeps KWT stroke display off the player profile", () => {
  const hero = readFileSync(join(root, "components", "PlayerProfileHero.tsx"), "utf8")
  const profile = readFileSync(join(root, "app", "players", "[id]", "page.tsx"), "utf8")
  const route = readFileSync(join(root, "app", "api", "players", "[id]", "handicap", "route.ts"), "utf8")

  assert.doesNotMatch(hero, /KWT SHOTS/)
  assert.doesNotMatch(profile, /kwtShots=|buildKwtShotsDisplay/)
  assert.match(route, /get_public_published_handicap_for_player/)
  assert.doesNotMatch(route, /course_rating|slope|rating_snapshot|source_round/i)
})

test("player-facing profile does not hardcode an event, course, rating or slope", () => {
  const profile = readFileSync(join(root, "app", "players", "[id]", "page.tsx"), "utf8")
  assert.doesNotMatch(profile, /KWTS15W1|Raptor Cliffs|8\.515|rating_snapshot/i)
})

import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"
import { normalizeAuthoritativeDoublesPlayers, normalizeOptionalSeasonId, validateDoublesPlayerIds, validateDoublesTeamSelection } from "./doublesTeamBuilder.ts"

const playerOne = "11111111-1111-4111-8111-111111111111"
const playerTwo = "22222222-2222-4222-8222-222222222222"
const roster = normalizeAuthoritativeDoublesPlayers([
  { id: playerOne, display_name: "Exact Screen One" },
  { id: playerTwo, display_name: "Exact Screen Two" },
])

test("authoritative Doubles roster returns the player list used by the team builder", () => {
  const page = fs.readFileSync(new URL("../app/admin/doubles/teams/page.tsx", import.meta.url), "utf8")
  const route = fs.readFileSync(new URL("../app/api/admin/doubles/roster/route.ts", import.meta.url), "utf8")
  assert.match(route, /rpc\("list_doubles_admin_roster"/)
  assert.match(page, /normalizeAuthoritativeDoublesPlayers\(data\.players\)/)
  assert.doesNotMatch(page, /loadProtectedAdminPlayers|\/api\/admin\/players/)
})

test("optional season IDs normalize safely before UUID-typed Doubles paths", () => {
  const validSeasonId = "33333333-3333-4333-8333-333333333333"

  assert.equal(normalizeOptionalSeasonId(""), null)
  assert.equal(normalizeOptionalSeasonId("   \t"), null)
  assert.equal(normalizeOptionalSeasonId(validSeasonId), validSeasonId)
})

test("Doubles roster and assignment flows normalize season IDs before RPC calls", () => {
  const page = fs.readFileSync(new URL("../app/admin/doubles/teams/page.tsx", import.meta.url), "utf8")
  const route = fs.readFileSync(new URL("../app/api/admin/doubles/roster/route.ts", import.meta.url), "utf8")

  assert.match(page, /normalizeOptionalSeasonId\(seasonId\)/)
  assert.match(route, /normalizeOptionalSeasonId\(new URL\(request\.url\)\.searchParams\.get\("season_id"\)\)/)
  assert.match(route, /p_season_id: seasonId/)
  assert.doesNotMatch(page, /season_id=\$\{encodeURIComponent\(seasonId\)\}/)
})

test("selectors retain canonical UUIDs and exact screen names from the authoritative roster", () => {
  assert.deepEqual(roster, [
    { id: playerOne, display_name: "Exact Screen One" },
    { id: playerTwo, display_name: "Exact Screen Two" },
  ])
  const selection = validateDoublesTeamSelection(roster, playerOne, playerTwo)
  assert.deepEqual(selection, { ok: true, playerOneId: playerOne, playerTwoId: playerTwo })
})

test("blank, invalid, and duplicate player IDs are rejected before a team RPC", () => {
  const blank = validateDoublesPlayerIds("", playerTwo)
  const invalid = validateDoublesPlayerIds("not-a-uuid", playerTwo)
  const duplicate = validateDoublesPlayerIds(playerOne, playerOne)
  const unresolved = validateDoublesTeamSelection(roster, playerOne, "33333333-3333-4333-8333-333333333333")
  assert.equal(blank.ok, false)
  assert.equal(invalid.ok, false)
  assert.equal(duplicate.ok, false)
  assert.equal(unresolved.ok, false)
  if (!blank.ok) assert.match(blank.error, /valid Doubles roster players/)
  if (!invalid.ok) assert.match(invalid.error, /valid Doubles roster players/)
  if (!duplicate.ok) assert.match(duplicate.error, /distinct Doubles roster players/)
  if (!unresolved.ok) assert.match(unresolved.error, /not in the authoritative Doubles roster/)
})

test("a valid two-player team payload is accepted and the player source is not duplicated", () => {
  const selection = validateDoublesTeamSelection(roster, playerOne, playerTwo)
  assert.equal(selection.ok, true)
  assert.equal(new Set(roster.map((player) => player.id)).size, roster.length)
  assert.equal(roster[0]?.display_name, "Exact Screen One")
})

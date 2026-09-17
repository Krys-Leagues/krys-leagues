import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import { prepareMatchDiscordSnapshot, runMatchDiscordSendExclusive } from "./matchDiscord.ts"
import type { PublicMatchPayload } from "./publicMatch.ts"

const payload: PublicMatchPayload = {
  current: {
    season_number: 58,
    division_count: 2,
    standings: [
      { season_number: 58, division_number: 1, rank: null, starting_rank: 2, player_screen_name: "Beta", played: 0, wins: 0, losses: 0, draws: 0, points: 0, holes_won: 0 },
      { season_number: 58, division_number: 1, rank: null, starting_rank: 1, player_screen_name: "Alpha", played: 0, wins: 0, losses: 0, draws: 0, points: 0, holes_won: 0 },
      { season_number: 58, division_number: 2, rank: 1, starting_rank: 3, player_screen_name: "Gamma", played: 1, wins: 1, losses: 0, draws: 0, points: 3, holes_won: 8 },
    ],
    schedule: [
      { season_number: 58, division_number: 2, game_number: 1, player1_display_name: "Gamma", player2_display_name: "Delta", course: "Course B" },
      { season_number: 58, division_number: 1, game_number: 2, player1_display_name: "Beta", player2_display_name: "Alpha", course: "Course A2" },
      { season_number: 58, division_number: 1, game_number: 1, player1_display_name: "Alpha", player2_display_name: "Beta", course: "Course A1" },
    ],
  },
  historical_seasons: [],
  historical_standings: [],
  historical_matchups: [],
}

test("snapshot contains only the requested current Match division", () => {
  const snapshot = prepareMatchDiscordSnapshot(payload, 1)
  assert.equal(snapshot.season_number, 58)
  assert.equal(snapshot.division_number, 1)
  assert.deepEqual(snapshot.standings.map((row) => row.player_screen_name), ["Alpha", "Beta"])
  assert.deepEqual(snapshot.assignments.map((row) => row.game_number), [1, 2])
  assert.ok(snapshot.standings.every((row) => row.division_number === 1))
  assert.ok(snapshot.assignments.every((row) => row.division_number === 1))
})

test("snapshot reuses approved preseason and live rank behavior", () => {
  const preseason = prepareMatchDiscordSnapshot(payload, 1)
  assert.deepEqual(preseason.standings.map((row) => row.displayed_rank), [1, 2])

  const live = prepareMatchDiscordSnapshot(payload, 2)
  assert.equal(live.standings[0]?.displayed_rank, 1)
})

test("server guard rejects a duplicate in-flight send but permits a later resend", async () => {
  let releaseFirst = () => {}
  const first = runMatchDiscordSendExclusive("season-58-d1", () => new Promise<number>((resolve) => {
    releaseFirst = () => resolve(1)
  }))
  const duplicate = await runMatchDiscordSendExclusive("season-58-d1", async () => 2)
  assert.deepEqual(duplicate, { status: "in-flight" })
  releaseFirst()
  assert.deepEqual(await first, { status: "completed", value: 1 })
  assert.deepEqual(await runMatchDiscordSendExclusive("season-58-d1", async () => 3), { status: "completed", value: 3 })
})

test("Discord route is admin protected, reads authoritative public Match data, and returns safe fields", async () => {
  const source = await readFile("app/api/admin/match/discord/route.ts", "utf8")
  const auth = source.indexOf("await authorizeSiteAdminMutation()")
  const denial = source.indexOf("return authorization.response")
  const body = source.indexOf("await request.json()")
  assert.ok(auth >= 0 && denial > auth && body > denial)
  assert.match(source, /\.rpc\("get_public_match_play"\)/)
  assert.doesNotMatch(source, /\.from\(/)
  assert.doesNotMatch(source, /webhookUrl[,:]\s*webhookUrl/)
  assert.match(source, /seasonNumber:/)
  assert.match(source, /divisionNumber:/)
})

test("Discord destinations remain server-only and mapped by Match division", async () => {
  const serverSource = await readFile("lib/matchDiscordServer.ts", "utf8")
  const clientSource = await readFile("app/admin/match/results/page.tsx", "utf8")
  for (let division = 1; division <= 5; division += 1) {
    assert.match(serverSource, new RegExp(`DISCORD_WEBHOOK_MATCH_D${division}`))
  }
  assert.doesNotMatch(clientSource, /DISCORD_WEBHOOK|webhook/i)
  assert.match(clientSource, /selectedSeason\?\.is_active/)
  assert.match(clientSource, /onClick=\{\(\) => void handleDiscordSend\(division\)\}/)
  assert.doesNotMatch(clientSource, /useEffect\(\(\) => \{\s*void handleDiscordSend/)
})

test("public Match page has no Discord controls or send behavior", async () => {
  const source = await readFile("app/match-play/page.tsx", "utf8")
  assert.doesNotMatch(source, /SEND D\d TO DISCORD|api\/admin\/match\/discord|DISCORD_WEBHOOK/)
})

test("snapshot source contains required presentation fields and no private identifiers", async () => {
  const source = await readFile("lib/matchDiscordSnapshot.tsx", "utf8")
  assert.match(source, /MATCH DIVISION/)
  assert.match(source, /COURSE ASSIGNMENTS/)
  assert.match(source, /CURRENT STANDINGS/)
  assert.match(source, /RANK/)
  assert.match(source, /POINTS/)
  assert.match(source, /HW/)
  assert.doesNotMatch(
    source,
    /snapshot\.(?:email|auth_user_id|player_id|discord_id|admin_notes|private_metadata)/i,
  )
})

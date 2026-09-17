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
  assert.doesNotMatch(source, /webhook/i)
  assert.match(source, /\{ divisionNumber\?: unknown \}/)
  assert.doesNotMatch(source, /body[^\n]*(?:channel|token|apiUrl)/i)
  assert.match(source, /seasonNumber:/)
  assert.match(source, /divisionNumber:/)
  const successResponse = source.slice(source.indexOf("return NextResponse.json({\n    success: true"))
  assert.doesNotMatch(successResponse, /botToken|channelId|Authorization/)
})

test("Discord bot token and division channels remain server-only", async () => {
  const serverSource = await readFile("lib/matchDiscordServer.ts", "utf8")
  const routeSource = await readFile("app/api/admin/match/discord/route.ts", "utf8")
  const clientSource = await readFile("app/admin/match/results/page.tsx", "utf8")
  for (let division = 1; division <= 5; division += 1) {
    assert.match(
      serverSource,
      new RegExp(`${division}: "DISCORD_MATCH_D${division}_CHANNEL_ID"`),
    )
  }
  assert.match(serverSource, /process\.env\.DISCORD_BOT_TOKEN/)
  assert.match(serverSource, /Authorization: `Bot \$\{options\.botToken\}`/)
  assert.match(serverSource, /\/channels\/\$\{encodeURIComponent\(options\.channelId\)\}\/messages/)
  assert.doesNotMatch(serverSource, /webhook/i)
  assert.doesNotMatch(routeSource, /process\.env|discord\.com\/api/)
  assert.doesNotMatch(clientSource, /DISCORD_BOT_TOKEN|CHANNEL_ID|discord\.com\/api|webhook/i)
  assert.match(clientSource, /selectedSeason\?\.is_active/)
  assert.match(clientSource, /onClick=\{\(\) => void handleDiscordSend\(division\)\}/)
  assert.doesNotMatch(clientSource, /useEffect\(\(\) => \{\s*void handleDiscordSend/)
  const resultSaveFlow = clientSource.slice(
    clientSource.indexOf("async function handleSubmit"),
    clientSource.indexOf("async function handleDeleteResult"),
  )
  assert.doesNotMatch(resultSaveFlow, /handleDiscordSend|api\/admin\/match\/discord/)
})

test("Match manual-send feature contains no legacy webhook configuration", async () => {
  const legacyVariablePrefix = ["DISCORD", "WEBHOOK", "MATCH"].join("_")
  const files = [
    "app/api/admin/match/discord/route.ts",
    "app/admin/match/results/page.tsx",
    "lib/matchDiscord.ts",
    "lib/matchDiscordServer.ts",
    "lib/matchDiscordSnapshot.tsx",
  ]
  for (const file of files) {
    const source = await readFile(file, "utf8")
    assert.doesNotMatch(source, new RegExp(legacyVariablePrefix))
    assert.doesNotMatch(source, /webhookUrl|getMatchDiscordWebhook/i)
  }
})

test("validated D1 can resolve only the D1 server channel configuration", async () => {
  const serverSource = await readFile("lib/matchDiscordServer.ts", "utf8")
  const routeSource = await readFile("app/api/admin/match/discord/route.ts", "utf8")
  assert.match(serverSource, /1: "DISCORD_MATCH_D1_CHANNEL_ID"/)
  assert.match(serverSource, /process\.env\[MATCH_DISCORD_CHANNELS\[divisionNumber\]\]/)
  assert.match(routeSource, /getMatchDiscordChannelId\(divisionNumber\)/)
  assert.doesNotMatch(routeSource, /channelId[^\n]*body|body[^\n]*channelId/)
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
  assert.match(source, /PLAYED/)
  assert.match(source, /WINS/)
  assert.match(source, /LOSSES/)
  assert.match(source, /DRAWS/)
  assert.match(source, /POINTS/)
  assert.match(source, /HW/)
  assert.match(source, /justifyContent: "center"[\s\S]*?MATCH DIVISION/)
  assert.doesNotMatch(source, />P<|>W<|>L<|>D</)
  assert.doesNotMatch(
    source,
    /snapshot\.(?:email|auth_user_id|player_id|discord_id|admin_notes|private_metadata)/i,
  )
})

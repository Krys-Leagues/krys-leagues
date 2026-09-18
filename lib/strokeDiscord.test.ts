import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import {
  prepareStrokeDiscordSnapshot,
  runStrokeDiscordSendExclusive,
  strokeDiscordControlDivisions,
  type StrokeDiscordSource,
} from "./strokeDiscord.ts"

const source: StrokeDiscordSource = {
  season_number: 59,
  division_count: 4,
  standings: [
    { division_number: 1, slot_number: 1, player_screen_name: "WILMA_FINGERDOO", rank: 1, wins: 1, losses: 0, ties: 0, points: 3, strokes: -21 },
    { division_number: 1, slot_number: 2, player_screen_name: "PRINCESS_BANKSHOT", rank: 2, wins: 0, losses: 1, ties: 0, points: 0, strokes: -18 },
    { division_number: 2, slot_number: 1, player_screen_name: "D2 Player", rank: null, wins: 0, losses: 0, ties: 0, points: 0, strokes: 0 },
  ],
  assignments: [
    { division_number: 1, game_number: 1, player1_display_name: "WILMA_FINGERDOO", player2_display_name: "PRINCESS_BANKSHOT", course: "Quixote Valley Easy", player1_score: -21, player2_score: -18 },
    { division_number: 1, game_number: 2, player1_display_name: "PRINCESS_BANKSHOT", player2_display_name: "WILMA_FINGERDOO", course: "Block Haven Hard", player1_score: null, player2_score: null },
    { division_number: 2, game_number: 1, player1_display_name: "D2 Player", player2_display_name: "D2 Opponent", course: "Course Two", player1_score: null, player2_score: null },
  ],
}

test("current approved Stroke roster controls divisions independently of schedule rows", () => {
  assert.deepEqual(strokeDiscordControlDivisions("season-59", "season-59", 4), [1, 2, 3, 4])
  assert.deepEqual(strokeDiscordControlDivisions("season-59", "season-58", 4), [])
  assert.deepEqual(strokeDiscordControlDivisions("season-60", "season-60", 5), [1, 2, 3, 4, 5])
})

test("Stroke division snapshot preserves exact scores, names, and division isolation", () => {
  const snapshot = prepareStrokeDiscordSnapshot(source, 1, "division")
  assert.equal(snapshot.season_number, 59)
  assert.equal(snapshot.division_number, 1)
  assert.equal(snapshot.mode, "division")
  assert.deepEqual(snapshot.standings.map((row) => row.player_screen_name), ["WILMA_FINGERDOO", "PRINCESS_BANKSHOT"])
  assert.deepEqual(snapshot.assignments.map((row) => row.game_number), [1, 2])
  assert.equal(snapshot.assignments[0]?.player1_score, -21)
  assert.equal(snapshot.assignments[0]?.player2_score, -18)
  assert.equal(snapshot.assignments[0]?.completed, true)
  assert.equal(snapshot.assignments[1]?.completed, false)
  assert.ok(snapshot.assignments.every((row) => row.division_number === 1))
})

test("Stroke reminder includes only authoritative unplayed assignments", () => {
  const reminder = prepareStrokeDiscordSnapshot(source, 1, "reminder")
  assert.equal(reminder.mode, "reminder")
  assert.deepEqual(reminder.assignments.map((row) => row.game_number), [2])
  assert.ok(reminder.assignments.every((row) => !row.completed))
})

test("Stroke duplicate-send guard blocks only concurrent sends and permits a later resend", async () => {
  let release = () => {}
  const first = runStrokeDiscordSendExclusive("stroke-59-d1", () => new Promise<number>((resolve) => {
    release = () => resolve(1)
  }))
  assert.deepEqual(await runStrokeDiscordSendExclusive("stroke-59-d1", async () => 2), { status: "in-flight" })
  release()
  assert.deepEqual(await first, { status: "completed", value: 1 })
  assert.deepEqual(await runStrokeDiscordSendExclusive("stroke-59-d1", async () => 3), { status: "completed", value: 3 })
})

test("Stroke Discord route is admin-only and accepts no arbitrary destination", async () => {
  const route = await readFile("app/api/admin/stroke/discord/route.ts", "utf8")
  const auth = route.indexOf("await authorizeSiteAdminMutation()")
  const denied = route.indexOf("return authorization.response")
  const body = route.indexOf("await request.json()")
  assert.ok(auth >= 0 && denied > auth && body > denied)
  assert.match(route, /\{ divisionNumber\?: unknown \}/)
  assert.match(route, /\{ mode\?: unknown \}/)
  assert.doesNotMatch(route, /body[^\n]*(?:channel|token|apiUrl)/i)
  assert.doesNotMatch(route, /process\.env|discord\.com\/api/)
})

test("Stroke bot token and division channels remain server-only", async () => {
  const server = await readFile("lib/strokeDiscordServer.ts", "utf8")
  const client = await readFile("app/admin/stroke/results/page.tsx", "utf8")
  for (let division = 1; division <= 5; division += 1) {
    assert.match(server, new RegExp(`${division}: "DISCORD_STROKE_D${division}_CHANNEL_ID"`))
  }
  assert.match(server, /process\.env\.DISCORD_BOT_TOKEN/)
  assert.match(server, /Authorization: `Bot \$\{options\.botToken\}`/)
  assert.match(server, /\/channels\/\$\{encodeURIComponent\(options\.channelId\)\}\/messages/)
  assert.doesNotMatch(server, /webhook/i)
  assert.doesNotMatch(client, /DISCORD_BOT_TOKEN|CHANNEL_ID|discord\.com\/api|webhook/i)
})

test("Stroke image uses Stroke scoring terms and safe long-name columns", async () => {
  const snapshot = await readFile("lib/strokeDiscordSnapshot.tsx", "utf8")
  assert.match(snapshot, /STROKE DIVISION/)
  assert.match(snapshot, /COURSE ASSIGNMENTS/)
  assert.match(snapshot, /CURRENT STANDINGS/)
  assert.match(snapshot, /STROKES/)
  assert.match(snapshot, /assignment\.player1_score < assignment\.player2_score/)
  assert.match(snapshot, /assignment\.player2_score < assignment\.player1_score/)
  assert.match(snapshot, /cell\("18%", "flex-start"\)/)
  assert.match(snapshot, /wordBreak: "break-all"/)
  assert.doesNotMatch(snapshot, /ellipsis|substring\(|slice\(|holes_won|\bHW\b/)
})

test("Stroke admin controls are manual, current-season-only, and division-specific", async () => {
  const client = await readFile("app/admin/stroke/results/page.tsx", "utf8")
  assert.match(client, /strokeDiscordControlDivisions\(/)
  assert.match(client, /discordDivisions\.map\(\(division\) =>/)
  assert.match(client, /SEND D\$\{division\} TO DISCORD/)
  assert.match(client, /SEND D\$\{division\} GAME REMINDER/)
  assert.doesNotMatch(client, /SEND ALL/)
  const saveFlow = client.slice(client.indexOf("async function handleSubmit"), client.indexOf("async function handleDeleteResult"))
  assert.doesNotMatch(saveFlow, /handleDiscordSend|api\/admin\/stroke\/discord/)
})

test("public Stroke page remains free of Discord controls and result details", async () => {
  const publicPage = await readFile("app/stroke/page.tsx", "utf8")
  assert.doesNotMatch(publicPage, /SEND D\d TO DISCORD|api\/admin\/stroke\/discord|player1_score|player2_score/)
})

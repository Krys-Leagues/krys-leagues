import test from "node:test"
import assert from "node:assert/strict"
import { DOUBLES_NEXT_SEASON_SAMPLE, DOUBLES_NEXT_SEASON_TEST_CHANNEL_ID, isDoublesNextSeasonExperienceEnabled, renderDoublesNextSeasonArrangePreview, renderDoublesNextSeasonBoardSvg, sendDoublesNextSeasonExperiencePreview, sendDoublesNextSeasonMatchThreadPreview } from "./doublesNextSeasonDiscordPreview.ts"

test("next-season gate cannot activate for the current season", () => {
  assert.equal(isDoublesNextSeasonExperienceEnabled({ currentSeasonId: "63", targetSeasonId: "63", explicitEnable: "true" }), false)
  assert.equal(isDoublesNextSeasonExperienceEnabled({ currentSeasonId: "63", targetSeasonId: "64", explicitEnable: "false" }), false)
  assert.equal(isDoublesNextSeasonExperienceEnabled({ currentSeasonId: "63", targetSeasonId: "64", explicitEnable: "true" }), true)
})

test("Arrange preview is exact-four, team-based, and test-only", () => {
  const payload = renderDoublesNextSeasonArrangePreview()
  const json = JSON.stringify(payload)
  assert.match(json, /Fairway Foxes|Green Giants|Avery Morgan|Riley Chen/)
  assert.match(json, /PRIVATE FIXTURE CHAT/)
  assert.equal(payload.components?.[0].components.length, 4)
  assert.ok(payload.components?.[0].components.every((item) => item.disabled && item.custom_id.startsWith("preview:next-season:doubles:")))
  assert.doesNotMatch(json, /save_result|insert\(|update\(|current season/i)
})

test("board image is wide, team-based, and has no fake submit control or course names", () => {
  const svg = renderDoublesNextSeasonBoardSvg()
  assert.match(svg, /width="1600" height="900"/)
  assert.match(svg, /DOUBLES ELITE|Fairway Foxes|Green Giants|CURRENT STANDINGS/)
  assert.ok(svg.indexOf("HOME TEAM") < svg.indexOf("AWAY TEAM"))
  assert.doesNotMatch(svg, /SUBMIT SCORECARD|Pine Valley|Canyon Lakes/)
})

test("experience sender posts Arrange then board image only to Elite", async () => {
  const requests: Request[] = []
  const result = await sendDoublesNextSeasonExperiencePreview({ botToken: "secret" }, async (input, init) => {
    const request = new Request(String(input), init)
    requests.push(request)
    const body = request.headers.get("content-type")?.includes("multipart/form-data") ? { id: "board-2", channel_id: DOUBLES_NEXT_SEASON_TEST_CHANNEL_ID } : { id: "arrange-1", channel_id: DOUBLES_NEXT_SEASON_TEST_CHANNEL_ID }
    return new Response(JSON.stringify(body), { status: 200 })
  })
  assert.equal(requests.length, 2)
  assert.ok(requests.every((request) => request.url === `https://discord.com/api/v10/channels/${DOUBLES_NEXT_SEASON_TEST_CHANNEL_ID}/messages`))
  assert.equal(result.channelId, DOUBLES_NEXT_SEASON_TEST_CHANNEL_ID)
  assert.match(result.arrange.url, /arrange-1$/)
  assert.match(result.board.url, /board-2$/)
  assert.equal(DOUBLES_NEXT_SEASON_SAMPLE.division, "DOUBLES ELITE")
})

test("thread preview is explicit, exact-channel, and has one disabled submit action", async () => {
  const requests: Request[] = []
  const result = await sendDoublesNextSeasonMatchThreadPreview({ botToken: "secret" }, async (input, init) => {
    const request = new Request(String(input), init)
    requests.push(request)
    if (request.url.endsWith("/threads")) return new Response(JSON.stringify({ id: "thread-1", parent_id: DOUBLES_NEXT_SEASON_TEST_CHANNEL_ID }), { status: 200 })
    return new Response(JSON.stringify({ id: "starter-1", channel_id: "thread-1" }), { status: 200 })
  })
  assert.equal(requests.length, 2)
  assert.equal(result.channelId, DOUBLES_NEXT_SEASON_TEST_CHANNEL_ID)
  assert.match(result.starter.url, /starter-1$/)
  assert.equal(result.thread.id, "thread-1")
})
